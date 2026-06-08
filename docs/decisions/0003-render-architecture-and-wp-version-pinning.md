# 0003 — Render architecture & @wordpress version pinning

- **Status:** Accepted (validated empirically by the SP0 spike)
- **Date:** 2026-06-08
- **Scope:** The public/reading render path (SP4 inherits this) + dependency management

This decision records two findings the SP0 spike surfaced, because they were
non-obvious and shape the whole project.

## Finding 1 — The editor stack cannot render server-side; reading pages use a dependency-free renderer

### Context
Brief §6 says to render the stored block tree to HTML "using the same WordPress
packages that produced it" (`@wordpress/blocks` + `@wordpress/block-library`). The
spike tried exactly that on a server-rendered Astro page and hit a wall:

1. Importing `@wordpress/block-library` pulls `@wordpress/date`, whose module-load
   `setupWPTimezone()` crashes under Vite SSR (`moment-timezone` fails to augment
   `moment` — a CJS/ESM interop failure).
2. Bundling the packages for SSR (`vite.ssr.noExternal`) fixed that, but then
   `@wordpress/block-editor` references **`window` at import** — fatal in pure Node.

`@wordpress/block-editor`/`block-library` are browser-only by construction. They
run in the editor (browser) and in tests (jsdom), but **cannot render at the
Node/edge tier** a read-through renderer needs (brief §2: no DB, edge hosting).

### Options
- **A. DOM-shim the edge (jsdom).** Heavy; jsdom isn't Cloudflare-Workers-compatible.
  Reintroduces editor weight on every render. Rejected.
- **B. Pre-render HTML at publish time, store/serve it.** Lightest edge, but stores a
  redundant representation and doesn't serve the read-*through* case (rendering other
  people's articles fetched live from their PDS). Rejected for v1.
- **C. A dependency-free renderer for the curated block set, fidelity-locked to the
  real packages by tests.** ✅ **Chosen.**

### Decision
Reading pages render the block tree to HTML with `src/lib/blocks/render.ts`, which
imports **nothing** from `@wordpress/*`. It covers the curated allowlist
(Decision 0002) and runs anywhere (Node build, Cloudflare/Vercel edge, browser).

Fidelity is guaranteed by `render.test.ts`: it compares `renderBlocks()` output to
`@wordpress/blocks.serialize()` (the real save functions) for the curated blocks,
running in the Vitest/jsdom environment where the full stack works. So the real
Gutenberg output is the oracle; the runtime renderer carries none of its weight.

`@wordpress/*` therefore appears in exactly two places: the **editor island**
(browser) and **tests** (oracle) — never in a reading-page bundle.

### Consequences
- Reading pages ship **0 JS** (verified: `/preview`, `/` reference no `_astro/*.js`).
- Adding a block to the allowlist means adding a `render.ts` case **and** a fidelity
  assertion — the test fails until they match Gutenberg. Good pressure.
- `textContent` (`blocksToText`) lives in the same dependency-free module.
- Image/gallery/pullquote/embed rendering is stubbed pending SP3 (blobs) / SP4
  (oEmbed, sanitisation, responsive images). The reader must also **sanitise** stored
  HTML before injection (untrusted PDS content) — tracked for SP4.

## Finding 2 — The whole @wordpress tree must be version-pinned

### Context
`@automattic/isolated-block-editor@2.30.0` pins its direct `@wordpress/*` deps to a
specific line (the `*.24.0` line: `block-editor@14.19.0`, `core-data@7.24.0`,
`element@6.24.0`, `data@10.24.0`, …). But several transitive packages declare caret
ranges (`@wordpress/editor` → `patterns@^2.24.0`, `→ fields@^0.16.0`), which npm
resolves to the **newest** matching version — the `*.48.0` line. That produced:

- Duplicate `@wordpress/data` (10.24 **and** 10.48) and `core-data` (7.24 **and** 7.48)
  → a split-brain store registry → `BlockEditor` throws
  `Cannot read properties of undefined (reading 'get')` at runtime.
- `@wordpress/sync` skew: `core-data@7.24.0` imports `createSyncProvider` from a
  `sync@1.48.0` that no longer exports it → Rollup build failure.
- A newer nested `@wordpress/compose` with a CJS/ESM interop break on
  `@wordpress/is-shallow-equal`.

These were a whack-a-mole until addressed at the root.

### Decision
Pin the **entire** `@wordpress/*` tree to the exact versions
`isolated-block-editor@2.30.0` bundles, via npm `overrides` in `package.json` (plus
`react`/`react-dom` at `18.3.1` per Decision 0001). One consistent version set →
single copy of every singleton (`data`, `core-data`, `element`, `compose`,
`is-shallow-equal`, …) → editor boots, builds cleanly, no shims.

A `vite.resolve.dedupe` for `react`, `react-dom`, `@wordpress/element`,
`@wordpress/data` backstops the bundler.

### Consequences
- **This is the project's biggest maintenance liability.** Upgrading
  `isolated-block-editor` means regenerating the entire override map to its new pinned
  line. A script/check to detect drift from the editor's bundled versions is worth
  adding (tracked).
- We earlier tried a `@wordpress/sync` shim; pinning made it unnecessary and it was
  removed. If a future skew can't be pinned away, the shim pattern (re-export the real
  module by file path + add missing exports) is the documented fallback.
- `vite.ssr.noExternal` for `@wordpress/*` + `moment` remains, needed if any
  server-evaluated code (not reading pages) ever imports a WP package.
