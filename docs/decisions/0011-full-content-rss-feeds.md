# 0011 — Full-content RSS feeds, one per publication

- **Status:** Accepted
- **Date:** 2026-06-09
- **Scope:** SP11 — public reader; a feed endpoint per publication

## Context

SkyPress publications had public HTML pages but no machine-readable feed, so readers
couldn't subscribe. The original brief (paused before the publication system landed) assumed
a single feed per `/@handle` profile; with Decision 0010 the unit of publishing is now a
**publication** (`/@handle/{slug}`), so the feed belongs there.

Two questions were left open by the brief: the route under the new publication model, and
whether to use the official `@astrojs/rss` package or hand-roll the XML.

## Decision

### 1. One full-content feed per publication, at `/@handle/{slug}/rss.xml`

The feed sits beside the publication it describes. It carries the **full, sanitised article
HTML** in `<content:encoded>` (RSS 2.0 + the `content` module), not just summaries — readers
get the whole piece. Newest 20 articles, sorted newest-first by `publishedAt`; undated
documents are skipped (they can't be ordered or dated).

### 2. Hand-rolled, dependency-free builder (option B), not `@astrojs/rss`

`src/lib/feed/rss.ts` builds the XML by hand. This matches the codebase's deliberate read-path
dependency avoidance (Decision 0003, AGENTS.md #3): the reader must stay light and free of
transitive deps. Critically, it lets us **test-lock the escaping** the way `render.ts` is
fidelity-locked:

- text fields (`title`, `description`, `link`) are XML-escaped (`& < >`);
- the article HTML is wrapped in `CDATA`, and any literal `]]>` is split
  (`]]]]><![CDATA[>`) so untrusted, PDS-sourced content can never close the section early.

`rss.test.ts` and `publication-feed.test.ts` enforce both. Adding a feed field means adding
its assertion — the same discipline as the block renderer.

### 3. Reuse the reader pipeline verbatim — no extra fetch

`buildPublicationFeedXml` is a pure transform fed by the same `listRecords` call the
publication page already makes (`listRecords` returns each document's full `content.blocks`,
so there is **no per-article round-trip**). Each item runs through the exact reader pipeline:
`resolveBlobImageUrls` → `renderBlocks` → `sanitizeArticleHtml` (since Decision 0018, owned
by `src/lib/reader/render-article.ts`). The feed body is therefore
the same sanitised HTML a browser sees (AGENTS.md #6b satisfied by reuse), and the route's
single PDS fetch goes through `safeFetch` (AGENTS.md #6a satisfied by reuse).

### 4. Discovery: autodiscovery link + a visible link

- An autodiscovery `<link rel="alternate" type="application/rss+xml">` is added to the
  publication page **and** every article page `<head>`, so feed readers find the feed from
  any entry point.
- A visible "RSS" link sits in the publication hero.

### 5. A read-through server endpoint

Like the other reading routes (Decision 0007/0009), the feed is `prerender = false` and runs
in the Cloudflare Worker. It 404s on an unresolvable author or unknown publication (matching
the publication page) and serves an empty-but-valid channel when a publication has no
articles. `content-type: application/rss+xml; charset=utf-8`, `cache-control: max-age=300`.

## Consequences

- The feed and the reader can never drift on rendering/sanitisation — they share the code.
- No new runtime dependency; the escaping rules are owned and tested here.
- Feeds are full-content by design: anyone with the URL gets the whole article. That is the
  intent (open syndication), consistent with the content already being public on the PDS.

## Alternatives considered

- **`@astrojs/rss`** — fewer lines, but pulls a dependency into the read path and hides the
  escaping behind a library we'd still need to test. Rejected for option B above.
- **One feed per author** (the original brief) — superseded by the publication model
  (Decision 0010); a per-author feed mixing publications has no obvious channel identity.
