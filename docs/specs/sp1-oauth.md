# SP1 — atproto OAuth (login, session, the Agent)

- **Date:** 2026-06-08
- **Status:** ✅ Complete — verified end-to-end with a real account (see Outcome)
- **Goal (brief §9.2):** A writer logs in with their existing atproto identity via OAuth;
  the app holds a session and exposes an `@atproto/api` `Agent` for later
  `com.atproto.repo.*` calls. The editor is gated behind auth.

## Approach

Browser public OAuth client (`@atproto/oauth-client-browser`) — see Decision 0004. No
backend. The flow:

```
load → client.init()           // restore session OR process redirect callback
signed out → enter handle → client.signIn(handle)   // redirects to the PDS auth server
…redirect back → client.init() returns { session }  // session established
session → new Agent(session)   // ready for repo.* (SP2)
```

## Success criteria

1. **Auth state machine.** On load, `init()` runs once; status resolves to
   `loading → signed-out` (fresh) or `signed-in` (restored session).
2. **Sign in.** Entering a handle and submitting calls `signIn()`, which resolves the
   identity and redirects to the user's authorization server.
3. **Session + Agent.** After the callback, a session exists and an `Agent` is
   constructed; the signed-in identity (handle/DID) is shown.
4. **Persistence + sign out.** Reload keeps the session (IndexedDB); sign-out revokes it
   and returns to signed-out.
5. **Editor gated.** `/editor` shows the login form when signed out, the editor when
   signed in.
6. **Pure logic tested; flow smoke-tested** up to the redirect (full E2E = manual, needs
   a real account — Decision 0004).

## Architecture

```
src/lib/auth/
  config.ts        PURE, TESTABLE: client mode (loopback vs hosted), metadata URL,
                   handle normalisation/validation, scope constant
  config.test.ts   Vitest unit tests (written first)
  oauth.ts         browser-only: createOAuthClient() (dev loopback / prod load)
  AuthProvider.tsx React context: { status, session, agent, signIn, signOut }
  useAuth.ts       hook to consume the context
  LoginForm.tsx    handle input → signIn
src/components/
  Studio.tsx       top-level island: AuthProvider → gated (LoginForm | SkyEditor)
src/pages/editor.astro   renders <Studio client:only="react" />
public/
  client-metadata.json   prod client metadata (origin filled at deploy, SP7)
```

## TDD plan (pure `config.ts`)

- `getClientMode()` → 'loopback' for localhost/127.0.0.1/[::1], else 'hosted'
- `clientMetadataUrl(origin)` → `${origin}/client-metadata.json`
- `normalizeHandle()` strips a leading `@`, trims, lowercases
- `isValidAccountInput()` accepts handles, DIDs (`did:plc:…`), and PDS URLs; rejects junk

## Out of scope for SP1

Writing records / lexicon (SP2), granular write scopes (SP2), blob upload (SP3),
self-hosted handle resolver, the real deployed `client-metadata.json` origin (SP7).

## Outcome (2026-06-08)

All criteria met; the full flow was verified against a **real** Bluesky account.

| # | Criterion | Result |
|---|---|---|
| 1 | Auth state machine | `init()` runs once; resolves `loading → signed-out` (fresh) / `signed-in` (restored) |
| 2 | Sign in | Handle → redirect to the genuine `https://bsky.social/oauth/authorize` (PAR `request_uri`), correct loopback `client_id` |
| 3 | Session + Agent | Callback exchanged; session established; `new Agent(session)`; identity shown (`did:plc:…`) |
| 4 | Persistence | Reload restores the session from IndexedDB — no re-auth |
| 5 | Editor gated | `/editor` shows the login form when signed out, the editor when signed in |
| 6 | Pure logic tested | 7 Vitest tests for config/handle/scope |

**Findings & notes:**
- The atproto **loopback `client_id` must be path-less**; the library's auto-builder
  derives it from `window.location.pathname` and breaks off `/`. `oauth.ts` builds it
  explicitly (root client_id + `/editor` redirect_uri). Loopback requires a `127.0.0.1`
  origin (not `localhost`).
- The README's `client.addEventListener('deleted', …)` is **not** available at runtime on
  this version — removed. Session invalidation is currently handled lazily (a failed
  `Agent` call surfaces it); a typed invalidation hook is a later refinement.
- Identity shows the **DID**, not the handle, in dev: `agent.getProfile` (appview read)
  is rejected (401/403) under the loopback base `atproto` scope. Expected graceful
  fallback; prod's `transition:generic` will resolve the handle.
- Granular write scopes (`repo:site.standard.*`, `repo:app.bsky.feed.post`) are added in
  SP2, including wiring them into the dev loopback client_id so publish can be tested.
