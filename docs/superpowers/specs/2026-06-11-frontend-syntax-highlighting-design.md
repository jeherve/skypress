# Frontend syntax highlighting for single documents — design

**Date:** 2026-06-11
**Status:** Approved, ready for planning

## Goal

Colour code blocks on the public single-document reading page
(`/@<handle>/<slug>/<rkey>`) so that fenced code is syntax-highlighted instead of
rendered as flat monospace text. Frontend-only: no editor changes, works on all
existing content immediately.

Reference content (a JSON block, untagged): `@jeherve.com/tribulations-of-a-software-engineer/3mnykm4x75k2b`.

## Constraints that shaped the design

1. **The `core/code` block stores no language.** WordPress's code block has no
   language attribute, so stored markup is a bare `<pre class="wp-block-code"><code>…</code></pre>`.
   The highlighter must **auto-detect** the language from the code itself.
2. **Render fidelity is test-locked.** `render.test.ts` locks `render.ts` output to
   `@wordpress/blocks.serialize()`. Highlighting therefore must **not** live in
   `render.ts` — that would break the fidelity assertion and pollute the
   dependency-free render layer.
3. **Sanitise is the last step (AGENTS.md #6b / Decision 0018).** Highlighting runs
   *before* `sanitizeArticleHtml`, and its output must survive sanitisation.
4. **Reader pages stay JS-light and never import `@wordpress/*`** (Decision 0003).
   Highlighting runs **server-side** at render time; zero client JS is added.

## Decisions (settled during brainstorming)

| Question | Choice |
| --- | --- |
| Language source | **Auto-detect** (no editor/lexicon change) |
| Library | **highlight.js** — only mainstream lib with `highlightAuto`; BSD-3-Clause, GPL-compatible |
| Where it runs | **Server-side**, at render time |
| Languages registered | **Curated subset** (below) — leaner + more accurate auto-detect than the full ~190-grammar bundle |
| Theme | **Custom brand palette** built from existing design tokens, layered on the existing dark `<pre>` chrome |
| RSS | **Not highlighted** — opt-in flag; the page opts in, the feed does not |

### Registered languages

`javascript, typescript, json, bash` (shell), `php, python, xml` (html), `css,
scss, sql, yaml, markdown, diff, go, rust`.

Registered via `highlight.js/lib/core` + explicit `registerLanguage` calls, so only
these grammars load and only these are auto-detect candidates.

## Architecture

### Pipeline

`render-article.ts` gains one optional step, between render and sanitise:

```
resolveBlobImageUrls → renderBlocks → [highlightCodeBlocks] → sanitizeArticleHtml
```

`highlightCodeBlocks` runs only when the caller opts in. Sanitise stays last; the
highlighter's `<span class="hljs-…">` output is already permitted by the sanitiser
(`span` + `class` are allowlisted), so it passes through untouched.

### New module: `src/lib/reader/highlight.ts`

Dependency on `highlight.js` only (a standalone lib, not `@wordpress/*` — Decision
0003 holds). Single export:

```ts
export function highlightCodeBlocks( html: string ): string;
```

Behaviour:
- Matches each `<pre class="wp-block-code"><code>…</code></pre>` in the rendered HTML.
  Because `render.ts` entity-escapes block content (`<` → `&lt;`), the literal
  delimiter `</code></pre>` never appears inside a block's content, so the boundaries
  are unambiguous and safe to match.
- Decodes the captured inner content back to raw source (reuse the same entity set
  `render.ts` already handles).
- Runs `hljs.highlightAuto(raw, <registered subset>)`.
- Re-emits `<pre class="wp-block-code"><code class="hljs language-${lang}">${value}</code></pre>`,
  where `value` is highlight.js's already-escaped token HTML.

Degradation:
- **Block code only.** Inline `` `code` `` in prose (a `<code>` not wrapped in our
  `<pre class="wp-block-code">`) is left untouched.
- If `highlightAuto` throws or yields no confident result, fall back to the original
  plain escaped `<code>` — never worse than today.
- **`<br>` line breaks.** Some stored code blocks use `<br />` as their line
  separator; `render.ts` passes it through and the sanitiser keeps it as a real
  break. The highlighter converts `<br>` variants to real newlines (after decoding
  entities) **before** tokenising — otherwise hljs treats `<br>` as an xml tag and
  emits literal "`<br>`" text, collapsing the code's line structure. (Caught during
  live verification on the reference post; regression-tested.)

### `renderArticle` opt-in

```ts
renderArticle( doc, author, { highlight: true } );
```

- `[rkey].astro` passes `{ highlight: true }`.
- `publication-feed.ts` (RSS) calls `renderArticle` unchanged → stays plain.
- Default is `highlight: false`, so existing callers and tests are unaffected.

### Theme CSS

A small token stylesheet scoped to `.reader__article`, layered on the existing dark
`<pre>` chrome (`background: var(--ink)`, `color: var(--paper)`). It colours only the
common `hljs` token classes — no `background`/`padding` on `.hljs`, so it does not
fight the existing `pre` rules. Both light and dark site themes already flip
`--ink`/`--paper`, and the palette is built from existing tokens (`--sun`,
`--sun-strong`, `--muted`, etc.) so it follows suit.

Proposed mapping (to be tuned on screen):

| Token class | Colour |
| --- | --- |
| `hljs-comment`, `hljs-quote` | `var(--muted)`, italic |
| `hljs-keyword`, `hljs-selector-tag`, `hljs-literal` | `var(--sun)` |
| `hljs-string`, `hljs-attr`, `hljs-symbol` | `var(--sun-strong)` |
| `hljs-number`, `hljs-built_in`, `hljs-class` | a sky/teal accent (new token if none fits) |
| `hljs-title`, `hljs-function`, `hljs-name` | `var(--paper)` (slightly brighter than body) |
| `hljs-meta`, `hljs-tag`, punctuation | `var(--ink-soft)` lifted for contrast on dark |

Where styling lives: the `<style>` block already in `[rkey].astro` (it owns
`.reader__article :global(pre/code)` today), keeping code-block presentation in one
place.

## Testing

- **`highlight.test.ts`** (new): block detection, language auto-detection on a JSON
  sample (matching the reference post) and a couple of others, entity round-tripping,
  inline-`<code>`-left-alone, and graceful fallback on unhighlightable input. Assert
  the output is sanitiser-safe (only `span`/`class` tokens introduced).
- **`render-article.test.ts`**: `{ highlight: true }` produces `hljs` spans; default /
  omitted option produces today's plain output (RSS-path regression).
- **`render.test.ts`**: unchanged and still green — proof the fidelity lock is intact.

## Out of scope

- Editor language picker / storing language on the record (possible later follow-up;
  the opt-in highlighter would simply prefer a stored `class="language-X"` over
  auto-detect when present).
- Copy-to-clipboard buttons, line numbers, line highlighting.
- Highlighting in RSS, AMP, or other surfaces.

## Durable rationale

The "highlight as a post-render, pre-sanitise step in `render-article.ts`, opt-in per
surface" decision is non-obvious (it exists specifically to preserve the `render.ts`
fidelity lock and the sanitise-last invariant). If it survives review, graduate it to
a `docs/decisions/0019-*.md`.
