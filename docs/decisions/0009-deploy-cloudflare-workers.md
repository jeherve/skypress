# 0009 — Hosting: Cloudflare Workers (Static Assets)

- **Status:** Accepted (edge-verified locally; production deploy on the owner's account)
- **Date:** 2026-06-08
- **Scope:** SP7 — deployment

## Context

The brief (§8) wants free hosting on Vercel or Cloudflare. The owner chose Cloudflare and
has the account + `skypress.blog` domain already on Cloudflare. SkyPress's read-through
renderer (SP4) is the only server-side piece; everything else is static.

## Decision

Deploy to **Cloudflare Workers with Static Assets** via `@astrojs/cloudflare` v13.

Although the owner said "Pages", the modern Astro Cloudflare adapter targets **Workers**
(Cloudflare is converging Pages into Workers + Static Assets, and the adapter no longer
emits a Pages `_worker.js`). It's the same Cloudflare account and custom domain — the
read-through renderer runs as the Worker; the landing, editor shell, fonts, and
`client-metadata.json` are served as static assets from the edge.

- **`nodejs_compat`** compatibility flag (in `wrangler.toml`) so `sanitize-html` runs on
  `workerd`. Verified locally.
- **No KV / D1 / queues.** The architecture needs no datastore; Astro's default session
  store (which would have required a KV) is disabled via an in-memory `session.driver`.
- Build → `npm run deploy` (`astro build && wrangler deploy`); custom domain attached in
  the dashboard.

## Why (vs. alternatives)

- **Vercel** — also viable, but the owner's domain + account are on Cloudflare, and
  Cloudflare's edge fits the zero-JS read-through renderer well.
- **Force Pages output** — would mean pinning an older adapter; fighting the supported
  path for no benefit.

## Consequences

- Cloudflare's `fetch` cannot reach private/loopback addresses, which **closes the
  DNS-rebinding SSRF residual** flagged in Decision 0007. SSRF is fully contained.
- `sanitize-html` depends on `nodejs_compat`; if a future Workers change drops a needed
  Node shim, swap to an edge-native sanitiser. Tracked.
- The editor's ~1.5 MB-gz island ships only on `/editor`; reading pages remain zero-JS.
- Runbook + verification steps: `docs/specs/sp7-deploy.md`.
