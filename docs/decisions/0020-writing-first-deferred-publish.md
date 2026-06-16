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
