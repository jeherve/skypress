# Working agreement for SkyPress

SkyPress is built from a detailed brief (see `docs/` and the original build brief). This
file captures the durable, non-obvious constraints an agent needs before touching code.
Read the relevant `docs/decisions/*` and `docs/specs/*` before working in an area.

## Process

- **Brainstorm → spec → plan → build, test-driven.** Write the failing test first.
- **Record non-obvious calls** in `docs/decisions/NNNN-title.md` (context, options,
  choice, why). These are first-class deliverables.
- **Vertical slices over horizontal layers.** Keep the app runnable at every step.
- **Where specs live.** `docs/specs/sp0`–`sp12` are the **archive of the initial v1 build**
  (all Built/Complete) — read them for the "how" and the cross-referenced `Depends on`
  history, but don't extend the SP numbering. New, post-v1 work gets a dated design + plan
  pair under `docs/superpowers/specs/` and `docs/superpowers/plans/`
  (e.g. `2026-06-09-editor-page-rework-design.md`). Durable rationale still graduates to a
  `docs/decisions/NNNN-*.md`.

## Hard constraints (learned the hard way — see decisions)

1. **React 18 only.** `@wordpress/block-editor@15.x` peer-depends on `react@^18`. Do not
   introduce React 19. (Decision 0001)
2. **SkyPress depends on `@wordpress/block-editor` and friends directly** at the current
   release line; there is **no `@wordpress/*` `overrides` map** (only `react`/`react-dom`
   stay pinned). Depending directly, the tree resolves to a single coherent copy of every
   store singleton — `@wordpress/data`, `core-data`, `element`, `blocks`, `block-editor` —
   without any overrides. The old duplicate-registry crash (`reading 'get' of undefined`)
   came specifically from IBE pinning an old line while transitive caret ranges floated a
   newer one; that root cause is gone. Upgrading is now a normal `@wordpress` version bump,
   **not** regenerating an override map. One caveat: `core-data` / `notices` / `date` install
   as multiple nested copies (no hoisted top-level one) and each registers its store →
   `Store "core" is already registered` + a split registry. The fix is the bundler dedupe
   backstop — run `npm dedupe`, then list them in `resolve.dedupe` in **both**
   `astro.config.mjs` and `vitest.config.ts` (deduping before the hoist *breaks* the build).
   (Decision 0021 — supersedes the pinning half of Decision 0003.)
3. **Reading pages must never import `@wordpress/*`.** The editor stack is browser-only
   (touches `window`/`moment`/registries at import) and cannot render server-side. Use
   the dependency-free `src/lib/blocks/render.ts`. `@wordpress` belongs only in the
   editor island and in tests. (Decision 0003)
4. **Render fidelity is test-locked.** `render.ts` must match
   `@wordpress/blocks.serialize()` for the curated blocks — `render.test.ts` enforces it.
   Adding a block means adding a `render.ts` case **and** a fidelity assertion.
5. **Curated block allowlist is the content model.** Add blocks deliberately; removing
   one after content exists is a breaking change. (Decision 0002)
6. **Untrusted content:** stored block trees come from arbitrary PDSes. The reader
   **sanitises** HTML before injecting it (`src/lib/reader/sanitize.ts`). Three standing
   rules for the read path: (a) any server-side `fetch` to a host derived from user input
   (a handle, `did:web`, a PDS `serviceEndpoint`) MUST go through `src/lib/net/safe-fetch.ts`
   (SSRF guard); (b) never inject PDS-sourced HTML without sanitising — turn document
   blocks into HTML through `src/lib/reader/render-article.ts`, which runs
   blob-resolve → render → sanitise in the one safe order (Decision 0018); (c) read routes
   resolve author/publication/document through `src/lib/reader/read-context.ts` — don't
   re-assemble the handle → DID → PDS → slug-match → site-join chain in page frontmatter.
   (Decision 0016)
7. **OAuth is a browser public client** (`@atproto/oauth-client-browser`, Decision 0004).
   In **dev you must serve on `http://127.0.0.1:<port>`, not `localhost`** (atproto
   loopback requirement), and the loopback `client_id` must be path-less — see
   `src/lib/auth/oauth.ts`. Auth + editor live in the `Studio` client-only
   (`client:only="react"`) island — the editor is composed directly from
   `@wordpress/block-editor`, not by wrapping `IsolatedBlockEditor`.
8. **Colocated tests under `src/pages/` MUST be underscore-prefixed** (e.g.
   `_index.meta.test.ts`). Astro's file router imports every `.ts` in `src/pages/` during
   static-path collection; a `*.test.ts` there runs its top-level `import … from 'vitest'`,
   which throws outside the vitest runner → the build's prerender server 500s
   (`Vitest failed to access its internal state`). A leading `_` makes Astro ignore the
   file as a route while vitest's `src/**/*.test.ts` glob still finds it.
9. **`@wordpress/*` is inlined via `ssr.noExternal` in the vitest config, but
   `moment`/`moment-timezone` stay external** (native CJS). Inlining moment breaks
   moment-timezone's augmentation of it (`moment.tz` ends up undefined). Separately,
   `@wordpress/block-editor` ships no types, so its surface is declared in
   `src/types/wordpress.d.ts`.

## Product guardrails (from the brief)

- SkyPress is an **editor + OAuth client + public renderer** — never a PDS or relay.
- **OAuth only** (no app passwords). Secrets never in the client.
- **Don't surprise users**: publishing also creates a Bluesky post — the UI must say so.
- Lexicon discipline: prefer optional fields + open unions; treat shipped constraints as
  frozen (additions only, else `-v2`). License: **GPL-2.0-or-later**.

## Commands

```sh
npm run dev | build | preview | test | check
```
