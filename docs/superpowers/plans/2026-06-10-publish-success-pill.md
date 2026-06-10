# Publish Success Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a persistent, sunrise-themed "published" pill (with a link to the live article) after a writer publishes or updates, surviving the editor's post-publish remount.

**Architecture:** Lift the success indicator out of `PublishPanel` (which is destroyed by the `<div key={editorKey}>` remount on a new publish) and up into `Studio`, which renders it *outside* the keyed div. `PublishPanel.onComplete` carries `{ articleUrl, isEditing }` up; `Studio` stores it and renders a small presentational `PublishedPill`. The in-panel `done` state is removed.

**Tech Stack:** React 18, TypeScript, Astro islands, Vitest (`react-dom/client` + `act`), plain CSS.

---

## File Structure

- **Create** `src/components/PublishedPill.tsx` — presentational pill: emoji + short label + "Read it →" link. No state.
- **Create** `src/components/PublishedPill.test.tsx` — unit tests for both variants.
- **Modify** `src/components/PublishPanel.tsx` — change `onComplete` signature to carry `{ articleUrl, isEditing }`; remove the `done`-phase JSX block and the `resultUrl` state.
- **Modify** `src/components/PublishPanel.test.tsx` — assert `onComplete` receives the payload for both update and new-publish flows.
- **Modify** `src/components/Studio.tsx` — add `published` state, render `PublishedPill` below the `studio__mode` bar, clear it on title/lede typing and `startNew`.
- **Modify** `src/styles/editor-chrome.css` — sunrise pill styling + rise animation + reduced-motion guard.

---

### Task 1: PublishedPill component

**Files:**
- Create: `src/components/PublishedPill.tsx`
- Test: `src/components/PublishedPill.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/PublishedPill.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

import PublishedPill from './PublishedPill';

function render( props: { url: string; isEditing: boolean } ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	act( () => {
		root.render( createElement( PublishedPill, props ) );
	} );
	return {
		container,
		cleanup: () => {
			root.unmount();
			container.remove();
		},
	};
}

describe( 'PublishedPill', () => {
	it( 'shows the live copy and links to the article for a new publish', () => {
		const { container, cleanup } = render( {
			url: 'https://skypress.blog/jeherve.com/my-blog/hello',
			isEditing: false,
		} );
		expect( container.textContent ).toContain( "It's live" );
		const link = container.querySelector( 'a' )!;
		expect( link.getAttribute( 'href' ) ).toBe(
			'https://skypress.blog/jeherve.com/my-blog/hello'
		);
		expect( link.textContent ).toContain( 'Read it' );
		cleanup();
	} );

	it( 'shows the updated copy when editing', () => {
		const { container, cleanup } = render( {
			url: 'https://x',
			isEditing: true,
		} );
		expect( container.textContent ).toContain( 'Updated' );
		expect( container.textContent ).not.toContain( "It's live" );
		cleanup();
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PublishedPill.test.tsx`
Expected: FAIL — cannot resolve `./PublishedPill` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/components/PublishedPill.tsx`:

```tsx
interface Props {
	/** Public reading-page URL of the just-published / updated article. */
	url: string;
	/** True when an existing article was updated (vs. a brand-new publish). */
	isEditing: boolean;
}

/**
 * Glanceable confirmation that a publish/update finished, with a link to the
 * live article. Rendered by Studio ABOVE the editor's keyed remount boundary so
 * it survives the post-publish reset (a pill inside PublishPanel would be wiped).
 */
