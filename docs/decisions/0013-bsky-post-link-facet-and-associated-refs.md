# 0013 — Clickable link + standard.site card in the companion Bluesky post

- **Status:** Accepted
- **Date:** 2026-06-09
- **Scope:** The `app.bsky.feed.post` SkyPress writes alongside each published document
  (Decision 0005 publish flow)

## Context

Publishing creates a companion `app.bsky.feed.post` whose `embed` is an
`app.bsky.embed.external` card pointing at the article (Decision 0005). Two things were
missing versus a reference standard.site post (`bsky.app/profile/pckt.blog`):

1. **The article URL in the post text was not clickable.** Bluesky renders URLs in `text`
   as plain text unless the record carries a richtext **facet**
   (`app.bsky.richtext.facet#link`) marking the URL's byte range.
2. **The link card was bare — no standard.site enrichment.** The richer card (publication
   source, theme, reading time, associated profiles) is driven by
   `embed.external.associatedRefs`: an array of `com.atproto.repo.strongRef` pointing at
   the `site.standard.document` and `site.standard.publication` records. The Bluesky
   AppView resolves those to render the enhanced card. We emitted none.

## Decision

`buildBskyPost` (`src/lib/publish/records.ts`) now always emits a **link facet** over the
article URL, and embeds **`associatedRefs: [documentRef, publicationRef]`** when those
strongRefs are available.

- **Facet offsets are UTF-8 byte ranges**, not JS string indices. The URL is the trailing
  segment of `text` (`"<title>\n\n<url>"`), so `byteStart = utf8len("<title>\n\n")` and
  `byteEnd = byteStart + utf8len(url)`. Computed with `TextEncoder` — a multibyte title
  (emoji) shifts the offsets correctly. `records.ts` stays pure (no `@atproto/*`).
- **`associatedRefs` order is `[document, publication]`**, matching the reference post.

### Record ordering: three writes

The post needs the document's strongRef (uri + **cid**), and the document keeps a
`bskyPostRef` back at the post (Decision 0008, for unpublish / cascade-delete). That's a
mutual reference. `publish` (`src/lib/publish/publisher.ts`) now writes in this order:

1. **Create the document** (no `bskyPostRef`) → yields its strongRef.
2. **Create the post** with the link facet + `associatedRefs` to the document & publication.
3. **`putRecord` the document** to add `bskyPostRef`.

Step 3 re-cids the document, leaving the post's document ref one version stale. **This is
harmless**: the AppView resolves `associatedRefs` by URI (verified against the reference
post, whose own document ref is already stale after an edit yet still renders the rich
card). Keeping `bskyPostRef` preserves the existing unpublish/cascade-delete paths
unchanged.

## Consequences

- `PublishInput` gains `publicationCid`; `Publication` gains `cid` (captured from
  `listRecords`/`createRecord`/`putRecord` responses), threaded from `PublishPanel`.
- Publish is now three PDS writes instead of two (publish is not a hot path).
- Edit (`updateDocument`) is unchanged: it never created a post and still doesn't; the
  original post's facet + refs keep pointing at the stable URL.
- **Thumbnail (`thumb`) is intentionally deferred** — it needs a per-post image blob
  upload and is tracked as a follow-up. The standard.site card renders without it.
- No SkyPress lexicon change: facets/`associatedRefs` are Bluesky-native fields on
  `app.bsky.feed.post`, not part of the `site.standard.*` schema.
