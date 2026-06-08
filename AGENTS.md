# Working agreement for SkyPress

SkyPress is built from a detailed brief (see `docs/` and the original build brief). This
file captures the durable, non-obvious constraints an agent needs before touching code.
Read the relevant `docs/decisions/*` and `docs/specs/*` before working in an area.

## Process

- **Brainstorm → spec → plan → build, test-driven.** Write the failing test first.
- **Record non-obvious calls** in `docs/decisions/NNNN-title.md` (context, options,
  choice, why). These are first-class deliverables.
- **Vertical slices over horizontal layers.** Keep the app runnable at every step.
- Each sub-project (SP0, SP1, …) gets its own spec in `docs/specs/`.

## Hard constraints (learned the hard way — see decisions)

1. **React 18 only.** The bundled `@wordpress/*` packages require `react@^18.3`. Do not
   introduce React 19. (Decision 0001)
2. **The entire `@wordpress/*` tree is version-pinned via `overrides` in
   `package.json`** to the exact line `@automattic/isolated-block-editor@2.30.0` bundles.
   Caret ranges otherwise pull a newer line and produce duplicate `@wordpress/data` /
   `core-data` registries → the editor crashes (`reading 'get' of undefined`). If you
   bump `isolated-block-editor`, **regenerate the whole override map** to its new line.
   (Decision 0003)
3. **Reading pages must never import `@wordpress/*`.** The editor stack is browser-only
   (touches `window`/`moment`/registries at import) and cannot render server-side. Use
   the dependency-free `src/lib/blocks/render.ts`. `@wordpress` belongs only in the
   editor island and in tests. (Decision 0003)
4. **Render fidelity is test-locked.** `render.ts` must match
   `@wordpress/blocks.serialize()` for the curated blocks — `render.test.ts` enforces it.
   Adding a block means adding a `render.ts` case **and** a fidelity assertion.
5. **Curated block allowlist is the content model.** Add blocks deliberately; removing
   one after content exists is a breaking change. (Decision 0002)
6. **Untrusted content:** stored block trees come from arbitrary PDSes. The reader must
   **sanitise** HTML before injecting it (tracked for SP4).

## Product guardrails (from the brief)

- SkyPress is an **editor + OAuth client + public renderer** — never a PDS or relay.
- **OAuth only** (no app passwords). Secrets never in the client.
- **Don't surprise users**: publishing also creates a Bluesky post — the UI must say so.
- Lexicon discipline: prefer optional fields + open unions; treat shipped constraints as
  frozen (additions only, else `-v2`). License: **GPL-2.0-only**.

## Commands

```sh
npm run dev | build | preview | test | check
```
