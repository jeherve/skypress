# Editor & dashboard rework — shared app bar, cleaner writing surface

**Date:** 2026-06-09
**Status:** Approved (design)

## Summary

The `/editor` page does too much: it lists every published article, shows a
separate bordered title input, frames the block editor in a short box, and keeps
account identity + sign-out in a bar *below* the page header. This project
reworks the editor into a focused writing surface and introduces a single,
auth-aware top bar shared with `/dashboard`.

Five changes:

1. **Shared `AppBar`** across `/editor` and `/dashboard` — logo on the left;
   contextual nav + account identity + sign-out on the right.
2. **Drop the published-articles list** from the editor. Editing moves to the
   dashboard's Posts tab, which gains an **Edit** action that opens
   `/editor?edit=<rkey>`.
3. **Restyle the title** as a large, borderless heading (block-editor post-title
   feel) sitting *above* the editor canvas.
4. **Taller editor canvas** by default (~70vh) for long-form drafting.
5. **Contextual nav icon**: on `/dashboard`, a feather icon → `/editor`; on
   `/editor`, a "Publications" link → `/dashboard`.

## Decisions (from brainstorming)

- **One shared bar, two contexts.** A single `AppBar` React component renders at
  the top of both islands. The old static Astro headers (`editor-shell__bar`,
  `dash-shell__bar`) and the in-island `studio__account` bar are removed.
- **Contextual action is symmetric** — icon + label on both pages: feather +
  "Write" → `/editor` on the dashboard; book/Publications icon + "Publications"
  → `/dashboard` on the editor.
- **The account block is the profile link.** Avatar + name + `@handle` together
  form a single link to the public author page (`authorPath(handle)`). This
  replaces the separate "View my public page" link. Sign-out stays a distinct
  button beside it.
- **Editing is URL-driven (Option A from brainstorming).** The editor's article
  list is removed entirely; the dashboard becomes the single place to manage and
  open articles. An `?edit=<rkey>` param is sufficient because `rkey` uniquely
  identifies a document within the writer's repo, and it makes edit links
  shareable/bookmarkable.
- **Title above the canvas, borderless.** Not inside the canvas (rejected in
  brainstorming) — it sits above the framed editor as a large serif heading on
  the page background.
- **Editor min-height ≈ 70vh.** Comfortable for long-form without forcing
  fill-to-bottom.
- **Publish controls in a slim row above the title** (target selector + Publish
  button + editing indicator + "+ New article"). Not pinned to the bottom.

## Components & files

### New — `src/components/AppBar.tsx` (`client:only` via its host island)

Rendered inside `AuthProvider` (it consumes `useAuth`), at the top of both
`StudioGate` and `DashboardGate`, in **every** auth state.

- **Props:** `current: 'editor' | 'dashboard'`.
- **Left:** SkyPress `Logo` → `/`.
- **Right, by state:**
  - *loading* → nothing but the logo.
  - *signed-out* → contextual nav link only (no account/sign-out).
  - *signed-in* → contextual nav · account block · Sign out.
- **Contextual nav** comes from a pure helper (below) so the page→destination
  mapping is tested in isolation; the component just renders the returned
  `{ href, label, icon }`.
