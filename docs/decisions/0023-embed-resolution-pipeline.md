# 0023 — Embed resolution pipeline

- **Status:** Accepted
- **Date:** 2026-06-19
- **Scope:** `src/lib/embeds/*`, `src/lib/blocks/render.ts`, `src/lib/reader/sanitize.ts`,
  `src/lib/editor/embed-preview.ts`, the article reading page.

## Context

`core/embed` is allowlisted (Decision 0002) but resolved previews require a WordPress
oEmbed proxy SkyPress doesn't have, so embeds rendered as nothing on reading pages and
pasting an embeddable URL produced no block in the editor. We want atproto post embeds
(an improvement) and working video embeds (a fix).

## Decision

Resolve embeds in SkyPress's own pipeline:

- A dependency-free `src/lib/embeds/` module (registry → resolve → card) recognises a
  small provider set (atproto posts, YouTube, Vimeo; one entry to add more) and builds
  trusted card HTML with every PDS/provider value escaped.
- Reading pages run an async `resolveEmbeds` pre-pass (it can't live in the synchronous,
  dependency-free `render-article` pipeline) that attaches resolved DATA onto each
  `core/embed` node; `render.ts` renders the card synchronously; `sanitizeArticleHtml`
  runs last (Decision 0018). Server fetches go through `safeFetch` (rule 6a).
- Video is a **facade**: the sanitised HTML carries no iframe — only a thumbnail, title,
  and a play button with `data-embed-provider`/`data-embed-id`. Reader JS reconstructs the
  playback URL from provider + id and re-validates it against a two-host allowlist
  (`youtube-nocookie.com`, `player.vimeo.com`) before inserting the iframe. So the widened
  sanitiser (which allows `button` + the two scoped data attributes, never `iframe`)
  cannot be abused by a hostile PDS to load an arbitrary frame.
- The editor reuses the same fetch + card code through a `@wordpress/api-fetch` middleware
  over `core/embed`: live cards for atproto (CORS-friendly AppView), placeholders for
  video (oEmbed isn't browser-CORS-reachable). Pasting a URL still auto-creates the block.

## Consequences

- View links in atproto cards use `atmospherePostWebUrl` → mu.social (Decision 0022).
- SSR resolves embeds per request; v1 relies on `safeFetch` timeouts + graceful link
  fallback. Caching (Cloudflare Cache API / in-worker memo) is a fast-follow if latency
  warrants it.
- RSS renders embeds as plain links in v1 (the feed builder stays pure/test-locked);
  atproto-card-in-RSS is a documented fast-follow.
- Adding a provider = one registry entry + a resolve branch + a card branch + tests.
- The embed card intentionally diverges from `serialize()` (read-time enhancement, like
  blob-image resolution) — the fidelity test (rule 4) does not cover `core/embed`.
