# 0017 — The article render pipeline lives in one render-article module

- **Status:** Accepted
- **Date:** 2026-06-10
- **Scope:** the article render pipeline (`src/lib/reader/render-article.ts`, the
  article page, `src/lib/feed/publication-feed.ts`)

## Context

Turning a stored block tree into safe HTML takes three calls in one load-bearing
order — `resolveBlobImageUrls` → `renderBlocks` → `sanitizeArticleHtml` — plus the
plain-text fallback (`doc.textContent || blocksToText( blocks )`). The ordering is the
AGENTS.md #6b invariant (sanitise is the LAST step before injection), but no module
owned it: the article page and the feed builder each assembled it by hand. A third
read surface (AMP, email, embeds) would have had to re-learn the order, and getting it
wrong ships unsanitised PDS HTML. Decision 0016 sealed route *resolution* behind
`read-context.ts` and explicitly deferred this orthogonal deepening.

## Decision

One deep module, `src/lib/reader/render-article.ts`:

```ts
renderArticle( doc, { pdsUrl, did } ) → { html, text }
```

- It accepts the document-value slice (`textContent` + `content.blocks`) rather than
  raw blocks, so the text fallback concentrates here too. `read-context.ts`'s
  `SkyDocumentValue` and the feed's `FeedDocumentValue` both satisfy the
  `RenderableDocument` parameter structurally — no adapter layer.
- The pipeline-order invariant gains locality: it lives once, behaviourally tested in
  `render-article.test.ts` (a `<script>` in block content never survives; blob-backed
  image URLs are rebuilt against the author's current PDS before render).
- Like `render.ts` underneath, the module is dependency-free — it must never import
  `@wordpress/*` (Decision 0003). It wraps `render.ts`, sitting beside it; render
  fidelity stays locked by `render.test.ts`, untouched.
- The article page and `buildPublicationFeedXml` are now callers;
  `publication-feed.ts` stays a pure transform. New read surfaces get sanitisation for
  free by construction — AGENTS.md rule 6(b) now points here.

## Consequences

- `resolveBlobImageUrls`, `renderBlocks`, and `sanitizeArticleHtml` keep their own
  unit suites; no page or transform should compose them by hand again
  (`_[rkey].meta.test.ts` pins the article page's delegation).
- A surface needing different rendering rules (e.g. email's stricter tag set) extends
  this module's interface rather than re-assembling the pipeline at the call site.
