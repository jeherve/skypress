# SP7 — Deploy (Cloudflare)

- **Date:** 2026-06-08
- **Status:** Deploy-ready + edge-verified locally. The final `wrangler deploy` runs on the
  owner's Cloudflare account.
- **Goal (brief §8, §9.8):** Deploy to a free host. Cloudflare.

## Decision (0009)

Deploy to **Cloudflare Workers (Static Assets)** via `@astrojs/cloudflare` v13 — the
modern Astro Cloudflare target (Cloudflare is folding Pages into Workers + Static Assets;
the adapter no longer emits a Pages `_worker.js`). Same Cloudflare account + custom domain
as "Pages"; the read-through renderer (SP4) runs as the Worker, static assets (landing,
editor shell, fonts, `client-metadata.json`) served from the edge cache.

- `nodejs_compat` (in `wrangler.toml`) lets `sanitize-html` run on `workerd`.
- **No database / KV / queues** — the read-through design needs none. Astro's default
  session store (which would add a KV) is disabled with an in-memory driver.
- Cloudflare's `fetch` cannot reach private/loopback IPs, which also closes the
  DNS-rebinding residual noted in Decision 0007 — SSRF is fully contained at the edge.

## Edge verification (local `workerd` via `astro preview`)

- Landing (static asset) → 200.
- Article `/@jeherve.com/<rkey>` (SSR + `sanitize-html` + reader fetch chain) → 200, renders
  with both `site.standard` link tags. **`sanitize-html` works under `nodejs_compat`.**
- `/@127.0.0.1/x` → 404 (SSRF guard holds on the edge).
- Generated `dist/server/wrangler.json`: `main: entry.mjs`, `assets: ../client`,
  `compatibility_flags: [nodejs_compat]`, `kv_namespaces: []`.

## Deploy runbook (owner's Cloudflare account)

1. **One-time:** `npx wrangler login` (authorise the Cloudflare account).
2. **Deploy:** `npm run deploy` (= `astro build && wrangler deploy`). `astro build` writes
   `.wrangler/deploy/config.json` redirecting `wrangler deploy` to the built worker config.
3. **Custom domain:** in the dashboard (Workers & Pages → `skypress` → Settings → Domains),
   attach **`skypress.blog`** (the domain is already on Cloudflare). This routes the apex to
   the Worker.
4. **Verify production:**
   - `https://skypress.blog/` (landing), `/preview` (sample article).
   - `https://skypress.blog/client-metadata.json` returns the OAuth client metadata
     (`client_id` must equal that URL — it does).
   - `https://skypress.blog/editor` → sign in (prod OAuth uses the hosted `client_id`;
     `redirect_uris` is `https://skypress.blog/editor`), publish, then open
     `https://skypress.blog/@<handle>/<rkey>`.

Git-connected builds (Workers Builds) are an alternative: build `npm run build`, deploy
`npx wrangler deploy`, set `nodejs_compat` — but the local `npm run deploy` is the simplest
first cut.

## OAuth client metadata: a worker route, not a static file

`/client-metadata.json` is served by a **worker route**
(`src/pages/client-metadata.json.ts`, `prerender = false`), not a static asset. Two prod
failures drove this:

1. **404 in production.** The static `public/client-metadata.json` served locally and on
   the first deploy but 404'd at the deployed origin (`invalid_client_metadata … Not
   Found`). Static `.json` serving on Cloudflare Workers Static Assets proved unreliable;
   a worker route always runs.
2. **Trailing slash.** Cloudflare serves the prerendered editor page canonically at
   **`/editor/`** (`/editor` → 307 → `/editor/`), and the atproto client only processes a
   callback when `location.pathname` **exactly** equals a registered `redirect_uri`
   pathname (`findRedirectUrl`). So the metadata must register `…/editor/` **with** the
   slash, or auth completes at Bluesky but the editor silently stays signed-out.

The route generates the document from the **request origin**, so `client_id` always equals
the fetched URL (apex / www / preview origins all work) and `redirect_uris` is
`<origin>/editor/`. Verified on workerd (`astro preview`): 200 `application/json`. Reading
routes are SSR (not slash-canonicalised), so article URLs stay `/@<handle>/<rkey>`.

## Notes / follow-ups

- The dev OAuth client is loopback (`127.0.0.1`); production uses the hosted
  `client-metadata.json` automatically (Decision 0004 / `getClientMode`).
- The editor island is heavy (~1.5 MB gz) but loads only on `/editor`; reading pages stay
  zero-JS at the edge.
- A caching layer / `Cache-Control` tuning for the read-through renderer is a perf
  follow-up (content is immutable per rkey until edited).
