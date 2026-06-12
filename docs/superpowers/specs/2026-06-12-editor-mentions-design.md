# Editor @mentions + Bluesky mention notifications — design

**Date:** 2026-06-12
**Status:** Approved, ready for plan
**Branch:** `mention-handling-and-notifications`

## Problem

When a writer references another atproto user in an article (e.g. `@jeremy.herve.bzh`),
nothing happens: the text is inert, the person is never notified, and on the public
article it isn't even a link. We want two things:

1. **Authoring:** typing `@` in the editor offers an autocomplete of atproto accounts and
   inserts a real, clickable mention.
2. **Notification:** the mentioned user gets a genuine Bluesky notification when the
   article is published.

The hard constraint that shapes the whole design: **Bluesky only generates a mention
notification when it indexes an `app.bsky.feed.post` whose `facets` contain an
`app.bsky.richtext.facet#mention`.** The AppView dispatches indexing per-collection and
has no generic "scan any record for facets" step — a mention facet stored inside our
custom `site.standard.document` record is structurally valid but **inert**. So the
notification must ride on the companion `app.bsky.feed.post` SkyPress already creates on
publish (`src/lib/publish/publisher.ts`, the 3-write flow). This matches how Leaflet
achieves mention notifications; pckt.blog (same shared `site.standard.document` lexicon)
does not do it at all.

## Scope

- **In scope:** mentions in the **article body** (the Gutenberg canvas); inline mention
  links in the published article; mention notifications via the companion Bluesky post;
  lede promoted into the Bluesky post body; a grapheme counter and confirm-dialog
  disclosure.
- **Out of scope (for now):** mentions in the lede field (stays plain text); a
  byte-offset richtext facet on the document record; linking mentions to SkyPress profiles
  (we link to Bluesky); notifications on *edit* (edits create no new post — Decision 0008,
  so no new notification).

## Decisions

1. **Inline link target → Bluesky profile** (`https://bsky.app/profile/<handle>`). Correct
   for *every* mentionable user (a mentioned account may have no SkyPress publication),
   needs no extra resolution, and matches the author-bio linkifier (Decision 0015).
   SkyPress-internal linking is a later enhancement.
2. **Mention surface → body only.** One autocomplete, one mechanism (Gutenberg). A
   `@handle` typed in the lede stays plain text.
3. **Storage → an explicit `skypress/mention` rich-text format that stores the DID
   inline.** "Who gets notified" must be unambiguous and intentional (the *don't surprise
   users* guardrail), and resolving the DID once at pick-time means publish can't
   mis-resolve or fail. We do **not** detect mentions by href pattern.
4. **Interop → inline anchors are the signal, plus a flat `mentions` list.** A byte-offset
   `richtext.facet` has no clean host: it needs flat text to index into, but our only flat
   text (`textContent`) lives on the **shared** `site.standard.document` (which we must not
   extend), and our own `blog.skypress.content.gutenberg` holds blocks, not flat text.
   Instead, the mention semantic already lives in the content as `<a … data-did>`, and we
   add an optional flat `mentions: [{ did, handle }]` to `blog.skypress.content.gutenberg`
   (additive, we own it) for cheap discovery. No new facet lexicon.

## Architecture

One source of truth — the inline `skypress/mention` in the block tree — with three derived
outputs, all computed at **publish** time.

### 1. Editor (Studio client island only — browser-only, React 18; constraints #3, #7)

**`skypress/mention` rich-text format** (`registerFormatType`). Serializes to:

```html
<a href="https://bsky.app/profile/{handle}" data-did="{did}">@{handle}</a>
```

Display text defaults to `@{handle}` (or the user's selected text if they had a
selection). This is the canonical mention representation.

**`@`-triggered autocompleter** (block-editor `Autocomplete` completer, `triggerPrefix:
'@'`):

- `options(query)` → a **debounced reuse of `src/lib/landing/actor-lookup.ts`** (same
  ~350ms debounce as `HandleStart.tsx`), hitting `getProfile` on `public.api.bsky.app`.
- Each option renders avatar + `displayName` + `@handle` (reusing the HandleStart card
  visual language).
- On select, `getOptionCompletion` inserts the `skypress/mention` format, baking in
  `href` + `data-did` from the looked-up profile.
- Lookup is reassurance, never a gate: no matches / network failure → "No matches", typed
  text stays plain. A mention can only be created from a resolved account, so every stored
  mention has a real DID.

### 2. Reader / render path

