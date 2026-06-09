# Editor lede / excerpt field + description fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give writers a visible lede field in the editor, persist it as the document +
Bluesky-card `description`, and when it's blank derive a brief excerpt from the post text at
publish time so the card and `og:description` are never empty.

**Architecture:** A single pure helper (`deriveExcerpt`) is the one excerpt convention,
shared by the browser publisher and the server reader. The publisher computes
`description = lede.trim() || deriveExcerpt(textContent)` once and writes it to both records.
The editor gains a controlled `<textarea>` whose value rides the existing
`PublishPanel.description → publish()` path. `og:description` already prefers the stored
`description`, so no separate meta change is needed.

**Tech Stack:** TypeScript, Astro (SSR reader), React 18 (editor island), vitest + jsdom,
`@atproto/api`. Design spec: `docs/superpowers/specs/2026-06-09-editor-lede-excerpt-design.md`.

**Conventions to match:**
- Tabs for indentation; spaces inside `( … )` and `[ … ]` (see existing files).
- Tests: `import { describe, expect, it } from 'vitest'`. Component tests use raw
  `react-dom` (`renderToStaticMarkup`, or `createRoot` + `act` with
  `IS_REACT_ACT_ENVIRONMENT = true`) — there is no `@testing-library/react`.
- `.astro` pages can't be unit-rendered; they're pinned with source-grep tests (see
  `_[rkey].meta.test.ts`). Colocated `src/pages/**` tests MUST be underscore-prefixed
  (AGENTS.md §8).
- Run a single test file with: `npx vitest run <path>`.

---

### Task 1: `deriveExcerpt` pure helper

**Files:**
- Create: `src/lib/publish/excerpt.ts`
- Test: `src/lib/publish/excerpt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/publish/excerpt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveExcerpt } from './excerpt';

describe( 'deriveExcerpt', () => {
	it( 'returns empty string for empty or whitespace-only input', () => {
		expect( deriveExcerpt( '' ) ).toBe( '' );
		expect( deriveExcerpt( '   \n\t ' ) ).toBe( '' );
	} );

	it( 'returns short text unchanged, with no ellipsis', () => {
		expect( deriveExcerpt( 'A short lede.' ) ).toBe( 'A short lede.' );
	} );

	it( 'collapses internal whitespace and newlines to single spaces', () => {
		expect( deriveExcerpt( 'one\n\ntwo   three' ) ).toBe( 'one two three' );
	} );

	it( 'truncates long text on a word boundary with a trailing ellipsis', () => {
		const long = 'word '.repeat( 100 ).trim(); // 499 chars, all word boundaries
		const result = deriveExcerpt( long );
		expect( result.endsWith( '…' ) ).toBe( true );
		// Body (sans ellipsis) stays within the limit and never splits a word.
		const body = result.slice( 0, -1 );
		expect( body.length ).toBeLessThanOrEqual( 200 );
		expect( body.endsWith( 'word' ) ).toBe( true );
		expect( body.endsWith( ' ' ) ).toBe( false );
	} );

	it( 'honours a custom maxChars and cuts at the last space within it', () => {
		expect( deriveExcerpt( 'alpha beta gamma', 10 ) ).toBe( 'alpha…' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/publish/excerpt.test.ts`
Expected: FAIL — `Failed to resolve import "./excerpt"` / `deriveExcerpt is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/publish/excerpt.ts`:

```ts
/**
 * A brief plain-text excerpt for a document/card description (the og:description fallback).
 * Collapses runs of whitespace to single spaces, cuts on a word boundary at or before
 * `maxChars`, and appends an ellipsis when it had to truncate. Returns '' for empty or
 * whitespace-only input. Pure + dependency-free (no `@wordpress/*`, no network) so it is
 * safe in BOTH the server reader and the browser publisher (AGENTS.md §3).
 */
