# Frontend Syntax Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Syntax-highlight code blocks on the public single-document reading page, server-side, with zero added client JS and no editor changes.

**Architecture:** A new dependency-free-of-`@wordpress` reader module (`highlight.ts`) transforms rendered code-block HTML with highlight.js's `highlightAuto`, slotted into `render-article.ts` as an opt-in step *between* `renderBlocks` and `sanitizeArticleHtml`. `render.ts` and its fidelity lock are untouched. The reader page opts in; RSS does not. A small brand-token theme colours the `hljs` tokens on the existing dark `<pre>` chrome.

**Tech Stack:** TypeScript, Astro (SSR), Vitest, highlight.js (BSD-3-Clause), `highlight.js/lib/core` + curated language registration.

**Spec:** `docs/superpowers/specs/2026-06-11-frontend-syntax-highlighting-design.md`

---

## File Structure

- **Create** `src/lib/reader/highlight.ts` — registers the curated language subset and exports `highlightCodeBlocks(html)`; the only file that imports `highlight.js`.
- **Create** `src/lib/reader/highlight.test.ts` — unit tests for detection, escaping, inline-code-untouched, fallback.
- **Modify** `src/lib/blocks/render.ts` — export the existing `decodeEntities` helper so `highlight.ts` reuses it (DRY; no output change → fidelity lock intact).
- **Modify** `src/lib/reader/render-article.ts` — add an opt-in `{ highlight?: boolean }` option that runs `highlightCodeBlocks` before sanitise.
- **Modify** `src/lib/reader/render-article.test.ts` — assert highlight on/off behaviour.
- **Modify** `src/pages/[author]/[slug]/[rkey].astro` — pass `{ highlight: true }`; add the token theme CSS to the existing `<style>` block.
- **Touch nothing** in `publication-feed.ts` (RSS) — it keeps calling `renderArticle` without the option, staying plain.

Test command throughout: `npx vitest run <path>` (project uses `vitest run`).

---

## Task 1: Add highlight.js and expose the shared entity decoder

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `src/lib/blocks/render.ts:87` (export `decodeEntities`)

- [ ] **Step 1: Install highlight.js**

Run:
```bash
npm install highlight.js@^11
```
Expected: `highlight.js` added to `dependencies` in `package.json`, no peer-dep errors.

- [ ] **Step 2: Export `decodeEntities` from render.ts**

In `src/lib/blocks/render.ts`, change the helper's declaration from:

```ts
function decodeEntities( input: string ): string {
```

to:

```ts
export function decodeEntities( input: string ): string {
```

(No other change — the function body and all call sites stay identical, so `render.test.ts` output is unchanged.)

- [ ] **Step 3: Verify the render fidelity lock is still green**

Run: `npx vitest run src/lib/blocks/render.test.ts`
Expected: PASS (proves exporting the helper changed no rendered output).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/blocks/render.ts
git commit --no-gpg-sign -m "Add highlight.js; export decodeEntities for reuse"
```

---

## Task 2: The `highlight.ts` module

**Files:**
- Create: `src/lib/reader/highlight.ts`
- Test: `src/lib/reader/highlight.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/reader/highlight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { highlightCodeBlocks } from './highlight';

const block = ( inner: string ) =>
	`<pre class="wp-block-code"><code>${ inner }</code></pre>`;

