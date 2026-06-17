# 0020 — Writing-first flow: deferred publish, no remote account creation

## Context
`/editor` gates the entire editor behind OAuth. We wanted a parallel surface where writing is
the first action and auth/publication selection are deferred to publish time.

## Decision
- Add a parallel route `/write` mounting a new `WriteStudio` island that renders the editor for
  every auth status (no login gate). `/`, `/editor`, `/dashboard` are untouched.
- Images are held locally as `data:` URLs and uploaded to the PDS only at publish
  (`src/lib/write/upload-held.ts`), via one media path regardless of auth state.
- The draft (title, lede, token-skeleton blocks, cover) survives the full-page OAuth redirect:
  light metadata + skeleton in `localStorage`, image bytes in IndexedDB
  (`src/lib/write/draft-store.ts` + `asset-store.ts`). A one-shot `publishIntent` flag makes the
  publish flow auto-resume on return.
- Publish branches on publication count: one → confirm; many → pick; zero → inline create. The
  single-publication case still shows a confirm — publishing also posts to Bluesky (brief §10).

## Why not remote account creation
atproto OAuth authenticates an existing account; `com.atproto.server.createAccount` lives on a
PDS's hosted signup (invite/email gated) and is not exposed to third-party clients. Building an
inline signup would make SkyPress a hosting/signup broker, contradicting the "never a PDS/relay"
guardrail. The signed-out panel therefore links out to Bluesky signup and otherwise offers
sign-in only.

## Consequences
- Signed-in writers lose eager upload error feedback (errors surface at publish) — accepted for a
  single, simpler media path.
- `data:`-URL drafts can be large; bytes go to IndexedDB to avoid the `localStorage` quota.

## Update — home page leads with /write
The route started as a hidden parallel experience, but it tested well, so the home page now
**leads with it**: the hero's primary CTA is "Start writing →" → `/write`, with the handle
sign-in (`HandleStart`) demoted to a secondary "Already have an account?" path. The masthead
"Write" button and the signed-in account menu's "Write" item (`accountMenuItems`) also point at
`/write` now. `/editor` still exists (edit-an-existing-article + the gated flow) but is no longer
linked from the home page.

## Update — OAuth must return to the page sign-in started from
The draft survives the redirect (above), but the round-trip itself returned the writer to the
**wrong page**: signing in from `/write` landed them back on `/editor` with an empty editor (the
draft was still on `/write`, recoverable only by navigating back manually). atproto only redirects
to a **registered** `redirect_uri` and, when `signIn()` is called without one, defaults to
`client-metadata.json`'s **first** `redirect_uris` entry — which was the single `/editor/`. Now
that the editor island powers two routes, both must be registered and the round-trip pinned to the
originating page:
- `OAUTH_REDIRECT_PATHS` (`src/lib/auth/config.ts`) is the single source of truth — `['/editor/',
  '/write/']`, `/editor/` first as the safe fallback. `client-metadata.json` generates its
  `redirect_uris` from it.
- `AuthProvider.signIn` passes `redirect_uri: redirectUriForLocation(origin, pathname)` in hosted
  mode, so the browser client's `findRedirectUrl()` matches the same page at the callback/token
  exchange. Loopback (dev) is unaffected: its lone auto-generated redirect URI already equals the
  current page, so no `redirect_uri` is passed.