export default function PublishedPill( { url, isEditing }: Props ) {
	return (
		<p className="studio__published" role="status">
			<span className="studio__published-label">
				🌅 { isEditing ? 'Updated' : "It's live" }
			</span>
			<a
				className="studio__published-link"
				href={ url }
				target="_blank"
				rel="noopener noreferrer"
			>
				Read it →
			</a>
		</p>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PublishedPill.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/PublishedPill.tsx src/components/PublishedPill.test.tsx
git commit --no-gpg-sign -m "Add PublishedPill component for post-publish confirmation"
```

---

### Task 2: PublishPanel carries the result up; drop the in-panel done state

**Files:**
- Modify: `src/components/PublishPanel.tsx`
- Test: `src/components/PublishPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/PublishPanel.test.tsx`, add an `onComplete` capture to the existing `clickUpdate` helper and add a new-publish helper + assertions. Replace the `clickUpdate` function and the `describe` block with:

```tsx
async function clickUpdate(
	description: string,
	coverImage?: unknown,
	onComplete?: ( r: { articleUrl: string; isEditing: boolean } ) => void
) {
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
				coverImage: coverImage as never,
				onComplete,
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

const PUB = {
	uri: 'at://did:plc:me/site.standard.publication/pub1',
	cid: 'bafypub',
	rkey: 'pub1',
	slug: 'my-blog',
	name: 'My Blog',
};

async function clickPublish(
	onComplete: ( r: { articleUrl: string; isEditing: boolean } ) => void
) {
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
				publications: [ PUB ] as never,
				title: 'A title',
				description: 'A lede',
				onComplete,
			} )
		);
	} );
	const find = ( label: string ) =>
		Array.from( container.querySelectorAll( 'button' ) ).find(
			( b ) => b.textContent === label
		)!;
	await act( async () => {
		find( 'Publish…' ).dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) );
	} );
	await act( async () => {
		find( 'Publish & post to Bluesky' ).dispatchEvent(
			new MouseEvent( 'click', { bubbles: true } )
		);
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

	it( 'forwards the coverImage to updateDocument', async () => {
		const cover = {
			$type: 'blob',
			ref: { $link: 'bafycover' },
			mimeType: 'image/png',
			size: 9000,
		};
		await clickUpdate( 'A lede', cover );
		expect( updateDocument.mock.calls[ 0 ][ 2 ] ).toMatchObject( {
			coverImage: cover,
		} );
	} );

	it( 'reports the article URL and isEditing=true on update', async () => {
		const onComplete = vi.fn();
		await clickUpdate( 'A lede', undefined, onComplete );
		expect( onComplete ).toHaveBeenCalledWith( {
			articleUrl: 'https://x',
			isEditing: true,
		} );
	} );

	it( 'reports the article URL and isEditing=false on a new publish', async () => {
		const onComplete = vi.fn();
		await clickPublish( onComplete );
		expect( onComplete ).toHaveBeenCalledWith( {
			articleUrl: 'https://x',
			isEditing: false,
		} );
	} );
} );
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/components/PublishPanel.test.tsx`
Expected: the two new tests FAIL — `onComplete` is currently called with no arguments (`toHaveBeenCalledWith({...})` mismatch). The two original tests still PASS.

- [ ] **Step 3: Update PublishPanel — payload + remove done state**

In `src/components/PublishPanel.tsx`:

(a) Change the `onComplete` prop type. Replace:

```tsx
	/** Called after a successful publish/update so the parent can refresh. */
	onComplete?: () => void;
```

with:

```tsx
	/**
	 * Called after a successful publish/update with the live article URL so the
	 * parent (Studio) can show the success pill. `isEditing` distinguishes an
	 * update from a brand-new publish.
	 */
	onComplete?: ( result: { articleUrl: string; isEditing: boolean } ) => void;
```

(b) Remove the `resultUrl` state line:

```tsx
	const [ resultUrl, setResultUrl ] = useState< string | null >( null );
