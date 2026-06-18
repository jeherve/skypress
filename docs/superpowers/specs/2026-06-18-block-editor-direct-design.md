# Block editor: direct Gutenberg dependency — design

**Date:** 2026-06-18
**Status:** Design — implemented (see plan `2026-06-18-block-editor-direct-plan.md` and
Decision 0021)
**Branch:** `lisbon-v2`

## Summary

Replace `@automattic/isolated-block-editor` (IBE) with the Gutenberg block-editor
packages used **directly**, and upgrade the whole `@wordpress/*` tree from the frozen,
IBE-bundled `*.24.0` line to the **current** release line. The editor island
(`SkyEditor.tsx`) composes the Gutenberg primitives itself instead of leaning on IBE's
`<IsolatedBlockEditor>` wrapper, and the ~60-package `overrides` map in `package.json`
that Decision 0003 called "the project's biggest maintenance liability" is deleted.

This is an internal dependency/architecture change. The editor's external prop contract
(`onChange`, `mediaUpload`, `initialBlocks`), the curated block allowlist, the
`@`-mention behaviour, and the reader/render split all stay the same.

## Goals

- Stop depending on a maintenance-only, "experimental" wrapper that pins an old Gutenberg
  line (`Requires: Gutenberg 16.9`, known WP 6.6+ incompat).
- Track the **current** release of each `@wordpress` package; decouple SkyPress's upgrade
  cadence from IBE's.
- Delete the override map so future `@wordpress` upgrades are a normal version bump, not a
  hand-regenerated 60-package pin set.
- Keep the editor's behaviour and prop contract identical so nothing downstream
  (`Studio`, `WriteStudio`, publish flow) has to change.
- Keep the test/build suite green, including the render-fidelity test-lock.

## Non-goals

- **Not** changing the reader/render path. Reading pages keep using the dependency-free
  `src/lib/blocks/render.ts`; `@wordpress/*` stays out of reading-page bundles
  (Decision 0003, Finding 1 — unchanged).
- **Not** expanding the curated block allowlist (Decision 0002). The same blocks are
  registered and pruned.
- **Not** moving the editor into `BlockCanvas`'s iframe. SkyPress wants a seamless
  title → lede → body surface and reuses its token-driven chrome styles; the editor stays
  composed inline.
- **Not** introducing React 19. block-editor's React peer is `^18`; `react`/`react-dom`
  stay pinned at `18.3.1` (Decision 0001).
- **Not** reworking undo/redo UX — only re-homing the implementation from IBE to
  app-level `useStateWithHistory`.

## Before / after

### Before (IBE)

`SkyEditor` rendered a single wrapper:

```
<IsolatedBlockEditor
  settings={{ iso: { … } }}
  onSaveBlocks={…}
  onLoad={…}
  onError={…}
/>
```

IBE owned the provider tree, toolbar, canvas, undo/redo, and the bundled `@wordpress`
line. `package.json` carried a ~60-package `overrides` map pinning the entire
`@wordpress/*` tree to IBE's exact bundled versions, plus a `vite.resolve.dedupe`
backstop, to avoid the split-brain duplicate-registry crash (Decision 0003, Finding 2).

### After (direct)

`SkyEditor` composes Gutenberg primitives itself:

```
ShortcutProvider
  └─ SlotFillProvider
       └─ BlockEditorProvider (value / onInput / onChange / settings)
            ├─ toolbar  : Inserter + undo/redo Buttons + BlockInspector-in-Popover cog
            └─ canvas   : BlockTools
                            └─ BlockEditorKeyboardShortcuts.Register
                            └─ WritingFlow > ObserveTyping > BlockList
            └─ Popover.Slot
```

`@wordpress/*` floats to one **current** line; the override map is gone; only
`react`/`react-dom` stay pinned.

## Component composition

- **`ShortcutProvider`** (`@wordpress/keyboard-shortcuts`) wraps everything so
  block-editor keyboard shortcuts register.
- **`SlotFillProvider`** + **`Popover.Slot`** (`@wordpress/components`) host the floating
  block toolbar, inserter, and inspector popovers.
- **`BlockEditorProvider`** (`@wordpress/block-editor`) is the store boundary. It receives
  `value` (the block tree), `onInput` (staged/intermediate change), `onChange` (committed
  change), and `settings`.
- **Toolbar:** an `Inserter`, undo/redo `Button`s wired to the app-level history, and a
  cog button that opens a `BlockInspector` inside a `Popover`.
- **Canvas:** `BlockTools` (floating block toolbar host) wrapping
  `BlockEditorKeyboardShortcuts.Register`, then `WritingFlow` > `ObserveTyping` >
  `BlockList` — the standard typing surface.
- **Undo/redo:** app-level, via `useStateWithHistory` (`@wordpress/compose`). `onInput`
  stages history; `onChange` commits a step. A **capture-phase** keydown handler binds
  `mod+z` / `mod+shift+z`.