**`render.ts` (constraint #4 — fidelity-locked).** The mention is an inline `<a>` in a
block's rich-text content, so the serialized block now contains the `data-did` anchor and
`render.ts` output must match `@wordpress/blocks.serialize()` byte-for-byte. Confirm during
implementation whether existing inline-anchor pass-through already covers it; regardless,
**add a fidelity assertion** for a mention-bearing block to `render.test.ts`.

**`sanitize.ts` (constraint #6b).** The anchor + `href` are already allowed (links render
today); `href` stays constrained to `http(s)`. **Strip `data-did`** — the reader doesn't
need it (the link works off `href`), sanitisation runs *after* the fidelity comparison, and
public HTML shouldn't carry DIDs. Rendered mention is a plain profile link:
`<a href="https://bsky.app/profile/{handle}">@{handle}</a>`.

### 3. Publish (`src/lib/publish/`)

**Collect** — scan the normalized block tree for `skypress/mention` anchors → `{ did,
handle, displayText }`, **deduped by DID** (mention twice → cc once), first-appearance
order.

**Notification (companion `app.bsky.feed.post`).** `buildBskyPost` text becomes:

```
{title}\n\n{lede?}\n\ncc @a @b\n\n{articleUrl}
```

- Lede segment omitted when blank (no derived excerpt in the post body).
- `cc` line omitted when there are no mentions.
- Facets: the existing `#link` over the URL, **plus one `app.bsky.richtext.facet#mention`
  per handle** in the `cc` line (DID from inline). **All offsets recomputed against the
  final assembled string**, UTF-8, in one pass.
- Grapheme guard: post stays ≤300 graphemes; enforced in `publish()` as a backstop to the
  UI counter.

**Interop (document record).** Write the flat `mentions: [{ did, handle }]` list into the
`blog.skypress.content.gutenberg` content object (additive; no `version` bump). The inline
`data-did` anchors remain the positional semantic for SkyPress-aware readers.

### 4. UI (Studio)

- **Live grapheme counter** of the *assembled* post body (`title + lede + cc-line + URL`),
  via `Intl.Segmenter` (emoji = 1 grapheme, matching Bluesky's count). Warns near/over 300;
  publish disabled while over.
- **Confirm dialog disclosure.** Extend the existing confirmation to name the pinged
  accounts:
  > ⚠️ Publishing saves this article to your PDS and creates a public Bluesky post linking
  > to it. **It will notify @alice and @bob.** Everyone following you will see it.

  The list is the same deduped set as the `cc` line. No mentions → dialog reads as today.

## Data shapes

`blog.skypress.content.gutenberg` gains an optional field (additive):

```jsonc
{
  "version": 1,
  "blocks": [ /* … */ ],
  "mentions": [                       // NEW, optional
    { "did": "did:plc:…", "handle": "alice.bsky.social" }
  ]
}
```

Companion `app.bsky.feed.post` (mentions case):

```jsonc
{
  "$type": "app.bsky.feed.post",
  "text": "Title\n\nThe lede.\n\ncc @alice.bsky.social\n\nhttps://skypress.blog/@me/pub/3k…",
  "facets": [
    { "$type": "app.bsky.richtext.facet",
      "index": { "byteStart": /* @alice range */, "byteEnd": /* … */ },
      "features": [ { "$type": "app.bsky.richtext.facet#mention", "did": "did:plc:…" } ] },
    { "$type": "app.bsky.richtext.facet",
      "index": { "byteStart": /* URL range */, "byteEnd": /* … */ },
      "features": [ { "$type": "app.bsky.richtext.facet#link", "uri": "https://…" } ] }
  ],
  "embed": { /* unchanged app.bsky.embed.external card */ }
}
```

## Security

- **SSRF (constraint #6a):** the only network call is the autocomplete lookup, against the
  fixed `public.api.bsky.app` host (not a user-derived host) — `actor-lookup.ts` already
  uses it. No new user-derived fetch.
- **Sanitise (constraint #6b):** `data-did` stripped; anchor `href` constrained to
  `http(s)`. No `set:html`; mention render goes through the existing block render →
  sanitise pipeline.
- **No surprise pings:** mentions are explicit (picked from autocomplete) and disclosed in
  the confirm dialog before the post is created.

## Testing (TDD — failing test first)

- **Format:** `skypress/mention` round-trips to the `data-did` anchor; lookup-fail →
  plain text, no mention created.
- **Render fidelity (constraint #4):** mention-bearing block === `serialize()` output.
- **Sanitize:** anchor + `http(s)` href preserved; `data-did` stripped.
- **`collectMentions(blocks)`:** extracts `{ did, handle, displayText }`, dedupes by DID,
  preserves order.
- **`buildBskyPost`:** text assembly across {lede present/blank} × {mentions present/none};
  correct `cc` line; **facet byte-offsets exact on a multibyte (emoji/CJK) title+lede** so
  an offset regression can't hide; >300-grapheme post rejected.
- **Interop:** flat `mentions` list written into `blog.skypress.content.gutenberg`.
- **UI:** grapheme counter (`Intl.Segmenter`, emoji = 1) reflects assembled body; confirm
  dialog shows "It will notify @a and @b" with mentions, reads as today without.

## Docs

- Add `docs/decisions/NNNN-editor-mentions.md` recording: notifications must ride the
  companion post; inline-DID storage over href-detection; interop via inline anchors + flat
  `mentions` list (not a byte-offset facet).
- Update the `blog.skypress.content.gutenberg.json` lexicon description to mention the new
  optional `mentions` field.
- Update the confirm-dialog / publish contract comments in `PublishPanel.tsx` and
  `records.ts` (`buildBskyPost`) to reflect the lede + `cc` line in the post body.

## Risk

- **Fidelity surprise:** if `render.ts` reconstructs anchors (rather than passing rich-text
  content through), it may drop `data-did` and fail the fidelity lock. The new
  `render.test.ts` assertion catches this immediately; if so, extend the anchor renderer to
  preserve the attribute.
- **Grapheme counting drift:** `Intl.Segmenter` must match Bluesky's grapheme count; tested
  against emoji/CJK. The `publish()` backstop prevents a miscount from creating an
  over-limit post.
- **Autocomplete in the isolated block editor:** the completer must register cleanly inside
  the isolated-block-editor instance; verify the `Autocomplete.completers` extension point
  is exposed there during implementation.
