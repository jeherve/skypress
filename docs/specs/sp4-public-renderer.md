# SP4 — Public renderer

- **Date:** 2026-06-08
- **Status:** ✅ Complete — verified against real published articles
- **Goal (brief §2, §6, §9.5):** A read-through renderer: `/@<handle>/<rkey>` resolves
  handle→DID→PDS, fetches the document, and renders the block tree to a light, JS-free
  reading page with the `site.standard` `<link>` tags. No indexer, no database.

Design: [Decision 0007](../decisions/0007-read-through-renderer.md).

## Success criteria & results

| # | Criterion | Result |
|---|---|---|
| 1 | Resolve handle→DID→PDS, fetch + render the block tree | ✅ `@jeherve.com` → article renders |
| 2 | Blob images reconstructed from `skypressBlob` | ✅ image loaded (`naturalWidth>0`) via rebuilt `getBlob` URL |
| 3 | Untrusted HTML sanitised | ✅ 4 unit tests (`<script>`/`onerror`/`javascript:` stripped) + applied |
| 4 | `site.standard` `<link>` tags | ✅ document + publication tags present; canonical + OG tags |
| 5 | Light, JS-free reading page | ✅ production build ships **0 `<script>`**, 1 CSS link |
| 6 | 404 for missing/invalid | ✅ bad rkey / non-`@` author → 404 |
| 7 | Publication homepage lists articles | ✅ `/@<handle>` lists the writer's SkyPress docs (scoped to our publication) |

## Architecture

```
src/lib/reader/
  identity.ts   resolveHandleToDid (well-known → XRPC fallback) + resolveAuthor
  records.ts    getRecord / listRecords via public com.atproto.repo XRPC
  sanitize.ts   sanitizeArticleHtml (allowlist) + sanitize.test.ts
src/lib/media/blob.ts   resolveBlobImageUrls (rebuild getBlob from DID+CID) — tested
src/pages/[author]/[rkey].astro   the article (prerender = false)
src/pages/[author]/index.astro    the publication homepage
astro.config.mjs   @astrojs/node adapter (hybrid: static + on-demand)
```

## Out of scope for SP4

Edit/unpublish (SP5), brand/visual design (SP6), edge-host adapter + caching + edge-safe
sanitiser (SP7), a caching/resizing media proxy, self-hosted handle resolver, full
embed/oEmbed rendering.
