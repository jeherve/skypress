# 0021 — Use the Gutenberg block editor directly; drop isolated-block-editor and the override map

- **Status:** Accepted (validated empirically + full test/build/browser smoke pass)
- **Date:** 2026-06-18
- **Scope:** The editor island's dependency stack + `@wordpress/*` version management.
  **Supersedes Finding 2 of Decision 0003** ("The whole @wordpress tree must be
  version-pinned"). Finding 1 of 0003 (the reader/render split) is unchanged and still
  load-bearing — see Consequences. Decision 0003 is **not** deleted; read it for the
  history of the crash this decision finally resolves.

## Context

SkyPress's editor was built on `@automattic/isolated-block-editor` (IBE) — a single
package that wraps the Gutenberg block-editor stack behind an `<IsolatedBlockEditor>`
component. That choice carried two costs:

1. **IBE is effectively maintenance-only.** Its recent commits are Dependabot-only
   bumps, its README still describes itself as "experimental", and it advertises
   `Requires: Gutenberg 16.9` — an old line with known WordPress 6.6+ incompatibilities.
   Building on it pinned SkyPress's editor to a stack the upstream is no longer actively
   evolving.

2. **IBE forced the entire `@wordpress/*` tree to be version-pinned.** IBE bundles an
   old `@wordpress` line (the `*.24.0` line), but several transitive packages declare
   caret ranges that npm floats to the *newest* matching line (`*.48.x`). That mismatch
   produced duplicate `@wordpress/data` / `core-data` registries → a split-brain store →
   `Cannot read properties of undefined (reading 'get')` at editor boot. Decision 0003
   fought this by pinning the **whole** `@wordpress/*` tree (~60 packages) to IBE's exact
   bundled versions via an `overrides` map — and 0003 itself called that map
   **"the project's biggest maintenance liability."** Every IBE bump would have required
   regenerating the entire map by hand.

The maintainer feedback and the project owner both wanted to leave the outdated, pinned
line behind and track the **current** release of each `@wordpress` package. Going direct
decouples SkyPress's upgrade cadence from IBE's.

## Options

- **A. Stay on IBE; keep the override map; periodically regenerate it.** Lowest immediate
  effort, but locks the editor to a maintenance-only wrapper on an old Gutenberg line, and
  keeps the ~60-package override map as a standing liability. Rejected.
- **B. Stay on IBE but float `@wordpress/*` to current.** Not possible without forking —
  IBE's own direct deps pin the old line; floating the rest just re-creates the
  split-brain crash 0003 documented. Rejected.
- **C. Drop IBE and compose the Gutenberg block-editor packages directly at the current
  release line, deleting the override map.** ✅ **Chosen.** More code in
  `SkyEditor.tsx` (we own the provider/toolbar/canvas composition IBE used to hide), but
  it removes the wrapper, removes the override map, and lets every `@wordpress` package
  track its current line.

## Decision

Replace `@automattic/isolated-block-editor` with direct dependencies on the Gutenberg
block-editor packages at the **current** release line, and **delete the override map.**

### Dependency swap (`package.json`)

- **Removed:** `@automattic/isolated-block-editor`.
- **Added (current line):** `@wordpress/block-editor@15.21.1`,
  `@wordpress/components@35.0.1`, `@wordpress/compose@8.1.1`,
  `@wordpress/format-library@5.48.1`, `@wordpress/hooks@4.48.1`,
  `@wordpress/keyboard-shortcuts@5.48.1`, `@wordpress/rich-text@7.48.1`,
  `@wordpress/data@10.48.1`, `@wordpress/icons@14.0.1`.
- **Bumped:** `@wordpress/blocks@15.21.1`, `@wordpress/block-library@9.48.1`,
  `@wordpress/element@8.0.1`.
- **Deleted the ~60-package `overrides` map.** The only remaining pins are
  `react`/`react-dom` at `18.3.1` (Decision 0001 still holds — block-editor's React peer
  is `^18`).
- **Added** `@types/node@25.9.2` to `devDependencies` — it was previously only a
  transitive dep of the removed packages, and tests import `node:fs` / `node:path` /
  `node:url`.

### Editor composition (`src/components/SkyEditor.tsx`)

`SkyEditor` is rewritten to compose Gutenberg primitives directly instead of rendering
`<IsolatedBlockEditor settings={{ iso: { … } }} … />`:

```
ShortcutProvider
  └─ SlotFillProvider
       └─ BlockEditorProvider (value / onInput / onChange / settings)
            ├─ toolbar: Inserter + undo/redo Buttons + a BlockInspector-in-Popover cog
            └─ canvas: BlockTools
                          └─ BlockEditorKeyboardShortcuts.Register
                          └─ WritingFlow > ObserveTyping > BlockList
            └─ Popover.Slot
```

The **same prop contract is preserved** (`onChange`, `mediaUpload`, `initialBlocks`).
Core blocks are registered and pruned to the curated allowlist via the existing
`registerSkyPressBlocks()`; default inline formats come from a side-effect
`import '@wordpress/format-library'`; the `@`-mention format/autocompleter
(Decision 0019) and the `registerMediaUpload` `editor.MediaUpload`-disabling filter are
unchanged.

**Undo/redo is app-level**, via `useStateWithHistory` from `@wordpress/compose`
(`onInput` = staged history, `onChange` = committed step), bound to `mod+z` /
`mod+shift+z` through a capture-phase keydown handler. (IBE used to own this.)

The editor island now imports the editor/component/block CSS itself — components,
block-editor (style + content), block-library (common / style / editor / theme).
`@wordpress/format-library` ships **no `build-style` export subpath**, so its CSS is
intentionally not imported; its inline-format UI is styled by the components +
block-editor stylesheets.

### Empirical finding — one current line de-dupes the registries

Resolving the whole tree to the **current** line, with **no** override map, produces a
**single** copy of every `@wordpress` store singleton: `data@10.48.1`,
`core-data@7.48.1`, `element@8.0.1`, `blocks` / `block-editor@15.21.1`,
`compose@8.1.1`, `sync@1.48.1`. The split-brain crash Decision 0003 fought was caused
*specifically* by IBE pinning an **old** line while transitive caret ranges floated to a
**newer** one. Remove the old pin and let the whole tree float to **one current line** and
the registries are coherent and single. **The override map is therefore no longer
needed** — its entire purpose was to reconcile the old-vs-new collision that no longer
exists.

One sharp edge remains, though, and it is **not** solved by removing overrides:
`@wordpress/core-data` (registers the `core` store) and `@wordpress/notices` (registers
`core/notices`) install as **multiple nested copies with no hoisted top-level one** —
npm does not flatten them on its own. Each copy registers its store at module load, so
the browser logs `Store "core" is already registered` / `Store "core/notices" is already
registered` and you get a split registry. The fix is the bundler-level **dedupe backstop**
(the same mechanism Decision 0003 already used for `data` / `element`): run `npm dedupe`
to hoist a single top-level copy, and list `@wordpress/core-data`, `@wordpress/notices`,
and `@wordpress/date` (alongside `data`, `element`, `blocks`, `block-editor`) in
`resolve.dedupe` in **both** `astro.config.mjs` and `vitest.config.ts`. Without the
hoisted copy, `resolve.dedupe` actually *breaks the build* (it points imports at a
top-level `@wordpress/notices` that does not exist) — so `npm dedupe` first, then dedupe
in the bundler. After both, the editor boots with a **clean console** (no store warnings)
and the tests run without the `already registered` noise.

### Inline (non-iframe) composition

The editor is composed inline (i.e. **not** inside `BlockCanvas`'s iframe) to fit
SkyPress's seamless title → lede → body writing surface and to reuse the existing
token-driven chrome styles (`src/styles/editor-chrome.css`, re-pointed from IBE's
`.iso-editor` / `.interface-interface-skeleton__*` / `.edit-post-*` DOM to
`.skypress-editor__toolbar` / `__body` / `__inspector` + the standard `.block-editor-*`
classes).

### Test/build config

- `vitest.config.ts`: add `ssr.noExternal: [/@wordpress\//]` so **Vite** (not Node's
  native ESM loader) transforms the `@wordpress` tree — Node rejects
  `@wordpress/blocks`' attribute-less `import … from './i18n-block.json'`, and a single
  inlined graph keeps the `@wordpress/data` + blocks store singletons consistent for the
  fidelity tests. **Crucially, `moment` / `moment-timezone` stay EXTERNAL** (native CJS):
  `moment-timezone` augments `moment` via `require('moment')`, which only lands on
  `@wordpress/date`'s default import when both resolve to Node's single CJS instance;
  inlining them splits the instance → `moment.tz` is undefined. A matching `define` for
  the `IS_GUTENBERG_PLUGIN` / `IS_WORDPRESS_CORE` globals is also added.
  - **Note the intentional config divergence:** the Cloudflare build in
    `astro.config.mjs` still *inlines* `moment` (there is no native `require` at the
    edge), so the two configs differ on purpose.
- `src/types/wordpress.d.ts`: add an ambient `declare module '@wordpress/block-editor'`
  (the package ships no type declarations — no `types` field, missing build-types)
  covering the components SkyPress imports.

## Consequences

- **Upgrading `@wordpress` is now a normal version bump.** Bump the packages together to
  their next current line and re-run the suite — there is no override map to regenerate.
  This retires the maintenance liability 0003 named. Two standing constraints survive the
  change:
  - **Keep `react` / `react-dom` pinned at `18.3.1`** (Decision 0001 — block-editor's
    React peer is `^18`; do not introduce React 19).
  - **Keep `moment` / `moment-timezone` EXTERNAL in `vitest.config.ts`** (see above) even
    while the Cloudflare build inlines `moment`.
- **The reader/render split (Decision 0003, Finding 1) is unchanged and still
  load-bearing.** Reading pages still use the dependency-free `src/lib/blocks/render.ts`;
  `@wordpress/*` still appears only in the editor island + tests. The render-fidelity
  test-lock (`render.test.ts` vs `@wordpress/blocks.serialize()`) still passes against the
  new packages — adding a block still means adding a `render.ts` case **and** a fidelity
  assertion.
- **We now own more editor composition.** The provider/toolbar/canvas wiring IBE hid lives
  in `SkyEditor.tsx`, including app-level undo/redo. The trade is deliberate: more local
  code, but no dependency on a maintenance-only wrapper and full control of the writing
  surface.
- **Verified.** `npm test` (82 files, 592 tests incl. the render/serialize fidelity lock),
  `npm run check` (0 errors), `npm run build` (editor island bundles; reading pages still
  ship ~0 JS — the homepage loads only a ~2 KB `AccountMenu` island, not the editor), and a
  real browser smoke test of `/write`: editor boots, block insertion + typing work, the
  live block tree forwards to the publish flow ("Draft saved · N block(s)"), undo/redo
  enable, and Publish enables.