- **Blocks/formats/mentions (unchanged):** `registerSkyPressBlocks()` registers core
  blocks and prunes to the allowlist; a side-effect `import '@wordpress/format-library'`
  loads default inline formats; the `@`-mention format/autocompleter (Decision 0019) and
  the `registerMediaUpload` `editor.MediaUpload`-disabling filter carry over verbatim.
- **CSS:** the editor island imports its own stylesheets — components, block-editor
  (style + content), block-library (common / style / editor / theme).
  `@wordpress/format-library` ships **no `build-style` export subpath**, so its CSS is
  intentionally omitted; its inline-format UI is styled by the components + block-editor
  stylesheets.

## Dependency strategy

- **Removed:** `@automattic/isolated-block-editor`.
- **Added (current line):** `@wordpress/block-editor@15.21.1`,
  `@wordpress/components@35.0.1`, `@wordpress/compose@8.1.1`,
  `@wordpress/format-library@5.48.1`, `@wordpress/hooks@4.48.1`,
  `@wordpress/keyboard-shortcuts@5.48.1`, `@wordpress/rich-text@7.48.1`,
  `@wordpress/data@10.48.1`, `@wordpress/icons@14.0.1`.
- **Bumped:** `@wordpress/blocks@15.21.1`, `@wordpress/block-library@9.48.1`,
  `@wordpress/element@8.0.1`.
- **Deleted** the ~60-package `overrides` map. Only `react`/`react-dom` stay pinned at
  `18.3.1`.
- **Added** `@types/node@25.9.2` to devDeps (was only a transitive dep of the removed
  packages; tests import `node:fs` / `node:path` / `node:url`).

**Why this de-dupes the registries.** The split-brain crash Decision 0003 fought came
from IBE pinning an **old** `@wordpress` line while transitive caret ranges floated to a
**newer** one — producing duplicate `data` / `core-data` registries. Removing the old pin
and letting the whole tree float to **one current line** resolves to a single copy of
every store singleton (`data@10.48.1`, `core-data@7.48.1`, `element@8.0.1`,
`blocks`/`block-editor@15.21.1`, `compose@8.1.1`, `sync@1.48.1`). The collision the
override map existed to reconcile no longer happens, so the map can go.

## Test / build config changes

- **`vitest.config.ts`**
  - `ssr.noExternal: [/@wordpress\//]` — let Vite (not Node's native ESM loader)
    transform the `@wordpress` tree. Node rejects `@wordpress/blocks`' attribute-less
    `import … from './i18n-block.json'`, and a single inlined graph keeps the
    `@wordpress/data` + blocks store singletons consistent for the fidelity tests.
  - **`moment` / `moment-timezone` stay EXTERNAL** (native CJS). `moment-timezone`
    augments `moment` via `require('moment')`, which only reaches `@wordpress/date`'s
    default import when both resolve to Node's single CJS instance; inlining them splits
    the instance and `moment.tz` becomes undefined.
  - a `define` for the `IS_GUTENBERG_PLUGIN` / `IS_WORDPRESS_CORE` globals.
  - **Intentional divergence:** `astro.config.mjs` (Cloudflare build) still *inlines*
    `moment` — there is no native `require` at the edge — so the two configs differ on
    purpose.
- **`src/types/wordpress.d.ts`:** add an ambient
  `declare module '@wordpress/block-editor'` (the package ships no type declarations — no
  `types` field, missing build-types) covering the imported components.
- **`src/styles/editor-chrome.css`:** re-point from IBE's `.iso-editor` /
  `.interface-interface-skeleton__*` / `.edit-post-*` DOM to
  `.skypress-editor__toolbar` / `__body` / `__inspector` + the standard `.block-editor-*`
  classes.

## Risks

- **Owning more composition.** The provider/toolbar/canvas wiring IBE hid now lives in
  `SkyEditor.tsx`, including undo/redo. Mitigation: app-level `useStateWithHistory` is
  small and the prop contract is unchanged, so the blast radius is confined to the island.
- **Future `@wordpress` bumps could re-introduce a registry split** if a subset is bumped
  while the rest lags. Mitigation: bump the `@wordpress` packages **together** to one
  line; the dedupe is a property of a single coherent line, not of the override map.
- **CJS/ESM `moment` fragility in tests.** Captured explicitly above and in Decision 0021:
  keep `moment`/`moment-timezone` external in vitest.
- **No upstream types for `@wordpress/block-editor`.** Covered by the ambient module
  declaration; it must be extended when SkyEditor starts importing new components.

## Verification

All green: `npm test` (82 files, 592 tests incl. the render/serialize fidelity lock),
`npm run check` (0 errors), `npm run build` (editor island bundles; reading pages still
ship ~0 JS — homepage only loads a ~2 KB `AccountMenu` island), and a real browser smoke
test of `/write` (editor boots; insertion + typing work; live block tree forwards to the
publish flow as "Draft saved · N block(s)"; undo/redo enable; Publish enables).

## Out of scope

- Reader/render path, block allowlist, iframe canvas, React 19, undo/redo UX — see
  Non-goals. Durable rationale graduates to Decision 0021.
