# 0004 — atproto OAuth: browser public client (not server confidential)

- **Status:** Accepted
- **Date:** 2026-06-08
- **Scope:** SP1 (auth) and the hosting story (SP7)

## Context

The brief (§2, §10) requires OAuth-only auth (no app passwords), names
`@atproto/oauth-client-node` (a server-side *confidential* client), and asks for
"server-side session handling done correctly" with "secrets never in the client."

But the brief's own north star (§2, §8) is a **read-through renderer with no database
and no persistent worker**, on free serverless/edge hosting — and it explicitly grants
authority to re-decide where its specifics conflict with the goals.

A server confidential client (`@atproto/oauth-client-node`) needs a **server-side
session + state store** (a KV/DB) and a **private signing key** (a secret). That
reintroduces exactly the database the architecture is designed to avoid, and adds a
backend SkyPress otherwise doesn't need: the editor is already a client-side island,
and all PDS writes (records, blobs) happen from the browser via the post-auth `Agent`.

atproto also offers `@atproto/oauth-client-browser@0.4.1` — a **public** client for SPAs:
PKCE + DPoP, no client secret, sessions/keys in the browser's IndexedDB, token refresh
in-browser.

## Decision

Use **`@atproto/oauth-client-browser`** (public client, PKCE/DPoP).

- "Secrets never in the client" is satisfied trivially: a public client has **no
  secret**.
- No server session store → preserves the no-database / free-edge architecture (§2/§8).
  The whole app can ship as static + edge-rendered reading pages, with **no auth
  backend at all**.
- The post-auth `Agent` (`@atproto/api`) runs in the browser — exactly where the editor
  needs it for `com.atproto.repo.createRecord` / `uploadBlob` (SP2/SP3).

### Configuration
- **Dev (loopback):** `new BrowserOAuthClient({ handleResolver })` — the library
  auto-derives the loopback `client_id` from `window.location` and redirects
  `localhost`→`127.0.0.1` (atproto requires an IP origin for loopback clients).
- **Prod (hosted):** `BrowserOAuthClient.load({ clientId: '<origin>/client-metadata.json' })`
  with a static `client-metadata.json` served at the app origin (generated for the real
  origin at deploy time, SP7).
- **Handle resolver:** `https://bsky.social` for now. This leaks the user's IP + handle
  to Bluesky (documented privacy caveat from the lib); a self-hosted resolver is the
  later privacy improvement.
- **Scope (SP1):** `atproto transition:generic` — enough to establish a session. The
  granular `repo:site.standard.*` / `repo:app.bsky.feed.post` write scopes (brief §2)
  are added in **SP2**, when records are actually written, and verified against the live
  permission spec then.

## Consequences

- Tokens live in the browser (IndexedDB). This is the standard, accepted SPA model;
  Bluesky issues shorter-lived tokens to public clients than to a BFF — acceptable for a
  single-author writing tool.
- Trade-off vs. the brief's named lib is explicit: we lose server-side token control and
  longer-lived BFF tokens, and gain a far simpler, database-free, edge-deployable app.
  If a future need (e.g. server-side scheduled publishing) requires a confidential
  client, that's an additive backend, not a rewrite.
- **OAuth E2E is inherently interactive** (real account + redirect). SP1 unit-tests the
  pure config/handle logic and smoke-tests the flow up to the auth-server redirect; the
  full round-trip is a documented manual check.