```

(c) Rewrite `run()` so each branch produces an `articleUrl`, then report it. Replace the whole `try { … }` body inside `run()` with:

```tsx
		try {
			const prepared = attachBlobRefs( normalizeBlocks( blocks ), ( url ) =>
				blobRegistry.get( url )
			);
			let articleUrl: string;
			if ( editing ) {
				const res = await updateDocument( agent, identity, {
					rkey: editing.rkey,
					siteUri: editing.siteUri,
					publicationSlug: editing.siteSlug,
					publishedAt: editing.publishedAt,
					bskyPostRef: editing.bskyPostRef,
					title: title.trim(),
					description,
					blocks: prepared,
					coverImage,
				} );
				articleUrl = res.articleUrl;
			} else {
				// Non-editing: the target is always a full Publication picked from `pubs`.
				const pub = pubs.find( ( candidate ) => candidate.uri === targetUri );
				if ( ! pub ) {
					return;
				}
				const res = await publish( agent, identity, {
					title: title.trim(),
					description,
					blocks: prepared,
					publicationUri: pub.uri,
					publicationCid: pub.cid,
					publicationSlug: pub.slug,
					coverImage,
				} );
				articleUrl = res.articleUrl;
			}
			setPhase( 'done' );
			onComplete?.( { articleUrl, isEditing } );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
			setPhase( 'error' );
		}
```

(d) Remove the entire `done`-phase result block from the JSX:

```tsx
			{ phase === 'done' && resultUrl && (
				<div className="publish__result">
					<p>
						{ isEditing
							? 'Updated ✓ (same URL; the original Bluesky post stays — its preview may not refresh)'
							: 'Published ✓ (the reading page goes live once SkyPress is deployed)' }
					</p>
					<p>
						Article URL: <code>{ resultUrl }</code>
					</p>
				</div>
			) }
```

Leave the `confirm`, `working`, and `error` blocks and the button (its render condition still includes `phase === 'done'`, which correctly re-enables the Update button after an edit).

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/components/PublishPanel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/PublishPanel.tsx src/components/PublishPanel.test.tsx
git commit --no-gpg-sign -m "PublishPanel: report article URL on success, drop in-panel done state"
```

---

### Task 3: Wire the pill into Studio

**Files:**
- Modify: `src/components/Studio.tsx`

No unit test — `Studio` is auth-gated (`useAuth`, OAuth) with no test harness. The behavioral contract is covered by Tasks 1–2; this task is verified via type-check and the manual smoke test in Task 5.

- [ ] **Step 1: Import the pill**

After the existing `import PublishPanel from './PublishPanel';` line (`Studio.tsx:7`), add:

```tsx
import PublishedPill from './PublishedPill';
```

- [ ] **Step 2: Add the published state**

Immediately after the `refreshKey` state line (`const [ refreshKey, setRefreshKey ] = useState( 0 );`, `Studio.tsx:33`), add:

```tsx
	// The just-published/updated article — drives the success pill. Lives here
	// (above the keyed editor div) so it survives the post-publish remount.
	const [ published, setPublished ] = useState< {
		url: string;
		isEditing: boolean;
	} | null >( null );
```

- [ ] **Step 3: Set it from onComplete and clear it in startNew**

Replace the `startNew` function body's first lines to also clear the pill. Change:

```tsx
		const startNew = () => {
			revokeBlobRegistry( registry );
			setEditing( null );
```

to:

```tsx
		const startNew = () => {
			revokeBlobRegistry( registry );
			setPublished( null );
			setEditing( null );
```

Then update the `onComplete` handler. Replace:

```tsx
						onComplete={ () => {
							setRefreshKey( ( k ) => k + 1 );
```

with:

```tsx
						onComplete={ ( result ) => {
							setPublished( {
								url: result.articleUrl,
								isEditing: result.isEditing,
							} );
							setRefreshKey( ( k ) => k + 1 );
```

(The rest of the handler — the `if ( ! editing ) { setTitle( '' ); … }` reset — stays unchanged.)

- [ ] **Step 4: Render the pill below the mode bar**

Find the `studio__mode` block (`Studio.tsx:166`) and, immediately after its closing `</div>`, add the pill so it renders on its own row, outside `<div key={editorKey}>`:

```tsx
				</div>

				{ published && (
					<PublishedPill url={ published.url } isEditing={ published.isEditing } />
				) }
```

(The existing `{ editLoadError && ( … ) }` block follows this.)

