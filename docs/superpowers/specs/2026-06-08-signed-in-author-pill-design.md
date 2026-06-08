# Signed-in author pill + editor author-info redesign

**Date:** 2026-06-08
**Status:** Approved (design)

## Summary

SkyPress keeps the OAuth session in the browser (IndexedDB, via
`@atproto/oauth-client-browser`), so a writer who has signed in before is
restored automatically the next time any page mounts the auth client. Today
only the editor (`/editor`) does this; the public landing page (`/`) is fully
static and unaware of the session.

This project:

1. Adds a **signed-in author pill** to the top-right of the home page — avatar,
   display name, and `@handle` — sitting next to the existing "Open the studio"
   button. It links to the writer's public author page.
2. **Redesigns the editor's account bar** to the same richer identity
   treatment (avatar + name + handle) plus a "View my public page" link and the
   existing Sign out button.

Both surfaces share one definition of "who is signed in," so the identity looks
and behaves consistently.

## Constraints honored

- **Reading pages must never import `@wordpress/*`** (AGENTS.md rule 3). The
  auth chain (`AuthProvider` → `oauth` → `config` / `media/pds`) is already
  `@wordpress`-free (verified), so the pill island can reuse it without dragging
  the editor bundle onto the landing page.
- **OAuth is a browser public client** (AGENTS.md rule 7). The pill restores the
  session client-side only; it never runs server-side.
- The pill is **read-only** — it does not sign in, sign out, or resolve the PDS
  endpoint. Sign-out stays in the editor where it already lives.

## Decisions (from brainstorming)

- **Masthead layout:** pill sits *next to* the "Open the studio" button (not
  replacing it). Identity = pill, action = button.
- **Pill radius:** matches the buttons — `--radius-sm` (8px), not a full pill.
- **Loading state:** show only the button while the session restores; swap the
  pill in when it resolves. No skeleton (most visitors are signed out; a
  skeleton would flash a placeholder at them).
- **Pill click target:** links to the writer's public author page
  (`/@{handle}` — the `/[author]` route requires a leading `@` and resolves by
  handle). No dropdown menu.
- **Editor account bar:** avatar + name/handle, plus "View my public page ↗" and
  Sign out.
- **Implementation approach:** dedicated read-only pill island for the home page
  + additive extension of `AuthProvider` for the editor, sharing one
  profile-fetch helper. (Not: reusing the full `AuthProvider` on the home page —
  it would fire an unneeded PDS-resolution network call and ship sign-in code to
  the landing page. Not: refactoring a shared `useSession()` core — more risk and
  scope than this feature warrants.)

## Components & files

### New — shared profile helper: `src/lib/auth/profile.ts`

```ts
export interface ViewerProfile {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
}

// Wraps a single agent.getProfile({ actor: did }). Maps displayName / handle /
// avatar. Never throws — returns nulls for missing/failed fields, always keeps did.
export async function fetchViewerProfile(agent, did): Promise<ViewerProfile>;

// Pure display helpers (so the UI fallback logic is unit-tested, not the island):
export function displayNameFor(p: ViewerProfile): string; // displayName → handle → did
export function authorPath(handle: string | null): string | null; // "/@{handle}" or null
```

Single definition of the signed-in identity, used by both the pill and
`AuthProvider`. Replaces the existing best-effort `resolveHandle` helper in
`AuthProvider`.

### New — home pill island: `src/components/AuthorPill.tsx` (`client:only="react"`)

- On mount: `createOAuthClient()` → `client.init()`.
- Session restored → build `Agent`, call `fetchViewerProfile`, render the pill.
- No session, or `init()`/profile fetch throws → render nothing (non-critical
  chrome; the editor remains where auth errors surface).
- Renders: avatar (initial-letter circle fallback when `avatar` is null),
  display name (fallback chain: displayName → handle → DID), `@handle`, wrapped
  in `<a href="/@{handle}">` to the public author page (link omitted when no
  handle is known). Hidden until resolved.
- Styled to match the masthead's frosted sky-chip treatment + 8px radius.

### Changed — `src/lib/auth/AuthProvider.tsx`

- `adoptSession` already calls `getProfile` (via `resolveHandle`). Swap that for
  `fetchViewerProfile` and store `displayName` + `avatar` in new state.
- Expose `displayName` and `avatar` on `AuthContextValue`.
- No extra network calls — same single `getProfile`, more fields kept.

### Changed — `src/components/Studio.tsx` (editor account bar)

- Replace the `Signed in as <handle>` text line with: avatar + display name +
  `@handle`, a "View my public page ↗" link (`/@{handle}`), and the existing
  Sign out button. Consumes `displayName` / `avatar` from `useAuth()`.

### Changed — `src/pages/index.astro`

- Add `<AuthorPill client:only="react" />` inside `.masthead`, before the
  existing "Open the studio" button (pill left, button right).
- Pill styles join the existing per-phase sky-chip rules.

### Changed — `src/pages/editor.astro` (styles only)

- Update the global `.studio__account` rules for the new avatar + identity
  layout and the public-page link.

## Data flow & states

**Home (`/`):**
1. Static HTML renders instantly — logo + "Open the studio" button, no pill.
2. `AuthorPill` hydrates → `createOAuthClient()` → `client.init()`.
3. No session → pill renders nothing (signed-out state, unchanged from today).
4. Session restored → `fetchViewerProfile` → pill appears left of the button
   (brief pop-in, no skeleton).

**Editor (`/editor`):** unchanged flow, richer data. `AuthProvider` restores the
session and now stores `displayName` + `avatar` from the same `getProfile`; the
account bar reads them from `useAuth()`.

## Error handling & edge cases

- `getProfile` fails → `fetchViewerProfile` returns nulls for name/avatar, keeps
  `did`. Display falls back displayName → handle → DID; avatar → initial circle.
  UI never blocks or errors.
- `client.init()` throws on the home page → pill renders nothing.
- Avatar `<img>` fails to load → `onError` fallback to the initial circle.
- Public-page link uses `handle` when present. The `/[author]` route's actor
  handling will be confirmed during implementation; if only a DID is available
  and the route can't use it, hide the link rather than render a broken one.

## Testing (test-first)

This repo has **no React component-test setup** — vitest (jsdom) runs only
`src/**/*.test.ts` pure-logic tests; there is no `@testing-library`. We follow
that convention: extract the testable logic into pure helpers and unit-test
them; keep the React islands thin and verify them manually (`npm run dev`) plus
type-check (`npm run check`). We do **not** add a component-test framework.

- `profile.test.ts`:
  - `fetchViewerProfile` maps `displayName` / `handle` / `avatar` from a mocked
    `agent.getProfile` response.
  - `fetchViewerProfile` falls back to nulls (keeping `did`) when `getProfile`
    throws or returns empty fields.
  - `displayNameFor` returns displayName, else handle, else did.
  - `authorPath` returns `/@{handle}` for a handle and `null` for `null`.
- Manual verification (browser): pill appears signed-in / absent signed-out,
  links to `/@{handle}`; editor bar shows avatar + name/handle + link + Sign out.
- Guard: no `@wordpress` import is added to the reading-page (home) bundle
  (the auth chain is already `@wordpress`-free; `AuthorPill` imports only it).
- No `render.ts` / fidelity changes (no new blocks).

## Out of scope

- Sign-out from the home page (stays in the editor).
- A dropdown/menu on the pill.
- Any change to the public author page (`/[author]`) itself.
- Caching the profile across pages / a shared cross-page session store.