export function deriveExcerpt( text: string, maxChars = 200 ): string {
	const normalized = text.replace( /\s+/g, ' ' ).trim();
	if ( normalized.length <= maxChars ) {
		return normalized;
	}
	const slice = normalized.slice( 0, maxChars );
	const lastSpace = slice.lastIndexOf( ' ' );
	const cut = lastSpace > 0 ? slice.slice( 0, lastSpace ) : slice;
	return `${ cut.trimEnd() }…`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/publish/excerpt.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/excerpt.ts src/lib/publish/excerpt.test.ts
git commit --no-gpg-sign -m "Add deriveExcerpt helper for description fallback"
```

---

### Task 2: Publish-time description fallback

**Files:**
- Modify: `src/lib/publish/publisher.ts` (imports; `publish()` ~line 77 + the three
  `description:` sites; `updateDocument()` ~line 182)
- Test: `src/lib/publish/publisher.test.ts` (add cases)

- [ ] **Step 1: Write the failing tests**

Add to the top imports of `src/lib/publish/publisher.test.ts` (alongside the existing
imports):

```ts
import { deriveExcerpt } from './excerpt';
import { blocksToText } from '../blocks/render';
```

Add a new `describe` block to `src/lib/publish/publisher.test.ts`:

```ts
describe( 'publish — description fallback', () => {
	it( 'derives the description from the post text when none is provided', async () => {
		const { agent, created } = mockAgent();
		await publish( agent, { did: DID, handle: HANDLE }, { title: 'Hello', blocks: BLOCKS, ...TARGET } );

		const expected = deriveExcerpt( blocksToText( BLOCKS ) );
		expect( expected.length ).toBeGreaterThan( 0 );
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record;
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: { description: string } };
		};
		expect( doc.description ).toBe( expected );
		expect( post.embed.external.description ).toBe( expected );
	} );

	it( 'uses the provided description verbatim (trimmed) in both records', async () => {
		const { agent, created } = mockAgent();
		await publish(
			agent,
			{ did: DID, handle: HANDLE },
			{ title: 'Hello', blocks: BLOCKS, description: '  Hand-written lede  ', ...TARGET }
		);
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record;
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: { description: string } };
		};
		expect( doc.description ).toBe( 'Hand-written lede' );
		expect( post.embed.external.description ).toBe( 'Hand-written lede' );
	} );

	it( 'omits the document description (and posts empty) when there is no text and no lede', async () => {
		const emptyBlocks: BlockNode[] = [
			{ name: 'core/paragraph', attributes: { content: '' }, innerBlocks: [] },
		];
		const { agent, created } = mockAgent();
		await publish( agent, { did: DID, handle: HANDLE }, { title: 'Hello', blocks: emptyBlocks, ...TARGET } );
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record;
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: Record< string, unknown > };
		};
		expect( 'description' in doc ).toBe( false );
		expect( post.embed.external.description ).toBe( '' );
	} );

	it( 'updateDocument derives the description from the post text when none is provided', async () => {
		const { agent, put } = mockAgent();
		await updateDocument(
			agent,
			{ did: DID, handle: HANDLE },
			{
				rkey: '3kdoc',
				siteUri: TARGET.publicationUri,
				publicationSlug: 'my-blog',
				publishedAt: '2026-06-08T00:00:00.000Z',
				title: 'Hello again',
				blocks: BLOCKS,
			}
		);
		expect( put[ 0 ].record.description ).toBe( deriveExcerpt( blocksToText( BLOCKS ) ) );
	} );
} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/publish/publisher.test.ts`
Expected: FAIL — the new cases see `doc.description === undefined` / `post...description === ''`
because `publisher.ts` still forwards `input.description` raw (no fallback yet).

- [ ] **Step 3: Implement the fallback**

In `src/lib/publish/publisher.ts`, add the import near the existing relative imports
(after the `blocksToText` import line):

```ts
import { deriveExcerpt } from './excerpt';
```

In `publish()`, right after the `const textContent = blocksToText( input.blocks );` line
(~line 77), add:

```ts
		// When the writer leaves the lede blank, derive a brief excerpt from the body so the
		// document description AND the Bluesky card description are never empty (the og:image's
		// text twin). Written into the record, not just the rendered meta.
		const description = input.description?.trim() || deriveExcerpt( textContent );
```

Then replace all three `description: input.description,` occurrences inside `publish()` (the
two `buildDocumentRecord` calls and the one `buildBskyPost` call) with:

```ts
				description,
```

In `updateDocument()`, replace the inline `textContent: blocksToText( input.blocks ),` in
the `buildDocumentRecord` call with a lifted const + derived description. Add, just after
`const articleUrl = canonicalArticleUrl( … );`:

```ts
		const textContent = blocksToText( input.blocks );
		const description = input.description?.trim() || deriveExcerpt( textContent );
