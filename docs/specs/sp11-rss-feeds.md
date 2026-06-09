# SP11 — Full-content RSS feeds (one per publication)

- **Status:** Built
- **Depends on:** SP4 (public renderer), SP10 (publication system)
- **Decisions:** 0011 (full-content feeds, hand-rolled builder, route, discovery)

## Goal

Give every publication a machine-readable, **full-content** RSS feed so readers can
subscribe. The feed carries the whole sanitised article HTML, not just a summary.

## Route

```
skypress.blog/@handle/{slug}/rss.xml   → RSS 2.0 feed for that publication
```

A read-through server endpoint (`prerender = false`) in `src/pages/[author]/[slug]/rss.xml.ts`,
mirroring the publication page's resolution and error behaviour:

1. Validate `@handle` + `slug`; 404 otherwise.
2. `resolveAuthor(handle)` → `{ did, pdsUrl }`; 404 if unresolvable.
3. `resolveReaderPublication(pdsUrl, did, slug)`; 404 if unknown.
4. `listRecords(site.standard.document, 100)` — one SSRF-guarded PDS fetch; no per-article
   round-trip (records already include `content.blocks` + `textContent`).
5. `buildPublicationFeedXml(...)` → XML.
6. Respond `application/rss+xml; charset=utf-8`, `cache-control: public, max-age=300`.

## Feed contents

- **Channel:** publication `name` (title), home URL (link), `description`, a self-referencing
  `atom:link`, and `lastBuildDate` from the newest item.
- **Items (newest 20, by `publishedAt`, newest-first; undated documents skipped):**
  - `title`, `link` + `guid` = canonical article URL (`/@handle/{slug}/{rkey}`),
  - `pubDate` (RFC-822, via `Date.toUTCString()`),
  - `description` = stored `description` or a 200-char `textContent` fallback,
  - `content:encoded` = full sanitised article HTML in a `CDATA` section.

## Pipeline reuse (no drift, guardrails by reuse)

The item body uses the **exact** reader pipeline:
`resolveBlobImageUrls` → `renderBlocks` (`src/lib/blocks/render.ts`) →
`sanitizeArticleHtml` (`src/lib/reader/sanitize.ts`). So:

- HTML is sanitised before output (AGENTS.md #6b) — same code as the article page;
- the route's PDS fetch is SSRF-guarded via `listRecords`/`safeFetch` (AGENTS.md #6a);
- reading-page fidelity and feed fidelity can never diverge.

## Modules

- `src/lib/feed/rss.ts` — pure, dependency-free RSS 2.0 builder. Owns XML + CDATA escaping.
- `src/lib/feed/publication-feed.ts` — pure transform: filter to this publication, sort, cap,
  render each item, assemble channel. Network-free, fully unit-testable.
- `src/pages/[author]/[slug]/rss.xml.ts` — the endpoint (fetch + delegate).

## Discovery

- Autodiscovery `<link rel="alternate" type="application/rss+xml" title="{name} — RSS">` in
  the publication page and every article page `<head>`.
- A visible "RSS" link in the publication hero.

## Tests (TDD; escaping is test-locked)

- `rss.test.ts` — document shape, namespaces, channel/item fields, XML escaping, the
  `]]>` CDATA-split, RFC-822 dates, ordering, empty channel.
- `publication-feed.test.ts` — ownership filter, newest-first sort, 20-item cap, undated
  skip, full HTML in `content:encoded`, canonical links + self feed URL, description
  fallback, empty publication.

## Out of scope

- Atom/JSON Feed (RSS 2.0 only for v1).
- Per-author or cross-publication feeds (no clear channel identity — Decision 0011).
- Pagination / `<lastBuildDate>`-based conditional GETs.
