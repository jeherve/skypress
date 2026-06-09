# Masthead account menu

**Date:** 2026-06-09
**Status:** Approved (design)

## Summary

The home page masthead (`/`) currently shows three things on the right:
`<AuthorPill>` (a signed-in avatar pill that links to the public author page),
a static **Dashboard** link, and a static **Studio** link (`/editor`). That is
three items when signed in and two when signed out.

This project consolidates the right side of the masthead into a single,
auth-aware control:

- **Signed out** (and during the pre-session loading beat, and with no JS): a
  single **Write** link → `/editor`.
- **Signed in**: a single **account menu** whose trigger shows the viewer's
  avatar + name + `@handle`, and whose dropdown contains **Dashboard**
  (`/dashboard`), **Write** (`/editor`), and **Profile** (`/@{handle}`).

It replaces the read-only `AuthorPill` with an interactive `AccountMenu` island
that reuses the same OAuth-session + profile-fetch flow.

## Constraints honored

- **Reading pages must never import `@wordpress/*`** (AGENTS.md rule 3). The auth
  chain (`createOAuthClient` → `profile.ts`) is already `@wordpress`-free;
  `AccountMenu` imports only it, so the editor bundle stays off the landing page.
- **OAuth is a browser public client** (AGENTS.md rule 7). The menu restores the
  session client-side only; it never runs server-side.
- The menu is **read-only navigation** — it does not sign in or sign out.
  Sign-out stays in the editor where it already lives.

## Decisions (from brainstorming)

- **Logged-out item:** a single **Write** link → `/editor`. The old static
  **Dashboard** and **Studio** links are removed from the masthead.
- **Profile destination:** the public author page `/@{handle}` (same target the
  current pill uses), via `authorPath()`.
- **Loading / no-JS behavior (chosen Option A):** the **Write** link is
  server-rendered in `index.astro`, so it appears instantly and works without
  JS. Signed-in users briefly see "Write", then the island swaps it for the
  account menu once the session resolves. A minor one-time morph is acceptable;
  an empty top-right or a skeleton is not.
- **Trigger interaction (chosen Option B):** the trigger **toggles the dropdown**
  rather than navigating. Dashboard is therefore an explicit menu item, and every
  destination is reachable on touch. (The brief's original "click the trigger →
  /dashboard" idea was dropped in favor of full touch reachability.)
- **Open/close affordances:** mouse hover (desktop enhancement), click/tap toggle
  (works on touch), and keyboard (focus trigger + Enter/Space). Closes on outside
  click, on `Escape`, and when focus leaves the menu.
- **Implementation approach:** static SSR Write link + a client-only island that,
  when signed in, renders the menu and marks its container so CSS hides the static
  Write link. (Not: making the whole right side one client-only component — that
  would drop the no-JS Write link. Not: a custom popover library — the project has
  no dropdown component and this is small enough to build directly.)

## Components & files

### New — `src/components/AccountMenu.tsx` (`client:only="react"`)

Replaces `AuthorPill.tsx`.

- On mount: `createOAuthClient()` → `client.init()`. No session / `init()` throws
  / profile fetch throws → render nothing (the static Write link stays; this is
  non-critical chrome, exactly as the pill behaves today).
- Session restored → build `Agent`, call `fetchViewerProfile`, render the menu.
- **Trigger:** a `<button>` showing avatar (initial-letter circle fallback when
  `avatar` is null), display name (`displayNameFor`), and `@handle`. Carries
  `aria-haspopup="menu"` and `aria-expanded`. Styled to match today's frosted
  `.authorpill` chip.
- **Dropdown:** `role="menu"` panel of `role="menuitem"` links built from
  `accountMenuItems()` (see helper). Opens on hover / click / keyboard; closes on
  outside click, `Escape`, and focus-out.
- On signed-in render, sets `data-signed-in` on `.masthead__right` (via a ref to
  the parent, or a documented effect) so CSS hides the sibling static Write link.

### New — pure helper in `src/lib/auth/profile.ts` (or a small sibling module)

```ts
export interface MenuItem {
  label: string;
  href: string;
}

// Builds the dropdown items for a signed-in viewer:
//   Dashboard → /dashboard, Write → /editor, Profile → /@{handle}.
// The Profile item is omitted when no handle is known (authorPath → null),
// rather than rendering a broken link.
export function accountMenuItems(profile: ViewerProfile): MenuItem[];
```

Keeps the navigation model in tested pure code; the island stays thin.
`displayNameFor` and `authorPath` already exist and are tested.

### Changed — `src/pages/index.astro`

- In `.masthead__right`: render a static `<a class="masthead-write" href="/editor">Write</a>`
  and `<AccountMenu client:only="react" />`. Remove the old `<AuthorPill>`, the
  Dashboard link, and the Studio link.
- Add styles to the existing `<style>` block: the `.masthead-write` chip, the
  trigger/dropdown (frosted panel consistent with `.btn--ghost` + per-phase
  `--sky-*` tokens), and `.masthead__right[data-signed-in] .masthead-write { display: none }`.
- Dropdown open/close transition respects `prefers-reduced-motion`.

### Removed — `src/components/AuthorPill.tsx`

Superseded by `AccountMenu`. Confirm no other importer before deleting
(home masthead is the only known consumer).

## Data flow & states

**Home (`/`):**
1. Static HTML renders instantly — logo + **Write** link. Works with no JS.
2. `AccountMenu` hydrates → `createOAuthClient()` → `client.init()`.
3. No session → renders nothing; Write link stays (signed-out state).
4. Session restored → `fetchViewerProfile` → menu renders, `data-signed-in` set,
   static Write link hidden (brief morph, no skeleton).

**Menu interaction (signed in):**
- Hover trigger → open. Mouse leaves menu region → close.
- Click/tap trigger → toggle.
- Focus trigger + Enter/Space → open; Tab moves through items; `Escape` closes
  and returns focus to the trigger.
- Click outside / focus-out → close.

## Error handling & edge cases

- `getProfile` fails → `fetchViewerProfile` returns nulls (keeps `did`); name
  falls back displayName → handle → DID; avatar → initial circle. Menu still works.
- No handle known → `authorPath` returns null → **Profile** item omitted;
  Dashboard and Write remain.
- `client.init()` throws → renders nothing; static Write link stays.
- Avatar `<img>` fails to load → `onError` fallback to the initial circle
  (same pattern as today's pill).

## Testing (test-first, repo convention)

This repo has **no React component-test setup**: vitest (jsdom) runs only
`src/**/*.test.ts` pure-logic tests; there is no `@testing-library`, and we do
**not** add one. We follow the established pattern — push testable logic into
pure helpers, unit-test those, and keep the React island thin (verified manually
+ type-check).

- `profile.test.ts` (extend existing):
  - `accountMenuItems` returns Dashboard (`/dashboard`), Write (`/editor`), and
    Profile (`/@{handle}`) in order for a profile with a handle.
  - `accountMenuItems` omits the Profile item when the handle is null.
- Manual verification (`npm run dev`): signed-out shows only Write → `/editor`;
  signed-in shows the trigger; hover/click/keyboard open the dropdown; the three
  items navigate correctly; `Escape` / outside-click close it; no-JS still shows
  the Write link.
- `npm run check` passes (types + lint).
- Guard: no `@wordpress` import reaches the home bundle (`AccountMenu` imports
  only the already-clean auth chain).

## Out of scope

- Sign-out / sign-in from the masthead (stays in the editor).
- Arrow-key roving focus inside the menu (Tab is sufficient for v1).
- Any change to the dashboard, editor, or public author pages themselves.
- Caching the profile across pages / a shared cross-page session store.