```

…and in that function's `buildDocumentRecord` call, set `textContent,` (the lifted const)
and replace `description: input.description,` with `description,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/publish/publisher.test.ts`
Expected: PASS — the four new cases plus all pre-existing `publish`/`updateDocument` cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/publisher.ts src/lib/publish/publisher.test.ts
git commit --no-gpg-sign -m "Derive a description excerpt at publish time when the lede is blank"
```

---

### Task 3: Unify the reader's og:description fallback

**Files:**
- Modify: `src/pages/[author]/[slug]/[rkey].astro` (import; line 89)
- Test: `src/pages/[author]/[slug]/_[rkey].meta.test.ts` (add source-pin cases)

- [ ] **Step 1: Write the failing test**

Add these cases inside the existing `describe( 'document page Open Graph wiring', … )` in
`src/pages/[author]/[slug]/_[rkey].meta.test.ts`:

```ts
	it( 'derives the og:description fallback via deriveExcerpt (shared with publish)', () => {
		expect( page ).toMatch(
			/import\s*\{\s*deriveExcerpt\s*\}\s*from\s*'[^']*lib\/publish\/excerpt'/
		);
		expect( page ).toMatch( /doc\.description\s*\|\|\s*deriveExcerpt\(\s*textContent\s*\)/ );
	} );

	it( 'no longer hand-rolls the textContent.slice fallback', () => {
		expect( page ).not.toMatch( /textContent\.slice\(\s*0,\s*200\s*\)/ );
	} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/pages/[author]/[slug]/_[rkey].meta.test.ts"`
Expected: FAIL — the page still imports nothing from `excerpt` and still uses
`textContent.slice( 0, 200 )`.

- [ ] **Step 3: Implement the change**

In `src/pages/[author]/[slug]/[rkey].astro`, add to the frontmatter imports (next to the
other `lib/publish` import):

```ts
import { deriveExcerpt } from '../../../lib/publish/excerpt';
```

Replace line 89:

```ts
				description = doc.description || textContent.slice( 0, 200 );
```

with:

```ts
				description = doc.description || deriveExcerpt( textContent );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/pages/[author]/[slug]/_[rkey].meta.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/[author]/[slug]/[rkey].astro" "src/pages/[author]/[slug]/_[rkey].meta.test.ts"
git commit --no-gpg-sign -m "Use deriveExcerpt for the reader's og:description fallback"
```

---

### Task 4: Thread the lede through PublishPanel

**Files:**
- Modify: `src/components/PublishPanel.tsx` (Props interface; destructure; `publish()` +
  `updateDocument()` calls)
- Test: `src/components/PublishPanel.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/PublishPanel.test.tsx` (tests the editing path — it calls `run()`
directly with no confirm dialog, so it's the cleanest forwarding seam):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Agent } from '@atproto/api';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

// Mock the publish layer so we can assert what PublishPanel forwards.
const updateDocument = vi.fn( async () => ( { documentUri: 'at://x', articleUrl: 'https://x' } ) );
const publish = vi.fn( async () => ( {
	publicationUri: 'at://p',
	documentUri: 'at://d',
	postUri: 'at://post',
	articleUrl: 'https://x',
} ) );
vi.mock( '../lib/publish/publisher', () => ( { publish, updateDocument } ) );

import PublishPanel from './PublishPanel';

const EDITING = {
	rkey: '3kdoc',
	siteUri: 'at://did:plc:me/site.standard.publication/pub1',
	siteSlug: 'my-blog',
	publishedAt: '2026-06-08T00:00:00.000Z',
};

beforeEach( () => {
	updateDocument.mockClear();
	publish.mockClear();
} );

async function clickUpdate( description: string ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	await act( async () => {
		root.render(
			createElement( PublishPanel, {
				agent: {} as Agent,
				identity: { did: 'did:plc:me', handle: 'me.test' },
				blocks: [ { name: 'core/paragraph', attributes: { content: 'Body' }, innerBlocks: [] } ] as never,
				blobRegistry: new Map(),
				publications: [],
				editing: EDITING,
				title: 'A title',
				description,
			} )
		);
	} );
	const button = Array.from( container.querySelectorAll( 'button' ) ).find(
		( b ) => b.textContent === 'Update'
	)!;
	await act( async () => {
		button.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) );
	} );
	root.unmount();
	container.remove();
}

