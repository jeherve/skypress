# SP0 — Foundations & Editor Spike

- **Date:** 2026-06-08
- **Status:** ✅ Complete — all 8 success criteria met (see Outcome below)
- **Goal (brief §9.1):** Prove the riskiest path end-to-end —
  `IsolatedBlockEditor → onSaveBlocks → block tree → render back via @wordpress/blocks` —
  and stand up the project skeleton everything else builds on. This de-risks the framework
  choice, the bundle-weight constraint, and rendering fidelity in one shot.

## Why this is first

Per brief §9, SP0 must precede everything. If Gutenberg can't bundle/run under the chosen
stack, or the block tree doesn't round-trip faithfully, the whole architecture is wrong —
better to learn that now, in a vertical slice, than after building auth/lexicon/images.

## Success criteria (definition of done)

1. **Stack scaffolded & runnable.** `npm run dev` serves an Astro app; `npm run build`
   produces a production build. (Brief: "ship something runnable early and keep it
   runnable.")
2. **Editor boots in the browser.** `/editor` mounts `IsolatedBlockEditor` with a curated
   block allowlist; you can type a paragraph, add a heading, an image placeholder, a list,
   a quote, code.
3. **`onSaveBlocks` captures the block tree.** Saving hands back the structured block
   **array** (not an HTML string). The spike persists it (to `localStorage` for SP0 — no
   PDS yet) and logs/serializes it.
4. **Round-trip fidelity (the core test).** A stored block tree serializes to block markup
   via the shared `@wordpress/blocks.serialize()`, parses back via `parse()`, and
   re-serializes **identically** (stable round-trip) using the same package versions the
   editor bundles. This is unit-tested.
5. **`textContent` extraction.** The block tree renders to clean plain text (needed later
   for brief §3's de-facto-required `textContent`). Unit-tested.
6. **Public render path.** A public route renders a stored block tree to HTML (server-side
   in Astro) shipping **no editor JS**. Verified by inspecting the build output / bundle.
7. **Single React instance.** No duplicate-React / invalid-hook-call errors — the app and
   editor share one `react@18.3.1`.
8. **Bundle measured.** Record the editor route's JS weight and the reading page's JS
   weight; confirm the reading page does not pull Gutenberg.

## Architecture (SP0 slice)

```
src/
  pages/
    index.astro          Landing placeholder (light)
    editor.astro         Hosts the editor island (client:only="react")
    preview.astro        Renders a stored block tree → HTML (server-side, no editor JS)
  components/
    SkyEditor.tsx        React island: IsolatedBlockEditor + onSaveBlocks + allowlist
  lib/blocks/
    allowlist.ts         Curated block set (the content model — see Decision 0002)
    register.ts          Register the curated core blocks for the render/serialize path
    serialize.ts         PURE, TESTABLE: blockTree ⇄ markup, blocksToText  ← TDD target
  lib/blocks/serialize.test.ts   Vitest unit tests (written FIRST)
```

### Data flow (SP0)

```
[browser] IsolatedBlockEditor --onSaveBlocks(blocks[])--> localStorage (JSON)
                                                              │
[server]  Astro preview.astro --reads JSON--> register curated blocks
                               --serialize(blocks)--> HTML --> light reading page
```

In later sub-projects, `localStorage` is replaced by the PDS record's `content` union
(SP2) and `preview.astro` becomes `/<handle>/<slug>` resolving via handle→DID→PDS (SP4).

## Curated block allowlist (initial — Decision 0002)

Start deliberately small (brief §4: "designing the allowlist *is* defining the content
model"). SP0 set: `core/paragraph`, `core/heading`, `core/image`, `core/gallery`,
`core/quote`, `core/pullquote`, `core/list` (+ `core/list-item`), `core/code`,
`core/separator`, `core/embed`. Refined in later sub-projects.

## TDD plan

Write failing tests first for `lib/blocks/serialize.ts`:

- `round-trips a paragraph + heading + list block tree to stable markup`
- `serialize → parse → serialize is idempotent for the curated block set`
- `blocksToText() yields clean plain text with block boundaries as newlines`
- `blocksToText() ignores non-text blocks (separator) gracefully`

Then implement until green. The editor island and Astro pages are validated by a browser
smoke test (Chrome DevTools) + build-output inspection rather than unit tests (DOM-heavy,
low unit-test value at the spike stage).

## Explicitly out of scope for SP0

OAuth (SP1), PDS reads/writes & lexicon (SP2), blob/image upload pipeline (SP3),
handle→DID→PDS resolution & real article URLs (SP4), edit semantics (SP5), brand polish
(SP6), deploy (SP7). SP0 uses `localStorage` and a hard-coded sample to prove the loop.

## Risks & fallback

- **Gutenberg-under-Vite bundling** is the named risk (Decision 0001). If it can't bundle
  cleanly: fall back to a Vite React SPA for the editor + Astro for public pages, or
  Next.js 14. Decision recorded before building so the pivot is fast.
- **Block markup round-trip drift** across versions: mitigated by pinning render-path
  `@wordpress/blocks`/`block-library` to the editor's bundled versions.

## Outcome (2026-06-08)

All eight criteria met. Verified evidence:

| # | Criterion | Result |
|---|---|---|
| 1 | Scaffolded & runnable | `npm run dev` + `npm run build` (3 pages) both succeed |
| 2 | Editor boots in browser | Full Gutenberg UI renders at `/editor` (inserter, toolbar, canvas, footer) |
| 3 | `onSaveBlocks` captures the tree | Typed a paragraph → `localStorage` holds `[{name:'core/paragraph', attributes:{content:'…'}}]`; status line updated |
| 4 | Round-trip fidelity | `serialize→parse→serialize` idempotent (Vitest) |
| 5 | `textContent` extraction | `blocksToText` correct incl. entity decode + recursion (Vitest) |
| 6 | Reading pages ship no editor JS | `/preview` & `/` reference **0** `_astro/*.js`; render server-side |
| 7 | Single React instance | Editor hydrates & functions; no duplicate-React/hook errors |
| 8 | Bundle measured | `/editor` island 5.4 MB raw / **1.5 MB gz** (+13 MB lazy vips worker); reading page 2 KB HTML + 16 KB gz CSS + 0 JS |

**Key architectural findings** (→ Decision 0003): the `@wordpress` editor stack can't
render server-side (browser-only `window`/`moment`/registry deps), so reading pages use a
**dependency-free renderer fidelity-locked to `@wordpress/blocks.serialize()`**; and the
whole `@wordpress` tree must be **version-pinned** to `isolated-block-editor`'s line via
`overrides` to avoid duplicate-registry crashes.

**Deferred to later SPs:** image/gallery/pullquote/embed rendering (SP3/SP4); HTML
**sanitisation** of untrusted PDS content before injection (SP4); the 13 MB vips worker
and 1.5 MB editor bundle are optimisation targets (lazy-load/trim) but don't touch reading
pages.
