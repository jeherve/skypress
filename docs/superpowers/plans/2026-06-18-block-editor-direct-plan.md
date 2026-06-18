# Block editor: direct Gutenberg dependency — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking. **This plan has been executed — all phases are
> marked done.**

**Goal:** Replace `@automattic/isolated-block-editor` (IBE) with the Gutenberg
block-editor packages used directly, upgrade the whole `@wordpress/*` tree to the current
release line, and delete the ~60-package `overrides` map — without changing the editor's
prop contract, the curated block allowlist, or the reader/render split.

**Architecture:** `SkyEditor.tsx` composes Gutenberg primitives inline
(`ShortcutProvider` > `SlotFillProvider` > `BlockEditorProvider` > toolbar + canvas)
instead of rendering `<IsolatedBlockEditor>`. Undo/redo moves to app-level
`useStateWithHistory`. The override map goes away because one current `@wordpress` line
resolves to single store-singleton copies. See the design doc
`2026-06-18-block-editor-direct-design.md` and Decision 0021.

**Tech Stack:** React 18, TypeScript, Astro islands, the Gutenberg `@wordpress/*`
packages at their current line, Vitest (jsdom + `@wordpress/blocks.serialize()` fidelity
oracle), Vite (editor bundle), `@astrojs/cloudflare` (edge build), plain CSS.

---

## File touch list

- **Modify** `package.json` — remove IBE; add/bump the direct `@wordpress/*` deps; delete
  the `overrides` map (keep only `react`/`react-dom@18.3.1`); add `@types/node` to devDeps.
- **Modify** `src/components/SkyEditor.tsx` — rewrite to compose Gutenberg primitives
  directly; app-level undo/redo; same prop contract.
- **Modify** `vitest.config.ts` — `ssr.noExternal: [/@wordpress\//]`; keep
  `moment`/`moment-timezone` external; `define` the IS_GUTENBERG_PLUGIN/IS_WORDPRESS_CORE
  globals.
- **Modify** `src/types/wordpress.d.ts` — ambient `declare module '@wordpress/block-editor'`.
- **Modify** `src/styles/editor-chrome.css` — re-point from `.iso-editor`/`.edit-post-*` to
  `.skypress-editor__*` + `.block-editor-*`.
- **Create** `docs/decisions/0021-block-editor-direct-dependency.md` (ADR, supersedes 0003
  Finding 2).
- **Create** `docs/superpowers/specs/2026-06-18-block-editor-direct-design.md` (design).
- **Create** this plan.

---

### Phase 1 — Design + ADR ✅ DONE

- [x] **Step 1:** Capture the rationale (IBE maintenance-only + "experimental" +
  `Requires: Gutenberg 16.9`; the override map as the standing liability per 0003) and the
  decision to go direct at the current line in a design doc.
- [x] **Step 2:** Write ADR 0021, explicitly **superseding Finding 2 of Decision 0003**
  (not deleting 0003), recording the single-registry finding and why the override map is no
  longer needed.

### Phase 2 — Dependency swap + coherence check ✅ DONE

- [x] **Step 1:** Remove `@automattic/isolated-block-editor`.
- [x] **Step 2:** Add the direct deps at the current line (`block-editor@15.21.1`,
  `components@35.0.1`, `compose@8.1.1`, `format-library@5.48.1`, `hooks@4.48.1`,
  `keyboard-shortcuts@5.48.1`, `rich-text@7.48.1`, `data@10.48.1`, `icons@14.0.1`) and bump
  `blocks@15.21.1`, `block-library@9.48.1`, `element@8.0.1`.
- [x] **Step 3:** Delete the ~60-package `overrides` map; keep only `react`/`react-dom`
  pinned at `18.3.1`. Add `@types/node@25.9.2` to devDeps.