describe( 'PublishPanel', () => {
	it( 'forwards the lede to updateDocument as description', async () => {
		await clickUpdate( 'My hand-written lede' );
		expect( updateDocument ).toHaveBeenCalledTimes( 1 );
		expect( updateDocument.mock.calls[ 0 ][ 2 ] ).toMatchObject( {
			description: 'My hand-written lede',
		} );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PublishPanel.test.tsx`
Expected: FAIL — `description` is not a prop yet (TypeScript error / `undefined` forwarded),
so the `toMatchObject` assertion fails.

- [ ] **Step 3: Implement the prop**

In `src/components/PublishPanel.tsx`:

Add to the `Props` interface (after the `title: string;` field):

```ts
	/** The lede / excerpt for the document + Bluesky-card description (blank → auto-derived). */
	description: string;
```

Add `description` to the destructured props in the function signature (after `title,`):

```ts
	description,
```

In the `editing` branch of `run()`, add `description` to the `updateDocument` call object
(after `title: title.trim(),`):

```ts
						description,
```

In the non-editing branch, add `description` to the `publish` call object (after
`title: title.trim(),`):

```ts
						description,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PublishPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PublishPanel.tsx src/components/PublishPanel.test.tsx
git commit --no-gpg-sign -m "Forward the lede through PublishPanel as description"
```

---

### Task 5: The lede field in the editor (Studio + CSS)

**Files:**
- Modify: `src/components/Studio.tsx` (new `excerpt` state; hydrate on edit-load; reset in
  `startNew` + `onComplete`; auto-grow effect; render the `<textarea>`; pass
  `description={ excerpt }`)
- Modify: `src/styles/editor-chrome.css` (`.studio__lede`, `.studio__lede-hint`, editor
  adjacency)

> No unit test: `Studio` imports `SkyEditor`, which imports `@automattic/isolated-block-editor`
> (browser-only, touches `window`/registries at import — unrenderable in jsdom, AGENTS.md §3).
> The behavioural contract is already locked by Task 2 (publisher) and Task 4 (PublishPanel
> forwarding). This task is verified by `npm run check` + the full suite + a manual smoke.

- [ ] **Step 1: Add the `excerpt` state**

In `src/components/Studio.tsx`, after `const [ title, setTitle ] = useState( '' );`:

```tsx
	const [ excerpt, setExcerpt ] = useState( '' );
```

- [ ] **Step 2: Hydrate on edit-load**

In the `getMyArticle( … ).then( ( article ) => { … } )` block, right after
`setTitle( article.title );`:

```tsx
						setExcerpt( article.description ?? '' );
```

- [ ] **Step 3: Reset on new article / after a new publish**

In `startNew`, after `setTitle( '' );`:

```tsx
			setExcerpt( '' );
```

In the `onComplete` handler's `if ( ! editing ) { … }` block, after `setTitle( '' );`:

```tsx
								setExcerpt( '' );
```

- [ ] **Step 4: Add the auto-grow ref + effect**

Add a ref near the other refs (after `const registry = useRef< BlobRegistry >( … ).current;`):

```tsx
	const ledeRef = useRef< HTMLTextAreaElement >( null );
```

Add an effect (next to the other `useEffect`s) so the textarea grows to fit its content,
including when hydrated from an edit-load:

```tsx
	// Grow the lede textarea to fit its content (and on hydrate from an edit-load).
	useEffect( () => {
		const el = ledeRef.current;
		if ( ! el ) {
			return;
		}
		el.style.height = 'auto';
		el.style.height = `${ el.scrollHeight }px`;
	}, [ excerpt ] );
```

(`useEffect` and `useRef` are already imported on line 1.)

- [ ] **Step 5: Render the field and pass it to PublishPanel**

Add `description={ excerpt }` to the `<PublishPanel … />` props (after `title={ title }`):

```tsx
							description={ excerpt }
```

Insert the lede field between the title `<input … />` and `<SkyEditor … />`:

```tsx
						<textarea
							ref={ ledeRef }
							className="studio__lede"
							rows={ 1 }
							maxLength={ 3000 }
							placeholder="Add a lede… (defaults to the opening of your post)"
							aria-label="Lede"
							value={ excerpt }
							onChange={ ( event ) => setExcerpt( event.target.value ) }
						/>
						{ excerpt.length > 200 && (
							<p className="studio__lede-hint">
								Long ledes get truncated on the Bluesky card.
							</p>
						) }
```

- [ ] **Step 6: Add the styles**

In `src/styles/editor-chrome.css`, replace the existing editor-adjacency rule:

```css
/* Tighten the gap between the title and the editor surface below it. */
.studio__title + .skypress-editor {
	margin-top: 0.75rem;
}
```

with the lede styles + updated adjacency (the editor now follows the lede or its hint, not
the title):

```css
/* Italic lede under the title — echoes the title (display face, borderless) but quieter:
   smaller, muted, italic. Auto-grows via JS (resize/overflow off). */
.studio__lede {
	display: block;
	max-width: var(--studio-measure);
	margin: 0.5rem auto 0;
	padding: 0 var(--studio-gutter);
	width: 100%;
	box-sizing: border-box;
	border: 0;
	background: transparent;
	color: var(--muted);
	font-family: var(--font-display);
	font-size: 1.2rem;
	font-style: italic;
	line-height: 1.4;
	resize: none;
	overflow: hidden;
}
.studio__lede::placeholder {
	color: var(--muted);
	opacity: 0.6;
}
.studio__lede:focus {
	outline: none;
}
.studio__lede-hint {
	max-width: var(--studio-measure);
	margin: 0.25rem auto 0;
	padding: 0 var(--studio-gutter);
	font-size: 0.8rem;
	color: var(--muted);
}
/* Tighten the gap between the lede (or its hint) and the editor surface below. */
.studio__lede + .skypress-editor,
.studio__lede-hint + .skypress-editor {
	margin-top: 0.75rem;
}
```

- [ ] **Step 7: Type-check and run the full suite**

Run: `npm run check`
Expected: no TypeScript errors.

Run: `npm test`
Expected: all suites pass (including Tasks 1–4).

- [ ] **Step 8: Manual smoke (real browser)**

Start the dev server and verify on `http://127.0.0.1:<port>` (atproto loopback — NOT
`localhost`, AGENTS.md §7):

```bash
npm run dev
```

1. Sign in, start a new article, type a title and body. A muted italic "Add a lede…" field
   sits directly under the title; typing in it grows it; past ~200 chars the truncation hint
   appears.
2. Publish with the lede **filled** → in the network tab (or pdsls) confirm the new
   `site.standard.document` has your `description`, and the `app.bsky.feed.post`
   `embed.external.description` matches.
3. Publish another with the lede **blank** → confirm both records carry the auto-derived
   opening of the post (not empty).
4. Open an existing article for editing → the lede field is pre-filled from the stored
   `description`.

- [ ] **Step 9: Commit**

```bash
git add src/components/Studio.tsx src/styles/editor-chrome.css
git commit --no-gpg-sign -m "Add the lede field to the editor"
```

---

### Task 6: Docs reflection + final verification

**Files:**
- Modify (if needed): `AGENTS.md` / a `docs/decisions/NNNN-*.md` for durable rationale

- [ ] **Step 1: Decide whether the rationale graduates to a decision doc**

The publish-time "blank lede → derived excerpt, written into the record" behaviour is a
non-obvious product call (a future reader might expect the field to stay empty). If it
warrants a durable record, add `docs/decisions/NNNN-description-excerpt-fallback.md`
(context: bare Bluesky cards; options: auto-derive vs require; choice: visible lede +
publish-time fallback; why) following the format of existing decision docs. Otherwise note
here that the design spec is sufficient and skip.

- [ ] **Step 2: Full verification**

Run: `npm run check && npm test`
Expected: clean type-check; all suites pass.

- [ ] **Step 3: Commit any doc changes**

```bash
git add docs/ AGENTS.md
git commit --no-gpg-sign -m "Document the description excerpt fallback"
```

(Skip if Step 1 produced no changes.)

---

## Self-review notes

- **Spec coverage:** lede field (Task 5) ✓; `deriveExcerpt` shared helper (Task 1) ✓;
  publish-time fallback into both records (Task 2) ✓; PublishPanel passes it through
  (Task 4) ✓; reader og:description prefers stored description + unified fallback (Task 3) ✓;
  `maxLength=3000` guard + soft ~200 hint (Task 5) ✓; edit-load hydrate / resets (Task 5) ✓.
- **Out of scope (per spec):** image/thumb half (separate spec), live excerpt preview, RSS
  unification — none planned here, by design.
- **Type consistency:** `deriveExcerpt( text: string, maxChars = 200 )` used identically in
  Tasks 1–3; `description` prop is `string` in PublishPanel (Task 4) and Studio passes the
  `string` state `excerpt` (Task 5); publisher accepts the existing optional
  `description?: string` on `PublishInput` / `UpdateInput` (no signature change needed).
```