describe( 'highlightCodeBlocks', () => {
	it( 'tokenises a detected language into hljs spans', () => {
		// A clearly-JavaScript snippet; auto-detect should produce tokens.
		const out = highlightCodeBlocks( block( 'const answer = 42;' ) );
		expect( out ).toContain( 'class="hljs' );
		expect( out ).toContain( '<span class="hljs-' );
		// Still a single wp-block-code pre.
		expect( out ).toContain( '<pre class="wp-block-code"><code class="hljs' );
		expect( out ).toContain( '</code></pre>' );
	} );

	it( 'keeps escaped angle brackets escaped (no raw HTML injected)', () => {
		// render.ts stores code entity-escaped; markup must never be un-escaped into live tags.
		// (hljs splits the opening bracket into its own token span, so assert the escaped
		// bracket survives + no live <div> tag is injected — not a contiguous substring.)
		const out = highlightCodeBlocks( block( '&lt;div class="x"&gt;hi&lt;/div&gt;' ) );
		expect( out ).toContain( '&lt;' );
		expect( out ).not.toContain( '<div class="x">' );
	} );

	it( 'leaves inline <code> (not in a wp-block-code pre) untouched', () => {
		const html = '<p>Use <code>npm run dev</code> to start.</p>';
		expect( highlightCodeBlocks( html ) ).toBe( html );
	} );

	it( 'leaves non-code HTML untouched', () => {
		const html = '<h2 class="wp-block-heading">Title</h2><p>Body.</p>';
		expect( highlightCodeBlocks( html ) ).toBe( html );
	} );

	it( 'falls back to a plain wp-block-code block when nothing is highlightable', () => {
		// Empty content can yield zero-relevance auto-detect; must not throw or corrupt markup.
		const out = highlightCodeBlocks( block( '' ) );
		expect( out ).toContain( '<pre class="wp-block-code">' );
		expect( out ).toContain( '</code></pre>' );
	} );

	it( 'highlights every block when there are several', () => {
		const out = highlightCodeBlocks(
			block( 'const a = 1;' ) + '<p>mid</p>' + block( 'let b = 2;' )
		);
		// One highlighted wrapper per code block (token spans also carry hljs-* classes,
		// so count the <code> wrapper specifically, not every hljs class).
		const wrappers = out.match( /<code class="hljs/g ) ?? [];
		expect( wrappers.length ).toBe( 2 );
		expect( out ).toContain( '<p>mid</p>' );
	} );
} );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/reader/highlight.test.ts`
Expected: FAIL — `Cannot find module './highlight'`.

- [ ] **Step 3: Implement the module**

Create `src/lib/reader/highlight.ts`:

```ts
/**
 * Server-side syntax highlighting for the reader's code blocks (Decision: see
 * 2026-06-11 spec). Runs AFTER `renderBlocks` and BEFORE `sanitizeArticleHtml`
 * in `render-article.ts`: it only ever adds `<span class="hljs-…">` tokens, which
 * the sanitiser already allows, so sanitise stays the last step (AGENTS.md #6b).
 *
 * The `core/code` block stores no language, so we auto-detect among a CURATED
 * subset (fewer candidates → more accurate detection, leaner import). This module
 * is the only place `highlight.js` is imported; like `render.ts` it must never
 * import `@wordpress/*` (Decision 0003).
 */
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import { decodeEntities } from '../blocks/render';

const LANGUAGES: Record< string, Parameters< typeof hljs.registerLanguage >[ 1 ] > = {
	javascript,
	typescript,
	json,
	bash,
	php,
	python,
	xml,
	css,
	scss,
	sql,
	yaml,
	markdown,
	diff,
	go,
	rust,
};

for ( const [ name, lang ] of Object.entries( LANGUAGES ) ) {
	hljs.registerLanguage( name, lang );
}

// render.ts emits exactly this shape; content is entity-escaped, so `</code></pre>`
// only appears as our own delimiter, never inside a block's source.
const CODE_BLOCK = /<pre class="wp-block-code"><code>([\s\S]*?)<\/code><\/pre>/g;

function highlightOne( escapedSource: string ): string {
	const raw = decodeEntities( escapedSource );
	try {
		const { value, language, relevance } = hljs.highlightAuto( raw );
		// Zero relevance / no detected language → no useful tokens; keep it plain.
		if ( ! language || relevance === 0 ) {
			return `<pre class="wp-block-code"><code>${ escapedSource }</code></pre>`;
		}
		return `<pre class="wp-block-code"><code class="hljs language-${ language }">${ value }</code></pre>`;
	} catch {
		// Never let a highlighter error break a page — fall back to today's output.
		return `<pre class="wp-block-code"><code>${ escapedSource }</code></pre>`;
	}
}

/** Replace each rendered code block's body with highlight.js token markup. */
export function highlightCodeBlocks( html: string ): string {
	return html.replace( CODE_BLOCK, ( _full, inner: string ) => highlightOne( inner ) );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/reader/highlight.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reader/highlight.ts src/lib/reader/highlight.test.ts
git commit --no-gpg-sign -m "Add server-side code highlighter (highlight.js, curated subset)"
```

---

## Task 3: Opt-in wiring in `render-article.ts`

**Files:**
- Modify: `src/lib/reader/render-article.ts:14-46`
- Test: `src/lib/reader/render-article.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/reader/render-article.test.ts` (inside the existing `describe( 'renderArticle', … )` block):

```ts
	it( 'highlights code blocks only when opted in', () => {
		const doc = {
			content: {
				blocks: [ { name: 'core/code', attributes: { content: 'const answer = 42;' } } ],
			},
		};
		const off = renderArticle( doc, AUTHOR );
		const on = renderArticle( doc, AUTHOR, { highlight: true } );

		// Default (RSS path) stays plain.
		expect( off.html ).toContain( '<pre class="wp-block-code"><code>' );
		expect( off.html ).not.toContain( 'hljs' );

		// Opt-in produces sanitiser-safe token spans.
		expect( on.html ).toContain( 'class="hljs' );
		expect( on.html ).toContain( '<span class="hljs-' );
	} );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/reader/render-article.test.ts`
Expected: FAIL — `renderArticle` takes only 2 args / `on.html` has no `hljs`.

- [ ] **Step 3: Implement the option**

In `src/lib/reader/render-article.ts`:

Add the import near the top (after the existing imports, line ~16):

```ts
import { highlightCodeBlocks } from './highlight';
```

Add an options type below `RenderedArticle` (after line ~30):

```ts
export interface RenderOptions {
	/** Syntax-highlight code blocks (web page only — RSS stays plain). */
	highlight?: boolean;
}
```

Change the function signature and body:

```ts
export function renderArticle(
	doc: RenderableDocument,
	author: { pdsUrl: string; did: string },
	options: RenderOptions = {}
): RenderedArticle {
	const blocks = resolveBlobImageUrls( doc.content?.blocks ?? [], author );
	const rendered = renderBlocks( blocks );
	const highlighted = options.highlight ? highlightCodeBlocks( rendered ) : rendered;
	return {
		html: sanitizeArticleHtml( highlighted ),
		text: doc.textContent || blocksToText( blocks ),
	};
}
```

Update the function's doc comment to note the third parameter:

```ts
/**
 * Render a document's blocks to sanitised HTML and plain text. `author` is the
 * document's writer (current PDS + DID) — blob-backed image URLs are rebuilt
 * against it before rendering, so images survive a PDS migration. Pass
 * `{ highlight: true }` to syntax-highlight code blocks (web page only; the
 * highlight step runs before sanitise, so its token markup is sanitiser-checked).
 */
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/reader/render-article.test.ts`
Expected: PASS (new test + all existing ones, including the sanitise-last test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reader/render-article.ts src/lib/reader/render-article.test.ts
git commit --no-gpg-sign -m "render-article: opt-in syntax highlighting before sanitise"
```

---

## Task 4: Reader page wiring + token theme

**Files:**
- Modify: `src/pages/[author]/[slug]/[rkey].astro:62` (pass the option)
- Modify: `src/pages/[author]/[slug]/[rkey].astro:286-288` (add token CSS after the existing `code` rule)

No unit test (Astro page + CSS); verified by `npx astro check` and a visual pass.

- [ ] **Step 1: Opt the page into highlighting**

In `src/pages/[author]/[slug]/[rkey].astro`, change line 62 from:

```ts
		const rendered = renderArticle( doc, { pdsUrl, did } );
```

to:

```ts
		const rendered = renderArticle( doc, { pdsUrl, did }, { highlight: true } );
```

- [ ] **Step 2: Add the token theme to the existing `<style>` block**

In the same file, find the existing rule (around line 286):

```css
		.reader__article :global(code) {
			font-family: var(--font-mono);
		}
```

Immediately after it, add:

```css
		/* Syntax highlighting tokens, layered on the existing dark <pre> chrome.
		   No background/padding on .hljs so the pre styling above is untouched.
		   Colours come from the site tokens, which flip with the light/dark theme. */
		.reader__article :global(.hljs-comment),
		.reader__article :global(.hljs-quote) {
			color: var(--muted);
			font-style: italic;
		}
		.reader__article :global(.hljs-keyword),
		.reader__article :global(.hljs-selector-tag),
		.reader__article :global(.hljs-literal),
		.reader__article :global(.hljs-section),
		.reader__article :global(.hljs-tag) {
			color: var(--sun);
		}
		.reader__article :global(.hljs-string),
		.reader__article :global(.hljs-attr),
		.reader__article :global(.hljs-symbol),
		.reader__article :global(.hljs-bullet) {
			color: var(--sun-strong);
		}
		.reader__article :global(.hljs-number),
		.reader__article :global(.hljs-built_in),
		.reader__article :global(.hljs-class .hljs-title) {
			color: #7fb2c9;
		}
		.reader__article :global(.hljs-title),
		.reader__article :global(.hljs-function .hljs-title),
		.reader__article :global(.hljs-name) {
			color: var(--paper);
			font-weight: 600;
		}
		.reader__article :global(.hljs-meta),
		.reader__article :global(.hljs-comment .hljs-doctag) {
			color: var(--ink-soft);
		}
		.reader__article :global(.hljs-addition) {
			color: #7faa6b;
		}
		.reader__article :global(.hljs-deletion) {
			color: #c97f7f;
		}
		.reader__article :global(.hljs-emphasis) {
			font-style: italic;
		}
		.reader__article :global(.hljs-strong) {
			font-weight: 700;
		}
```

- [ ] **Step 3: Type-check the page**

Run: `npx astro check`
Expected: PASS (no type errors from the new third argument).

- [ ] **Step 4: Build to confirm SSR renders**

Run: `npm run build`
Expected: build succeeds (the `[rkey]` route is SSR/`prerender = false`, so this confirms imports resolve server-side without pulling `@wordpress` into the highlighter).

- [ ] **Step 5: Visual check against the reference post**

Run: `npm run dev` and open `http://127.0.0.1:<port>/@jeherve.com/tribulations-of-a-software-engineer/3mnykm4x75k2b`.
Expected: the JSON code block shows coloured tokens (string/keyword/number distinct), on the existing dark code background, in both light and dark OS themes. Confirm inline `code` in prose is unchanged.

- [ ] **Step 6: Commit**

```bash
git add "src/pages/[author]/[slug]/[rkey].astro"
git commit --no-gpg-sign -m "Reader page: enable syntax highlighting with on-brand token theme"
```

---

## Task 5: Full-suite regression + docs

**Files:**
- Modify (optional): graduate the rationale to `docs/decisions/0019-*.md` if it survives review.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — especially `render.test.ts` (fidelity lock), `sanitize.test.ts`, `render-article.test.ts`.

- [ ] **Step 2: Run the type checker**

Run: `npx astro check`
Expected: PASS.

- [ ] **Step 3 (optional): Record the decision**

If the post-render/pre-sanitise/opt-in approach holds up in review, create `docs/decisions/0019-frontend-syntax-highlighting.md` (context, options, choice, why) following the format of `0018-render-article-module.md`. Commit separately.

---

## Self-Review notes

- **Spec coverage:** auto-detect (Task 2 `highlightAuto`), highlight.js + curated subset (Task 2 `LANGUAGES`), server-side (Tasks 2–4), fidelity lock untouched (Task 1 Step 3 + Task 5 Step 1), sanitise-last/opt-in (Task 3), brand token theme (Task 4), RSS plain (Task 3 default-off test + untouched `publication-feed.ts`), degradation/inline-code/fallback (Task 2 tests). All covered.
- **Type consistency:** `highlightCodeBlocks(html: string): string` is defined in Task 2 and consumed unchanged in Task 3; `RenderOptions.highlight` is defined and used consistently in Tasks 3–4.
- **Note for the implementer:** in Task 2's first test, the asserted token colour/language is intentionally *not* pinned to a specific language string — auto-detect can pick `javascript`/`typescript` for `const answer = 42;`; the contract is "produces `hljs` tokens," not "detects language X."
