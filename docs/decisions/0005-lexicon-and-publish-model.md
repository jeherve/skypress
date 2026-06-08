# 0005 — Lexicon design & the publish model

- **Status:** Accepted
- **Date:** 2026-06-08
- **Scope:** SP2 (publish). Edit semantics (the "puppy problem") are SP5.

Shapes below are verified against the live `site.standard.*` lexicons
(tangled.org/standard.site/lexicons, fetched 2026-06-08), not just the brief.

## Records written on publish

Two (or three) records on the writer's PDS, per brief §1:

1. **`site.standard.publication`** (rkey: TID) — created once per writer if missing.
   `url` (required) = the writer's SkyPress homepage `https://skypress.blog/<handle>`;
   `name` (required) = a default derived from the handle. Reused on later publishes by
   listing the writer's existing publication records (it is NOT a `self` singleton).
2. **`site.standard.document`** (rkey: TID) — the article.
   - `site` = the publication's `at://` URI (links document↔publication, which Bluesky
     requires for the highest-fidelity card — brief §3).
   - `path` = `/<slug>` (slug from the title). Canonical URL = publication `url` + `path`
     = `https://skypress.blog/<handle>/<slug>`.
   - `title`, `publishedAt` (required); `description`; `textContent` (de-facto required —
     Bluesky computes reading-time/search from it, ignoring `content`); `bskyPostRef`
     (strongRef to the post, below); `content` = our Gutenberg object.
3. **`app.bsky.feed.post`** (rkey: TID) — the social signal, with an
   `app.bsky.embed.external` link card pointing at the canonical article URL.

### Publish order (avoids a circular dependency)
handle + slug ⇒ the article URL is known up front. So:
`ensure publication → create post (embed → article URL) → create document (content +
textContent + bskyPostRef = post strongRef)`. One document write, no follow-up update.

## The SkyPress content lexicon — `blog.skypress.content.gutenberg`

Goes inside the document's open `content` union (brief §3). The block tree is canonical
(the array from `onSaveBlocks`), not rendered HTML.

```
blog.skypress.content.gutenberg (object)
  version: integer   — serialization version (currently 1)
  blocks:  array of unknown — the Gutenberg block tree: [{ name, attributes, innerBlocks }]
```

- `blocks` items are typed `unknown` (arbitrary objects): Gutenberg block attributes are
  open-ended per block type and can't be strictly schematised. Each node matches the
  `BlockNode` shape `render.ts` consumes, so reconstruction is a direct read.
- Lexicon authoring discipline (brief §3): optional fields, open unions, additions-only.
  `version` lets us evolve the serialization without breaking old records; a breaking
  change ships as `blog.skypress.content.gutenberg` **v2** (a new $type), never a silent
  mutation.
- Graceful degradation: any reader that doesn't understand this `$type` falls back to the
  document's `textContent` — which is why we always write good `textContent`.

NSID rationale: the app lives at `skypress.blog`, so the reverse-DNS namespace is
`blog.skypress.*` (brief §3). Only the content format is SkyPress-owned; publication +
document metadata reuse `site.standard.*` for interop.

## Scope

Writing these records needs write access. Per brief §2, use **`atproto
transition:generic`** for now ("keep transition:generic until read-side scopes
stabilize"). This is the existing `OAUTH_SCOPE`; SP2 wires it into the dev loopback
client_id (which previously defaulted to read-only `atproto`), so the user re-auths once
to grant writes. The granular `repo:site.standard.*` / `repo:app.bsky.feed.post` scopes
(brief §2) are a later tightening.

## Edit semantics (the "puppy problem") — deferred to SP5, but constrained now

SP2 only **creates**. The document uses a TID rkey (the lexicon mandates `key: 'tid'`),
so a stable URL across edits will mean updating the same record (rkey) in SP5. SP2 does
not implement re-publish/update; that decision (mutate vs. version vs. new record) is
SP5's, and the lexicon's `updatedAt` field is reserved for it.

## Don't surprise the user (brief §10, non-negotiable)

Publishing creates a **public Bluesky post**. The publish UI must state this
unmistakably and require an explicit confirm before writing. Implemented in the publish
panel.
