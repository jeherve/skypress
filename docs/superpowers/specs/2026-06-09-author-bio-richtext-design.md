# Author bio rich text (linkified bios) — design

**Date:** 2026-06-09
**Status:** Approved, ready for plan
**Branch:** `bio-links-from-facets`

## Problem

The public author page (`src/pages/[author]/index.astro`) renders the writer's Bluesky
bio (`app.bsky.actor.profile` → `description`) as plain text. On bsky.app the same bio
shows clickable links, `@mentions`, and `#tags` — but those are **not stored in the PDS
record**. The `description` field is plain text; profile records carry no `facets`
(unlike `app.bsky.feed.post`). Bluesky's client computes the links at render time by
running `RichText.detectFacets()` over the description.

We want the SkyPress author page to surface those same links.

## Scope

- **In scope:** author bios only.
- **Match Bluesky fully:** URLs (including bare domains), `@mentions`, `#tags`.
- **Out of scope (for now):** publication descriptions, display names, post excerpts.
  Article body links are unaffected — they are authored HTML anchors in the block tree,
  never facets, and already render correctly.

## Decisions

- **Detection: `@atproto/api`'s `RichText.detectFacetsWithoutResolution()`** — the exact
  code Bluesky's client runs, so detection fidelity (URL tokenizer, bare domains, mention
  and tag rules, trailing-punctuation handling) is guaranteed by construction. The
  `WithoutResolution` variant skips handle→DID resolution, which we don't need (we link by
  handle) and which keeps the path **network-free**.
- **Mention links target Bluesky** (`https://bsky.app/profile/<handle>`). Truest to
  "match Bluesky fully", needs no DID resolution, and avoids dumping readers on empty
  SkyPress author pages for people who only exist on Bluesky. (Internal linking can be a
  later enhancement.)
- **Tag links** target `https://bsky.app/hashtag/<tag>`.
- **No `set:html`.** The module returns structured segments; the Astro template renders
  them with auto-escaping. We never build or inject an HTML string.

## Architecture

### `src/lib/reader/rich-text.ts` (new, pure, no network)

```ts
export type BioSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string };

export function detectBioSegments(description: string): BioSegment[];
```

Builds `new RichText({ text: description })`, calls `detectFacetsWithoutResolution()`,
then walks `rt.segments()`:

- **Link** segment → `{ type: 'link', text: <as typed>, href: segment.link.uri }`.
  `detectFacets` already prepends `https://` to bare domains, so `example.com` →
  text `example.com`, href `https://example.com`.
- **Mention** segment → `href: https://bsky.app/profile/<handle>` (handle from the
  segment text with the leading `@` stripped).
- **Tag** segment → `href: https://bsky.app/hashtag/<tag>`.
- Anything else → `{ type: 'text' }`.

**Scheme guard (defense in depth):** only emit a `link` segment when the resolved href
scheme is `http:` or `https:`; otherwise fall back to a `text` segment. `detectFacets`
should never produce another scheme, but this guarantees a hostile PDS can't smuggle a
`javascript:` link through.

Empty/whitespace input → `[]`.

### Rendering — `src/pages/[author]/index.astro`

Replace the plain-text bio line with a map over segments:

```astro
{bioSegments.length > 0 && (
  <p class="author__bio">
    {bioSegments.map((seg) =>
      seg.type === 'link' ? (
        <a href={seg.href} target="_blank" rel="noopener noreferrer nofollow">{seg.text}</a>
      ) : (
        seg.text
      )
    )}
  </p>
)}
```

`bioSegments` is computed in the frontmatter from `profile.description`.

## Security

- **No HTML injection.** Astro auto-escapes both `{seg.text}` (a bio containing `<script>`
  or `&` renders as literal text) and the `href` attribute. No `set:html`, so the
  sanitize path (constraint 6b) doesn't apply.
- **No network call**, so the SSRF guard (constraint 6a) doesn't apply —
  `detectFacetsWithoutResolution()` is pure.
- **Scheme guard** as above.
- Links carry `rel="noopener noreferrer nofollow"` + `target="_blank"`, matching the
  existing handle link and appropriate for untrusted external URLs.

## Testing (TDD — tests first, must fail before implementation)

`src/lib/reader/rich-text.test.ts`:

- Plain text, no facets → one `text` segment, content unchanged.
- Full URL → `link` with correct href + display text; trailing punctuation
  (`Visit https://example.com.`) stays out of the link.
- Bare domain (`example.com`) → `link` with `https://` href, bare display text.
- `@alice.bsky.social` → `link` to `https://bsky.app/profile/alice.bsky.social`.
- `#design` → `link` to `https://bsky.app/hashtag/design`.
- Mixed bio (text + URL + mention + tag) → correctly ordered segment array.
- Scheme guard → a non-http(s) URI yields a `text` segment, not a `link`.
- Empty/whitespace description → `[]`.

Fidelity is inherent (we *use* `RichText`), so no separate fidelity-lock assertion is
needed; the behavior tests are the contract.

## Docs

- Update the contract comment in `src/lib/reader/profile.ts` — `description` is no longer
  "rendered as text, never HTML"; it is parsed into linkified segments at render.
- Add `docs/decisions/0015-author-bio-richtext.md` recording the read-path call.

## Risk

`@atproto/api`'s `RichText` must import cleanly in the SSR/node context (no `window` at
import). The vitest run (node env) exercises this immediately; if it pulls anything
browser-only, isolate the import. Not expected — `RichText` is a pure class.
