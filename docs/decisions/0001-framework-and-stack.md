# 0001 — Framework & application stack

- **Status:** Accepted
- **Date:** 2026-06-08
- **Scope:** Project-wide (SP0 and all later sub-projects inherit this)

## Context

SkyPress has two workloads with opposite characteristics living in one app:

1. **The editor** — a heavy, fundamentally *client-side* React application. It embeds
   Automattic's `@automattic/isolated-block-editor`, which bundles its own copy of the
   `@wordpress/*` packages (block-editor, block-library, components, …). This cannot be
   server-rendered; it boots in the browser.
2. **Public reading pages** — must be *fast and light* (brief §6, §10): edge/SSR-rendered
   HTML, minimal client JS, never shipping Gutenberg's weight to readers.

A single decision-gating fact constrains the whole stack. Verified directly from the npm
registry on 2026-06-08:

- `@automattic/isolated-block-editor@2.30.0` (latest; republished 2026-01-29 after being
  dormant since 2024-03 — so it **is** maintained).
- It declares **no `peerDependencies`** and pulls React transitively through
  `@wordpress/element@6.24.0`, which depends on **`react@^18.3` / `react-dom@^18.3`**.
- Therefore the editor requires **React 18**, and the host app must share a **single**
  React 18 instance with it (React forbids two copies — hooks break otherwise).

This makes React 19 (the default in Next.js 15 App Router) the wrong default path.

## Options considered

| Option | React story | Public-page story | Free host | Verdict |
|---|---|---|---|---|
| **Next.js 15 (App Router)** | Defaults to React 19; running RSC with pinned React 18 is fighting the framework | Good (RSC/edge) | Vercel | ✗ React-19 default fights the editor's React-18 lock; RSC adds friction for a fundamentally client-side editor |
| **Next.js 14 (Pages/App)** | React 18 | Good | Vercel | △ Viable but a step back onto an older line; heavier than needed for mostly-static reading pages |
| **Remix / React Router v7** | React 18-friendly | Good (loaders/SSR) | Vercel/CF | △ Solid, but every page carries the React runtime; less ideal for ~0-JS reading pages |
| **Vite + React 18 SPA only** | Full control of React version | Poor — no native SSR for light reading pages | static + functions | △ Great for the editor, but I'd have to bolt on SSR for §6 |
| **Astro + React 18 islands** | Pin `react@18.3` explicitly; no framework default to fight | Excellent — Astro's core strength is ~0-JS HTML pages | Vercel **or** Cloudflare adapter | ✅ **Chosen** |

## Decision

**Astro 6 + React 18 (`react@18.3.1`), React used only via islands.** One Astro project:

- `/editor` (and similar authoring routes) host the editor as a single
  `client:only="react"` island. Gutenberg's bundle loads **only** on that route and is
  never server-rendered — exactly matching how the editor must boot.
- Public routes (`/`, `/<handle>`, `/<handle>/<slug>`) are Astro pages rendered to light
  HTML at build/edge time. They render the stored block tree to HTML with the **same**
  `@wordpress/blocks` + `@wordpress/block-library` versions the editor bundles
  (`14.13.0` / `9.24.0`), so reading pages ship no editor JS.
- Server endpoints (OAuth callbacks, blob proxy, etc.) are Astro endpoints — added per
  sub-project as needed.
- React is pinned to `18.3.1` at the workspace root and **deduped** so the app and the
  editor share one instance. The SP0 spike verifies this empirically (no "invalid hook
  call" / duplicate-React errors).

Hosting target (Vercel vs Cloudflare) is deferred to SP7; Astro keeps both open via
`@astrojs/vercel` / `@astrojs/cloudflare`. Leaning Cloudflare for the read-through
renderer, with the OAuth-client runtime decision (SP1) able to influence it.

## Why

- **React 18 is non-negotiable** for the editor; Astro lets me pin it cleanly instead of
  fighting a framework's React-19 default.
- **Bundle isolation comes for free**: Astro ships per-island JS, so the heavy editor
  bundle is physically confined to authoring routes and reading pages stay light —
  directly satisfying brief §6/§10 ("keep reading pages fast and light despite
  Gutenberg's heft") without manual code-splitting gymnastics.
- **One app, dual deploy**: Astro adapters keep both free-tier hosts on the table (§8).
- **Vite underneath** gives modern, fast bundling and good control over the awkward
  `@wordpress/*` packages.

## Consequences & risks

- **Gutenberg-under-Vite bundling is the open risk** (the `@wordpress/*` packages
  sometimes assume a global `wp` and ship CSS). This is precisely what the SP0 spike
  de-risks empirically. **Fallback if Astro/Vite can't bundle the editor cleanly:** a
  two-surface monorepo — a plain Vite React SPA for the editor + Astro for public pages —
  or Next.js 14. Documented here so the fallback is pre-decided.
- **Version coupling** to `isolated-block-editor`'s pinned `@wordpress/*` line is a
  maintenance risk to track (brief §4). Render-path packages are pinned to the same
  versions to avoid drift.
- Astro's React integration must tolerate a very large `client:only` island; verified in
  SP0.

## Verification

Empirically proven by the SP0 spike: editor boots, `onSaveBlocks` yields a block array,
that array round-trips to HTML via the shared `@wordpress/blocks`, and the production
build reports the editor JS confined to the authoring route. See
`docs/specs/sp0-foundations-editor-spike.md`.