- [ ] **Step 5: Clear the pill when the writer starts typing again**

Update the title input's `onChange` (`Studio.tsx:222`). Replace:

```tsx
							onChange={ ( event ) => setTitle( event.target.value ) }
```

with:

```tsx
							onChange={ ( event ) => {
								setPublished( null );
								setTitle( event.target.value );
							} }
```

Update the lede textarea's `onChange` (`Studio.tsx:232`). Replace:

```tsx
							onChange={ ( event ) => setExcerpt( event.target.value ) }
```

with:

```tsx
							onChange={ ( event ) => {
								setPublished( null );
								setExcerpt( event.target.value );
							} }
```

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: no new TypeScript errors in `Studio.tsx` / `PublishPanel.tsx` / `PublishedPill.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/Studio.tsx
git commit --no-gpg-sign -m "Studio: show the publish success pill above the editor remount"
```

---

### Task 4: Sunrise pill styling

**Files:**
- Modify: `src/styles/editor-chrome.css`

- [ ] **Step 1: Add the pill styles**

Append to `src/styles/editor-chrome.css` (after the existing `.publish__error` rules around line 123):

```css
/* Publish success pill — sunrise callback, rises into view (Studio-owned) */
.studio__published {
	width: fit-content;
	max-width: var(--studio-measure);
	margin: 0.35rem auto 0;
	display: flex;
	align-items: center;
	gap: 0.6rem;
	padding: 0.5rem 1rem;
	border-radius: 999px;
	background: linear-gradient(100deg, var(--sun-tint), var(--sun));
	color: var(--ink);
	font-size: 0.9rem;
	font-weight: 600;
	box-shadow: 0 1px 8px rgba(232, 146, 12, 0.3);
	animation: studio-published-rise 400ms ease-out;
}

.studio__published-link {
	color: var(--ink);
	font-weight: 700;
	text-decoration: underline;
	white-space: nowrap;
}

@keyframes studio-published-rise {
	from {
		opacity: 0;
		transform: translateY(0.5rem);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.studio__published {
		animation: none;
	}
}
```

- [ ] **Step 2: Verify the full test suite + check still pass**

Run: `npm run test`
Expected: PASS (whole suite green, including the new `PublishedPill` + `PublishPanel` tests).

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/editor-chrome.css
git commit --no-gpg-sign -m "Style the publish success pill with a sunrise gradient"
```

---

### Task 5: Manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Run the dev server and publish**

Run: `npm run dev` and open the editor on `http://127.0.0.1:<port>/editor` (loopback, not `localhost` — atproto OAuth requirement). Sign in, write a short article, and publish.

Expected:
- After publishing, a rounded sunrise-gradient pill reading **🌅 It's live · Read it →** appears below the mode bar and **stays visible** while the editor resets to a blank canvas.
- Clicking **Read it →** opens the live article in a new tab.
- Typing a new title clears the pill.
- Editing an existing article and saving shows **🌅 Updated · Read it →**.

- [ ] **Step 2: Confirm reduced-motion**

With OS "reduce motion" enabled, the pill appears without the rise animation.

---

## Self-Review notes

- **Spec coverage:** lift-to-Studio (Tasks 2–3), `onComplete` payload (Task 2), remove in-panel done (Task 2), pill placement in `studio__mode` row (Task 3), `PublishedPill` component (Task 1), short sunrise copy (Task 1), sunrise styling + rise + reduced-motion (Task 4), persistence/clear-on-typing/startNew (Task 3), testing of pill + onComplete contract (Tasks 1–2). All covered.
- **Type consistency:** `onComplete?( result: { articleUrl: string; isEditing: boolean } )` is used identically in `PublishPanel.tsx`, `PublishPanel.test.tsx`, and `Studio.tsx`. `published` state shape `{ url, isEditing }` maps `articleUrl → url` at the call site in Task 3 Step 3.
- **No placeholders:** every code step shows complete code; every run step states the expected result.
