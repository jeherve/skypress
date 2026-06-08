# Empty-state "Create your first publication" CTA on the public author page

**Date:** 2026-06-09
**Status:** Approved (design)

## Summary

When a writer who has signed in visits their own public author page
(`/@{handle}`) and has **no publications yet**, the page shows a plain
`No SkyPress publications yet.` line. This project layers a
**"Create your first publication"** call-to-action next to that line —
visible *only* to the signed-in owner of the profile — linking to
`/dashboard`, where publications are created.

For every other visitor (logged out, or signed in as someone else) the page
is unchanged: the static empty-state text stands alone.

## Constraints honored

- **Reading pages must never import `@wordpress/*`** (AGENTS.md rule 3). The
  CTA reuses the existing `@wordpress`-free auth chain (`AuthProvider` →
  `oauth` → `config` / `media/pds`), same as the `AuthorPill` island, so no
  editor bundle reaches the reading page.
- **OAuth is a browser public client** (AGENTS.md rule 7). The CTA resolves the
  session client-side only; the empty-state text remains server-rendered.
- The CTA is **read-only** chrome — it links to `/dashboard`; it does not sign
  in, sign out, or create anything itself.

## Decisions (from brainstorming)

- **Audience:** owner-only. Render the CTA only when the signed-in viewer's
  DID equals the profile's DID (resolved server-side and passed to the island).
  A logged-in non-owner can only create publications under their *own* DID, so
  a button on someone else's profile would mislead.
- **Placement:** directly after the existing `No SkyPress publications yet.`
  paragraph, inside the `publications.length === 0` branch. The static text
  stays server-rendered (good for logged-out visitors and SEO); the button
  layers in for the owner once auth resolves.
- **Label & target:** "Create your first publication" → `/dashboard`. No
  deep-link that auto-opens the create form; `/dashboard` already surfaces
  "+ New publication" and its own empty-state prompt.
- **Loading / non-owner / signed-out / error:** render nothing extra. No
  skeleton — avoids flashing a placeholder at the common (non-owner) visitor.
- **Implementation approach:** a dedicated `client:only` island wrapping
  `AuthProvider`, mirroring `AuthorPill`. Gating logic extracted to a pure
  helper so it is unit-tested without a component-test framework.

## Components & files

### New — pure gating helper

A small pure function in a new file `src/lib/auth/cta.ts`, so the decision is
unit-testable without a component-test framework:

```ts
import type { AuthStatus } from './AuthProvider';

// True only when the signed-in viewer owns the profile being viewed.
export function isProfileOwner(
  status: AuthStatus,
  viewerDid: string | null,
  profileDid: string
): boolean {
  return status === 'signed-in' && viewerDid !== null && viewerDid === profileDid;
}
```

### New — CTA island: `src/components/CreatePublicationCta.tsx` (`client:only="react"`)

- Wraps `AuthProvider` (default export) around a thin gate, like `Studio` /
  `Dashboard`.
- Prop: `profileDid: string`.
- Gate consumes `useAuth()`, calls `isProfileOwner(status, did, profileDid)`.
  - `false` → render `null`.
  - `true` → render `<a class="author__cta" href="/dashboard">Create your
    first publication</a>`.

### Changed — `src/pages/[author]/index.astro`

- Import `CreatePublicationCta`.
- In the `publications.length === 0` branch, after the empty-state `<p>`, add
  `<CreatePublicationCta client:only="react" profileDid={did} />`.
- Add a `<style is:global>` rule for `.author__cta` (the island is
  `client:only`, so the page's scoped styles never reach it — same constraint
  noted in `dashboard.astro`). Style it as a sun-colored button matching
  `.dash__new`.

## Data flow & states

1. Server renders the profile page; the empty-state `<p>` is in the HTML
   immediately. `did` (profile DID) is already resolved server-side.
2. `CreatePublicationCta` hydrates → `AuthProvider` runs `createOAuthClient()`
   → `client.init()`.
3. No session / signed in as a different DID / `loading` / `error` → island
   renders nothing; only the static text shows.
4. Session restored AND viewer DID === profile DID → the
   "Create your first publication" button appears beneath the text.

## Error handling & edge cases

- `client.init()` throws → `AuthProvider` sets `status === 'error'`;
  `isProfileOwner` returns `false` → no button. The page is unharmed.
- Session restored but profile fetch within `AuthProvider` partially fails:
  irrelevant here — gating uses `status` and `did` only, both set as soon as
  the session is adopted.
- Profile DID is always present (the page 404s earlier if the author can't be
  resolved), so the prop is never empty.

## Testing (test-first)

Following the repo convention (no React component-test setup; vitest/jsdom runs
only pure-logic `src/**/*.test.ts`): test the **pure helper**, keep the island
thin, verify the island manually.

- `cta.test.ts` (new):
  - returns `true` when `status === 'signed-in'` and `viewerDid === profileDid`.
  - returns `false` when signed in as a different DID.
  - returns `false` when `viewerDid` is `null`.
  - returns `false` for `loading`, `signed-out`, and `error` statuses.
- Type-check: `npm run check`.
- Manual verification (`npm run dev`): own empty profile while signed in →
  button shows and links to `/dashboard`; signed out → text only; signed in as
  another account viewing the first profile → text only.
- Guard: no `@wordpress` import added to the reading-page bundle (the CTA
  imports only the already-`@wordpress`-free auth chain).
- No `render.ts` / fidelity changes (no new blocks).

## Out of scope

- A deep-link that auto-opens the create form on `/dashboard`.
- Any CTA for the non-empty state, or for non-owners.
- Changes to `/dashboard` itself.
- Mirroring the CTA onto a publication's empty post list (that already has its
  own "Open the studio" prompt).