- **Account block:** a single `<a href={authorPath(handle)}>` wrapping avatar
  (initial-letter fallback on null/`onError`, matching today's pattern) + name
  (`displayNameFor`) + `@handle`. Omitted-handle → still renders name/avatar but
  not as a profile link (no broken `/@` link).
- **Sign out:** `<button onClick={signOut}>`.

### New — pure helper in `src/lib/auth/nav.ts` (small new module)

```ts
export interface AppBarNav {
  href: string;
  label: string;
  icon: 'feather' | 'publications';
}

// The contextual nav action for the bar, given the page it renders on:
//   editor    → { href: '/dashboard', label: 'Publications', icon: 'publications' }
//   dashboard → { href: '/editor',    label: 'Write',        icon: 'feather' }
export function appBarNav( current: 'editor' | 'dashboard' ): AppBarNav;
```

Keeps the navigation model in tested pure code; the island stays thin. The two
inline SVGs (feather, publications) live in `AppBar.tsx` keyed by `icon`.

### New — `getMyArticle` in `src/lib/publish/publisher.ts`

```ts
// Fetch a single SkyPress document by rkey for the editor's ?edit load.
// getRecord the document, resolve its publication slug via listPublications,
// and return a MyArticle. Returns null when the record is missing or its `site`
// isn't one of the writer's SkyPress publications (foreign / orphan doc).
export async function getMyArticle(
  agent: Agent,
  did: string,
  rkey: string
): Promise< MyArticle | null >;
```

Reuses the existing `toMyArticle` mapper and `RawDocValue` shape. Mirrors the
filtering rule in `listAllMyArticles` (only the writer's own SkyPress docs).

### Changed — `src/components/Studio.tsx`

- Render `<AppBar current="editor" />` at the top of `StudioGate` in all states.
- **Remove** the `studio__account` bar and the `<MyArticles>` section.
- **URL load:** on mount, read `?edit=<rkey>` (via `URLSearchParams`). If present
  and signed in, `getMyArticle(agent, did, rkey)` → on success seed `editing` +
  `blocks` (same as today's `startEdit`); on null, ignore and start fresh.
- **Title lifts up:** `title` state moves from `PublishPanel` to `StudioGate`.
  `StudioGate` renders the borderless `<input class="studio__title">` above the
  editor and passes `title` / `onTitleChange` to `PublishPanel`.
- **"+ New article"** clears the param (navigate to `/editor`) and resets state.
- The existing `studio__mode` indicator (`Editing: …` + "+ New article") is
  retained and sits in the publish row; `StudioGate` keeps ownership of it (it
  drives navigation/reset), rendered adjacent to `PublishPanel`.
- Layout order: `AppBar` → publish row (mode indicator + `PublishPanel`) → title
  input → `SkyEditor`.

### Changed — `src/components/PublishPanel.tsx`

- No longer renders the title `<input>` or owns title state. Receives
  `title: string` and `onTitleChange: (v: string) => void` as props (title still
  drives `canSubmit` and the publish/update calls).
- Keeps the target selector + Publish button + confirm flow. (The `Editing: …`
  indicator stays in `StudioGate`'s mode bar, rendered beside it.)

### Changed — `src/components/Dashboard.tsx`

- Render `<AppBar current="dashboard" />` at the top of `DashboardGate`.
- Remove the old `dash__bar` right-side actions (`Studio` link + Sign out) — now
  in `AppBar`. The **"Your publications" breadcrumb** stays as in-page nav.
- **Posts tab:** add an **Edit** action per article →
  `<a href={`/editor?edit=${article.rkey}`}>`. View link + Unpublish button stay.

### Changed — styles

- **New `src/styles/app-bar.css`** (global; imported by both `editor.astro` and
  `dashboard.astro`) holds all `.app-bar*` rules.
- `editor.astro` / `dashboard.astro`: drop the static `<header>` markup and its
  scoped styles; import `app-bar.css`.
- `editor-chrome.css`: remove `.studio__account*` and `.myarticles*` rules; add
  `.studio__title` (borderless serif heading) and bump the editor surface to
  `min-height: ~70vh` (exact node verified in-browser during implementation —
  likely the `.iso-editor` content region).

### Removed

- `src/components/MyArticles.tsx` and `src/components/MyArticles.test.tsx`
  (no remaining importer once the editor list is gone — confirm before deleting).

## Data flow & states

**Editor (`/editor`):**
1. `StudioGate` renders `AppBar` immediately (logo; account once session loads).
2. `?edit=<rkey>` present + signed in → `getMyArticle` → seed editor; else new.
3. Title typed above the canvas; publish row drives publish/update via lifted
   `title` state.

**Dashboard (`/dashboard`):**
1. `AppBar` with feather → `/editor`.
2. Posts tab Edit → `/editor?edit=<rkey>` (full navigation; editor re-fetches).

## Error handling & edge cases

- `getMyArticle`: record missing / `getRecord` throws / foreign `site` → returns
  `null`; the editor silently starts a new article (no crash, no error banner —
  a stale/bad edit link just opens a blank editor).
- No handle known → account block renders without a profile link (no broken
  `/@` href), consistent with the masthead `AccountMenu` rule.
- Avatar `<img>` fails → initial-letter fallback (existing `onError` pattern).
- Signed-out on `/editor` → `AppBar` shows logo + "Publications" link only; the
  page body shows the existing `LoginForm`.

## Testing (test-first, repo convention)

The repo favors **pure helpers unit-tested + thin islands** (per the masthead
spec); component-level `react-dom`/`act` tests exist (e.g.
`PublicationForm.test.tsx`) and are used only where behavior is genuinely
component-bound.

- **`nav.test.ts`** (new): `appBarNav('editor')` → Publications/`/dashboard`;
  `appBarNav('dashboard')` → Write/`/editor`.
- **`publisher.test.ts`** (extend): `getMyArticle` returns a `MyArticle` for an
  owned SkyPress doc; returns `null` for a missing rkey and for a doc whose
  `site` is foreign/unknown. (Mirrors existing `listAllMyArticles` test setup.)
- **Editor `?edit=` load** (`react-dom`/`act`, following `PublicationForm.test.tsx`):
  with `?edit=<rkey>` set, `StudioGate` calls `getMyArticle` and seeds the editor
  (title + blocks). Without the param, it starts empty.
- Manual verification (`npm run dev`): shared bar on both pages; contextual icon
  per page; account block → public page; sign-out; borderless title; taller
  canvas; dashboard Edit → editor loads the article.
- `npm run check` passes (types + lint). No new `@wordpress/*` import outside the
  editor island (`AppBar` / `nav.ts` / `getMyArticle` are `@wordpress`-free).

## Constraints honored

- **Reading pages never import `@wordpress/*`** (AGENTS.md rule 3): `AppBar`,
  `nav.ts`, and `getMyArticle` are `@wordpress`-free and live in the auth/editor
  islands only.
- **OAuth is a browser public client** (rule 7): `AppBar` consumes the existing
  client-only `useAuth`; nothing runs server-side.
- **No block/render changes** — render fidelity (rule 4) untouched.

## Out of scope

- The home-page masthead (`AccountMenu`) — separate, already specced.
- Autosave/draft changes, new block types, publish-flow behavior.
- A shared cross-page session/profile store.
- Arrow-key roving focus or a dropdown menu in the `AppBar` (it's flat links).