- [x] **Step 4:** Reinstall and **verify a single copy of every store singleton**
  (`data@10.48.1`, `core-data@7.48.1`, `element@8.0.1`, `blocks`/`block-editor@15.21.1`,
  `compose@8.1.1`, `sync@1.48.1`) — confirming the override map is unnecessary at one
  current line.

### Phase 3 — SkyEditor rewrite ✅ DONE

- [x] **Step 1:** Replace `<IsolatedBlockEditor>` with the inline provider/toolbar/canvas
  tree (`ShortcutProvider` > `SlotFillProvider` > `BlockEditorProvider` >
  toolbar(`Inserter` + undo/redo + inspector cog) + canvas(`BlockTools` >
  `BlockEditorKeyboardShortcuts.Register` + `WritingFlow` > `ObserveTyping` > `BlockList`)
  + `Popover.Slot`).
- [x] **Step 2:** Implement app-level undo/redo via `useStateWithHistory`
  (`onInput` = staged, `onChange` = committed) bound to `mod+z` / `mod+shift+z` with a
  capture-phase keydown handler.
- [x] **Step 3:** Preserve the prop contract (`onChange`, `mediaUpload`, `initialBlocks`);
  keep `registerSkyPressBlocks()`, the side-effect `import '@wordpress/format-library'`,
  the `@`-mention format/autocompleter, and the `registerMediaUpload` filter unchanged.
- [x] **Step 4:** Import the editor/component/block CSS in the island (components,
  block-editor style+content, block-library common/style/editor/theme); intentionally
  **skip** `@wordpress/format-library` CSS (no `build-style` export subpath).

### Phase 4 — CSS rework ✅ DONE

- [x] **Step 1:** Re-point `src/styles/editor-chrome.css` from IBE's `.iso-editor` /
  `.interface-interface-skeleton__*` / `.edit-post-*` DOM to
  `.skypress-editor__toolbar` / `__body` / `__inspector` + the standard `.block-editor-*`
  classes.

### Phase 5 — Test/build/foundation-doc updates ✅ DONE

- [x] **Step 1:** `vitest.config.ts` — add `ssr.noExternal: [/@wordpress\//]`; **keep
  `moment`/`moment-timezone` external** (CJS instance must stay single so `moment.tz`
  lands on `@wordpress/date`); add the IS_GUTENBERG_PLUGIN/IS_WORDPRESS_CORE `define`.
- [x] **Step 2:** Confirm `astro.config.mjs` still inlines `moment` at the edge — the two
  configs intentionally differ; note it.
- [x] **Step 3:** `src/types/wordpress.d.ts` — add the ambient
  `declare module '@wordpress/block-editor'` for the imported components (package ships no
  types).
- [x] **Step 4:** Update foundation docs — AGENTS.md / Decision references — so the
  version-pinning constraint now points at the "normal `@wordpress` bump" model (keep
  `react@18`; keep `moment` external in vitest) rather than override-map regeneration.

### Phase 6 — Verification ✅ DONE

- [x] **Step 1:** `npm test` → 82 files, 592 tests pass, **including** the
  render/serialize fidelity lock (`render.test.ts` vs `@wordpress/blocks.serialize()`).
- [x] **Step 2:** `npm run check` → 0 errors.
- [x] **Step 3:** `npm run build` → editor island bundles; **reading pages still ship
  ~0 JS** (homepage only loads a ~2 KB `AccountMenu` island, not the editor).
- [x] **Step 4:** Real browser smoke test of `/write` → editor boots; block insertion +
  typing work; the live block tree forwards to the publish flow ("Draft saved ·
  N block(s)"); undo/redo enable; Publish enables.

---

## Done criteria (all met)

- IBE removed; `@wordpress/*` on the current line; override map deleted.
- `SkyEditor` composes Gutenberg directly with the same prop contract; undo/redo
  app-level.
- Reader/render split unchanged; fidelity test-lock green.
- Full suite + check + build + browser smoke all pass.
- Decision 0021 + design doc + this plan recorded.
