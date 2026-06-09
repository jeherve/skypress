# Editor & Dashboard Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/editor` into a focused writing surface and add a shared, auth-aware top bar across `/editor` and `/dashboard`, with article editing driven from the dashboard.

**Architecture:** A new `AppBar` React component (consumes the existing client-only `useAuth`) renders at the top of both islands. The editor's published-article list is removed; editing opens via `/editor?edit=<rkey>`, loaded by reusing `listAllMyArticles`. The title becomes a borderless heading above a taller editor canvas. Page→nav mapping and edit-link parsing live in tested pure helpers; the React islands stay thin.

**Tech Stack:** Astro 5, React 18, TypeScript, `@atproto/api`, vitest (jsdom), `@automattic/isolated-block-editor`.

**Spec:** `docs/superpowers/specs/2026-06-09-editor-page-rework-design.md`

---

## File Structure

**New files:**
- `src/lib/auth/nav.ts` — `appBarNav(current)` pure helper returning the bar's contextual action.
- `src/lib/auth/nav.test.ts` — its unit tests.
- `src/lib/editor/edit-link.ts` — `editLinkFor(rkey)` + `editRkeyFromSearch(search)` pure helpers (single source of the `?edit=` param name).
- `src/lib/editor/edit-link.test.ts` — its unit tests.
- `src/components/AppBar.tsx` — the shared top bar (logo + contextual nav + account block + sign-out).
- `src/styles/app-bar.css` — global styles for the bar, imported by both page shells.

**Modified files:**
- `src/lib/publish/publisher.ts` — add `getMyArticle`.
- `src/lib/publish/publisher.test.ts` — add `getMyArticle` tests.
- `src/components/Studio.tsx` — mount `AppBar`, remove account bar + `MyArticles`, `?edit=` load, lift title state, taller-canvas layout.
- `src/components/PublishPanel.tsx` — accept `title`/`onTitleChange` props; drop internal title input + state.
- `src/components/Dashboard.tsx` — mount `AppBar`; add **Edit** action to the Posts tab.
- `src/pages/editor.astro` — drop the static header; import `app-bar.css`.
- `src/pages/dashboard.astro` — drop the static header right-side; import `app-bar.css`.
- `src/styles/editor-chrome.css` — remove `.studio__account*` + `.myarticles*`; add `.studio__title`; raise editor min-height.

**Deleted files:**
- `src/components/MyArticles.tsx`
- `src/components/MyArticles.test.tsx`

---

## Task 1: `appBarNav` pure helper

**Files:**
- Create: `src/lib/auth/nav.ts`
- Test: `src/lib/auth/nav.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/nav.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appBarNav } from './nav';

describe( 'appBarNav', () => {
	it( 'links the editor bar back to the dashboard (Publications)', () => {
		expect( appBarNav( 'editor' ) ).toEqual( {
			href: '/dashboard',
			label: 'Publications',
			icon: 'publications',
		} );
	} );

	it( 'links the dashboard bar into the editor (Write, feather)', () => {
		expect( appBarNav( 'dashboard' ) ).toEqual( {
			href: '/editor',
			label: 'Write',
			icon: 'feather',
		} );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/auth/nav.test.ts`
Expected: FAIL — cannot resolve `./nav` / `appBarNav` is not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/auth/nav.ts`:

```ts
/** The page an AppBar renders on; selects its contextual nav action. */
export type AppBarContext = 'editor' | 'dashboard';

export interface AppBarNav {
	href: string;
	label: string;
	icon: 'feather' | 'publications';
}

/**
 * The AppBar's single contextual nav action, by the page it renders on:
 *   editor    → back to your publications (the dashboard)
 *   dashboard → into the editor (a feather "Write")
 */
export function appBarNav( current: AppBarContext ): AppBarNav {
	if ( current === 'dashboard' ) {
		return { href: '/editor', label: 'Write', icon: 'feather' };
	}
	return { href: '/dashboard', label: 'Publications', icon: 'publications' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/auth/nav.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/nav.ts src/lib/auth/nav.test.ts
git commit --no-gpg-sign -m "Add appBarNav helper for the shared top bar"
```

---

## Task 2: `edit-link` pure helpers

**Files:**
- Create: `src/lib/editor/edit-link.ts`
- Test: `src/lib/editor/edit-link.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/editor/edit-link.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { editLinkFor, editRkeyFromSearch } from './edit-link';

describe( 'editLinkFor', () => {
	it( 'builds the editor edit URL for an rkey', () => {
		expect( editLinkFor( '3kabc123' ) ).toBe( '/editor?edit=3kabc123' );
	} );
} );

describe( 'editRkeyFromSearch', () => {
	it( 'reads the rkey from the edit param', () => {
		expect( editRkeyFromSearch( '?edit=3kabc123' ) ).toBe( '3kabc123' );
	} );

	it( 'returns null when the param is absent', () => {
		expect( editRkeyFromSearch( '?foo=bar' ) ).toBeNull();
		expect( editRkeyFromSearch( '' ) ).toBeNull();
	} );

	it( 'returns null when the param is present but empty', () => {
		expect( editRkeyFromSearch( '?edit=' ) ).toBeNull();
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/editor/edit-link.test.ts`
Expected: FAIL — cannot resolve `./edit-link`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/editor/edit-link.ts`:

```ts
/**
 * The dashboard→editor "edit this article" link, and the editor-side parser for
 * it. Kept together so the `?edit=` param name has a single source of truth.
 * `rkey` uniquely identifies a document within the writer's repo, so it is all
 * the editor needs to re-fetch the article on load.
 */
const EDIT_PARAM = 'edit';

/** The editor URL that opens an existing article for editing. */
export function editLinkFor( rkey: string ): string {
	return `/editor?${ EDIT_PARAM }=${ rkey }`;
}

/** The rkey to edit, parsed from a URL search string (e.g. `window.location.search`). Null when absent or empty. */
export function editRkeyFromSearch( search: string ): string | null {
	const rkey = new URLSearchParams( search ).get( EDIT_PARAM );
	return rkey && rkey.length > 0 ? rkey : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/editor/edit-link.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/edit-link.ts src/lib/editor/edit-link.test.ts
git commit --no-gpg-sign -m "Add edit-link helpers for dashboard→editor editing"
```

---

## Task 3: `getMyArticle` data helper

**Files:**
- Modify: `src/lib/publish/publisher.ts` (append after `listAllMyArticles`, ~line 300)
- Test: `src/lib/publish/publisher.test.ts` (append a new `describe`)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/publish/publisher.test.ts` (and add `getMyArticle` to the import on line 3, so it reads `import { publish, updateDocument, listAllMyArticles, listPublicationArticles, getMyArticle } from './publisher';`):

```ts
describe( 'getMyArticle', () => {
	function repo() {
		return mockAgent( {
			'site.standard.publication': [
				{
					uri: `at://${ DID }/site.standard.publication/pub1`,
					value: {
						$type: 'site.standard.publication',
						url: `${ SITE_BASE }/@${ HANDLE }/blog-a`,
						name: 'Blog A',
					},
				},
			],
			'site.standard.document': [
				{
					uri: `at://${ DID }/site.standard.document/d1`,
					value: { title: 'In A', site: `at://${ DID }/site.standard.publication/pub1` },
				},
				{
					uri: `at://${ DID }/site.standard.document/d2`,
					value: { title: 'Orphan', site: `at://${ DID }/site.standard.publication/gone` },
				},
			],
		} );
	}

	it( 'returns the writer’s article by rkey, slug-annotated', async () => {
		const { agent } = repo();
		const article = await getMyArticle( agent, DID, 'd1' );
		expect( article ).toMatchObject( { rkey: 'd1', title: 'In A', siteSlug: 'blog-a' } );
	} );

	it( 'returns null for an unknown rkey', async () => {
		const { agent } = repo();
		expect( await getMyArticle( agent, DID, 'nope' ) ).toBeNull();
	} );

	it( 'returns null for a foreign/orphan document', async () => {
		const { agent } = repo();
		expect( await getMyArticle( agent, DID, 'd2' ) ).toBeNull();
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/publish/publisher.test.ts`
Expected: FAIL — `getMyArticle` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/publish/publisher.ts` (after `listAllMyArticles`, end of file):

```ts
/**
 * Fetch a single SkyPress article by rkey (the editor's `?edit=` load). Reuses
 * `listAllMyArticles` so it inherits the same slug annotation and foreign/orphan
 * filtering; returns null when no owned document has that rkey.
 */
export async function getMyArticle(
	agent: Agent,
	did: string,
	rkey: string
): Promise< MyArticle | null > {
	const all = await listAllMyArticles( agent, did );
	return all.find( ( article ) => article.rkey === rkey ) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/publish/publisher.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/publisher.ts src/lib/publish/publisher.test.ts
git commit --no-gpg-sign -m "Add getMyArticle for the editor edit-by-rkey load"
```

---

## Task 4: `AppBar` component + styles

**Files:**
- Create: `src/components/AppBar.tsx`
- Create: `src/styles/app-bar.css`

> No unit test: `AppBar` is thin chrome over `useAuth`; its only branching logic (`appBarNav`) is already tested in Task 1. Verified manually in Task 5/7. It imports only the `@wordpress`-free auth helpers.

- [ ] **Step 1: Create the component**

Create `src/components/AppBar.tsx`:

```tsx
import { useState } from 'react';
import { useAuth } from '../lib/auth/useAuth';
import { displayNameFor, authorPath } from '../lib/auth/profile';
import { appBarNav, type AppBarContext } from '../lib/auth/nav';

/** Inline SkyPress mark — mirrors Logo.astro (that one is Astro-only, unusable in a React island). */
function LogoMark() {
	return (
		<svg
			className="app-bar__mark"
			width={ 24 }
			height={ 24 }
			viewBox="0 0 32 32"
			fill="none"
			aria-hidden="true"
		>
			<rect x="2.5" y="2.5" width="27" height="27" rx="7.5" stroke="currentColor" strokeWidth="2.2" />
			<circle cx="16" cy="12.5" r="3.6" stroke="currentColor" strokeWidth="1.9" />
			<circle cx="16" cy="12.5" r="0.9" fill="currentColor" />
			<path d="M7 18.5h18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
			<path d="M9 22.8h14M9 25.6h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.55" />
		</svg>
	);
}

function NavIcon( { name }: { name: 'feather' | 'publications' } ) {
	if ( name === 'feather' ) {
		return (
			<svg className="app-bar__navicon" viewBox="0 0 24 24" width={ 18 } height={ 18 } fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
				<line x1="16" y1="8" x2="2" y2="22" />
				<line x1="17.5" y1="15" x2="9" y2="15" />
			</svg>
		);
	}
	return (
		<svg className="app-bar__navicon" viewBox="0 0 24 24" width={ 18 } height={ 18 } fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
			<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
		</svg>
	);
}

/**
 * The shared top bar for the editor + dashboard islands. Logo on the left;
 * contextual nav + account + sign-out on the right. Rendered inside AuthProvider
 * in every auth state: logo-only while loading, + nav when signed out, + account
 * and sign-out when signed in.
 */
export default function AppBar( { current }: { current: AppBarContext } ) {
	const { status, handle, displayName, avatar, did, signOut } = useAuth();
	const [ avatarOk, setAvatarOk ] = useState( true );
	const nav = appBarNav( current );
	const signedIn = status === 'signed-in' && Boolean( did );

	const viewerName = did
		? displayNameFor( { did, handle, displayName, avatar } )
		: '';
	const profileHref = authorPath( handle );

	return (
		<header className="app-bar">
			<a className="app-bar__home" href="/" aria-label="SkyPress home">
				<LogoMark />
				<span className="app-bar__word">SkyPress</span>
			</a>

			<span className="app-bar__spacer" />

			{ status !== 'loading' && (
				<a className="app-bar__nav" href={ nav.href }>
					<NavIcon name={ nav.icon } />
					{ nav.label }
				</a>
			) }

			{ signedIn && (
				<>
					<IdentityBlock
						href={ profileHref }
						name={ viewerName }
						handle={ handle }
						avatar={ avatar }
						avatarOk={ avatarOk }
						onAvatarError={ () => setAvatarOk( false ) }
					/>
					<button type="button" className="app-bar__signout" onClick={ () => void signOut() }>
						Sign out
					</button>
				</>
			) }
		</header>
	);
}

/** Avatar + name + @handle. The whole block links to the public author page when a handle is known. */
function IdentityBlock( {
	href,
	name,
	handle,
	avatar,
	avatarOk,
	onAvatarError,
}: {
	href: string | null;
	name: string;
	handle: string | null;
	avatar: string | null;
	avatarOk: boolean;
	onAvatarError: () => void;
} ) {
	const inner = (
		<>
			{ avatar && avatarOk ? (
				<img
					className="app-bar__avatar"
					src={ avatar }
					alt=""
					width={ 30 }
					height={ 30 }
					onError={ onAvatarError }
				/>
			) : (
				<span className="app-bar__avatar app-bar__avatar--fallback" aria-hidden="true">
					{ name.charAt( 0 ).toUpperCase() }
				</span>
			) }
			<span className="app-bar__who">
				<strong className="app-bar__name">{ name }</strong>
				{ handle && <span className="app-bar__handle">@{ handle }</span> }
			</span>
		</>
	);

	return href ? (
		<a className="app-bar__identity" href={ href }>
			{ inner }
		</a>
	) : (
		<span className="app-bar__identity">{ inner }</span>
	);
}
```

- [ ] **Step 2: Create the styles**

Create `src/styles/app-bar.css`:

```css
/**
 * Shared top bar for the editor + dashboard islands. Imported globally by both
 * page shells; the islands are client:only so Astro scoped styles can't reach
 * the bar's DOM.
 */
.app-bar {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	max-width: var(--studio-measure, 60rem);
	margin: 0 auto;
	padding: 0.75rem 1.25rem;
	border-bottom: 1px solid var(--line);
	flex-wrap: wrap;
}
.app-bar__home {
	display: inline-flex;
	align-items: center;
	gap: 0.55rem;
	color: var(--ink);
	text-decoration: none;
}
.app-bar__mark {
	color: var(--sun);
	flex: none;
}
.app-bar__word {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 1.18rem;
	letter-spacing: -0.015em;
}
.app-bar__spacer {
	flex: 1;
}
.app-bar__nav {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	color: var(--sun);
	background: var(--sun-tint);
	text-decoration: none;
	font-size: 0.85rem;
	font-weight: 600;
	padding: 0.35rem 0.6rem;
	border-radius: var(--radius-sm);
}
.app-bar__nav:hover {
	text-decoration: underline;
}
.app-bar__navicon {
	flex: none;
}
.app-bar__identity {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
	text-decoration: none;
	color: inherit;
	padding: 0.2rem 0.35rem;
	border-radius: var(--radius-sm);
}
a.app-bar__identity:hover {
	background: var(--panel);
}
.app-bar__avatar {
	width: 30px;
	height: 30px;
	border-radius: 50%;
	object-fit: cover;
	flex: none;
}
.app-bar__avatar--fallback {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: var(--sun-tint);
	color: var(--sun);
	font-weight: 700;
	font-size: 0.85rem;
}
.app-bar__who {
	display: flex;
	flex-direction: column;
	line-height: 1.15;
	min-width: 0;
}
.app-bar__name {
	font-weight: 650;
	font-size: 0.9rem;
}
.app-bar__handle {
	color: var(--muted);
	font-size: 0.75rem;
}
.app-bar__signout {
	border: 1px solid var(--line-strong);
	background: var(--paper-raised);
	border-radius: var(--radius-sm);
	padding: 0.3rem 0.7rem;
	cursor: pointer;
	font: inherit;
	font-size: 0.85rem;
}
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: PASS (no type/lint errors from the new files).

- [ ] **Step 4: Commit**

```bash
git add src/components/AppBar.tsx src/styles/app-bar.css
git commit --no-gpg-sign -m "Add shared AppBar component and styles"
```

---

## Task 5: Mount AppBar in the editor; remove the account bar + article list; add the ?edit load

**Files:**
- Modify: `src/components/Studio.tsx`
- Modify: `src/pages/editor.astro`

This task keeps the title where it is (in `PublishPanel`) — the title relocation is Task 6 — so the app stays runnable.

- [ ] **Step 1: Update the editor page shell**

In `src/pages/editor.astro`, replace the frontmatter import block and the `<header>`/`<style>` so the bar comes from `app-bar.css` and the React island. Replace lines 1–23 (the frontmatter through the closing of `<main>`'s `<Studio>` block is unchanged) — specifically:

Replace the import of `Logo` and add the stylesheet import. Change the frontmatter to:

```astro
---
import Base from '../layouts/Base.astro';
import Studio from '../components/Studio.tsx';
// The Studio is a `client:only` React island, so Astro's scoped styles never
// reach its DOM — its chrome is styled globally from these shared stylesheets.
import '../styles/app-bar.css';
import '../styles/editor-chrome.css';
import '../styles/login.css';
---
```

Then replace the `<main>` body so the static header is gone (the AppBar now renders inside the island):

```astro
<Base title="Write — SkyPress">
	<main class="editor-shell">
		<!-- client:only — auth + editor run only in the browser; their bundle never
		     reaches reading pages (Decisions 0001 & 0004). -->
		<Studio client:only="react">
			<p slot="fallback" class="editor-shell__loading">Loading…</p>
		</Studio>
	</main>
</Base>
```

Finally delete the entire `<style>…</style>` block at the bottom EXCEPT keep the loading rule. Replace the whole `<style>` block with:

```astro
<style>
	.editor-shell__loading {
		padding: 2rem 1.25rem;
		color: var(--muted);
	}
</style>
```

- [ ] **Step 2: Mount AppBar and remove the account bar in Studio**

In `src/components/Studio.tsx`:

Add imports near the top (after the existing component imports):

```tsx
import AppBar from './AppBar';
import { getMyArticle } from '../lib/publish/publisher';
import { editRkeyFromSearch } from '../lib/editor/edit-link';
```

Remove the now-unused `MyArticles` import (line 8) and the `displayNameFor, authorPath` import (line 10) only if no longer referenced after this task — `displayNameFor`/`authorPath` move into `AppBar`, so delete line 10's import. Keep `useRef` etc.

Wrap the loading + signed-in + signed-out returns so `AppBar` always renders. Change the `status === 'loading'` early return to include the bar:

```tsx
	if ( status === 'loading' ) {
		return (
			<>
				<AppBar current="editor" />
				<p className="studio__loading">Connecting to your identity…</p>
			</>
		);
	}
```

In the signed-in branch, delete the entire `<div className="studio__account">…</div>` block (lines ~78–116) AND the `<MyArticles … />` block (lines ~118–124), and wrap the returned fragment so it leads with `<AppBar current="editor" />`. The signed-in `return` becomes exactly:

```tsx
		return (
			<>
				<AppBar current="editor" />

				<div className="studio__mode">
					<span>{ editing ? `Editing: ${ editing.title }` : 'New article' }</span>
					{ editing && (
						<button type="button" onClick={ startNew }>
							+ New article
						</button>
					) }
				</div>

				<div key={ editorKey }>
					<PublishPanel
						agent={ agent }
						identity={ { did, handle } }
						blocks={ blocks }
						blobRegistry={ registry }
						publications={ publications }
						editing={
							editing
								? {
										rkey: editing.rkey,
										siteUri: editing.siteUri,
										siteSlug: editing.siteSlug,
										publishedAt: editing.publishedAt ?? new Date().toISOString(),
										bskyPostRef: editing.bskyPostRef,
								  }
								: undefined
						}
						initialTitle={ editing?.title }
						onComplete={ () => setRefreshKey( ( k ) => k + 1 ) }
					/>
					<SkyEditor
						onChange={ setBlocks }
						mediaUpload={ mediaUpload }
						initialBlocks={ editing?.blocks }
					/>
				</div>
			</>
		);
```

Also remove the now-unused `avatarOk`/`setAvatarOk` state, the `viewerName`/`publicPath` consts, and the signed-out branch's structure stays but gains the bar (next step). Remove `displayNameFor`/`authorPath` usage from this file.

- [ ] **Step 3: Add the bar to the signed-out branch**

Replace the final signed-out `return` block with:

```tsx
	// signed-out or error
	return (
		<>
			<AppBar current="editor" />
			<div className="studio__login">
				<LoginForm />
				{ status === 'error' && error && (
					<p className="studio__error" role="alert">
						Couldn't start the auth client: { error }
					</p>
				) }
			</div>
		</>
	);
```

- [ ] **Step 4: Add the `?edit=<rkey>` load effect**

In `StudioGate`, add a one-shot loader effect after the existing `publications` effect. It reads the URL once when the agent is ready, fetches the article, and seeds the editor via the same path `startEdit` uses. Because `startEdit` is defined inside the signed-in branch, hoist the load into an effect that sets `editing`/`blocks` directly:

```tsx
	// One-shot: if the page was opened as /editor?edit=<rkey>, load that article.
	const editLoadedRef = useRef( false );
	useEffect( () => {
		if ( editLoadedRef.current || ! agent || ! did ) {
			return;
		}
		const rkey = editRkeyFromSearch( window.location.search );
		if ( ! rkey ) {
			editLoadedRef.current = true;
			return;
		}
		editLoadedRef.current = true;
		let cancelled = false;
		getMyArticle( agent, did, rkey )
			.then( ( article ) => {
				if ( ! cancelled && article ) {
					setEditing( article );
					setBlocks( article.blocks as unknown as BlockInstance[] );
				}
			} )
			.catch( () => {
				/* stale/bad edit link → start a new article */
			} );
		return () => {
			cancelled = true;
		};
	}, [ agent, did ] );
```

Add `useRef` to the React import if not already present (it is, line 1).

- [ ] **Step 5: Type-check and run the full test suite**

Run: `npm run check && npm test`
Expected: `check` PASS; tests PASS. (Note: `MyArticles.test.tsx` still exists and passes — it's deleted in Task 8.) If `check` flags `MyArticles` as unused import, confirm its import line was removed in Step 2.

- [ ] **Step 6: Manual verification**

Run: `npm run dev` and open `http://127.0.0.1:<port>/editor`.
Expected: the shared bar shows at the top (logo left; when signed in: "Publications" link, your avatar+name+@handle linking to your public page, Sign out). No "Your articles" list. The editor still works.
With `?edit=<an existing rkey>` appended: the editor loads that article (title + blocks). With a bogus rkey: a blank editor (no crash).

- [ ] **Step 7: Commit**

```bash
git add src/components/Studio.tsx src/pages/editor.astro
git commit --no-gpg-sign -m "Mount AppBar in editor, drop article list, load ?edit by rkey"
```

---

## Task 6: Relocate the title — borderless heading above the canvas

**Files:**
- Modify: `src/components/PublishPanel.tsx`
- Modify: `src/components/Studio.tsx`
- Modify: `src/styles/editor-chrome.css`

Title state moves up to `StudioGate`; `PublishPanel` becomes a controlled consumer. Both files change together so the app compiles.

- [ ] **Step 1: Make PublishPanel title-controlled**

In `src/components/PublishPanel.tsx`:

Replace the `initialTitle?: string;` prop (line 37) with controlled props:

```tsx
	/** Controlled title (lifted to the editor so it can render as a heading above the canvas). */
	title: string;
	onTitleChange: ( value: string ) => void;
```

Remove `initialTitle` from the destructured props (line 54) and add `title`, `onTitleChange`. Delete the internal title state line (`const [ title, setTitle ] = useState( initialTitle ?? '' );`, line 59).

Remove the title `<input>` (lines ~152–160) from the returned JSX — the editor renders it now. The `canSubmit` calc (line 74) keeps using `title` (now the prop). The publish/update calls keep using `title.trim()` (the prop).

- [ ] **Step 2: Render the title heading in Studio and pass props**

In `src/components/Studio.tsx`:

Add title state to `StudioGate` (near the other `useState`s):

```tsx
	const [ title, setTitle ] = useState( '' );
```

Sync it wherever editing changes. In `startEdit`, after `setEditing( article )` add `setTitle( article.title );`. In `startNew`, after `setEditing( null )` add `setTitle( '' );`. In the `?edit` load effect (Task 5 Step 4), inside the `if ( ! cancelled && article )` block add `setTitle( article.title );`.

In the signed-in JSX, pass the controlled props to `PublishPanel` (replace `initialTitle={ editing?.title }` with the two props) and render the heading between `PublishPanel` and `SkyEditor`, inside the `key={ editorKey }` div:

```tsx
				<div key={ editorKey }>
					<PublishPanel
						agent={ agent }
						identity={ { did, handle } }
						blocks={ blocks }
						blobRegistry={ registry }
						publications={ publications }
						editing={
							editing
								? {
										rkey: editing.rkey,
										siteUri: editing.siteUri,
										siteSlug: editing.siteSlug,
										publishedAt: editing.publishedAt ?? new Date().toISOString(),
										bskyPostRef: editing.bskyPostRef,
								  }
								: undefined
						}
						title={ title }
						onTitleChange={ setTitle }
						onComplete={ () => setRefreshKey( ( k ) => k + 1 ) }
					/>
					<input
						className="studio__title"
						type="text"
						placeholder="Add title"
						aria-label="Article title"
						value={ title }
						onChange={ ( event ) => setTitle( event.target.value ) }
					/>
					<SkyEditor
						onChange={ setBlocks }
						mediaUpload={ mediaUpload }
						initialBlocks={ editing?.blocks }
					/>
				</div>
```

- [ ] **Step 3: Style the borderless title**

In `src/styles/editor-chrome.css`, add (near the editor-surface rules):

```css
/* Borderless article title, sitting above the framed editor canvas — echoes the
   block-editor post title (large display heading, no box). */
.studio__title {
	display: block;
	max-width: var(--studio-measure);
	margin: 1.25rem auto 0;
	padding: 0 var(--studio-gutter);
	width: 100%;
	box-sizing: border-box;
	border: 0;
	background: transparent;
	color: var(--ink);
	font-family: var(--font-display);
	font-size: clamp(1.9rem, 4vw, 2.6rem);
	font-weight: 700;
	line-height: 1.15;
}
.studio__title::placeholder {
	color: var(--muted);
	opacity: 0.6;
}
.studio__title:focus {
	outline: none;
}
/* Tighten the gap between the title and the editor surface below it. */
.studio__title + .skypress-editor {
	margin-top: 0.75rem;
}
```

- [ ] **Step 4: Type-check and test**

Run: `npm run check && npm test`
Expected: PASS. (`PublishPanel` no longer has internal title state; `Studio` owns it.)

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `/editor` signed in.
Expected: a large borderless "Add title" heading sits above the editor; typing updates it; the Publish button enables once title + content exist; editing an article pre-fills the title; "+ New article" clears it.

- [ ] **Step 6: Commit**

```bash
git add src/components/PublishPanel.tsx src/components/Studio.tsx src/styles/editor-chrome.css
git commit --no-gpg-sign -m "Lift the article title into a borderless heading above the canvas"
```

---

## Task 7: Mount AppBar in the dashboard; add the Edit action

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/pages/dashboard.astro`

- [ ] **Step 1: Update the dashboard page shell**

In `src/pages/dashboard.astro`, change the frontmatter to drop the `Logo` import and add the bar stylesheet:

```astro
---
import Base from '../layouts/Base.astro';
import Dashboard from '../components/Dashboard.tsx';
// Shared top-bar styles (the Dashboard island is client:only, so Astro scoped
// styles can't reach its DOM). The sign-in form styles are shared with the editor.
import '../styles/app-bar.css';
import '../styles/login.css';
---
```

Replace the `<main>` body to drop the static header (the AppBar renders inside the island):

```astro
<Base title="Dashboard — SkyPress">
	<main class="dash-shell">
		<!-- client:only — auth runs only in the browser; its bundle never reaches
		     reading pages (Decisions 0003 & 0004). No `@wordpress/*` here. -->
		<Dashboard client:only="react">
			<p slot="fallback" class="dash__loading">Loading…</p>
		</Dashboard>
	</main>
</Base>
```

Delete the first `<style>` block (the `.dash-shell__*` rules, lines ~24–43). Keep the `<style is:global>` block untouched EXCEPT remove the now-unused `.dash__studio` and `.dash__signout` rules (the bar's Studio link + sign-out moved to `AppBar`); also remove the `.dash__bar` and `.dash__bar-actions` rules. Keep `.dash__crumb` (still used by the breadcrumb).

- [ ] **Step 2: Mount AppBar and trim the dashboard bar**

In `src/components/Dashboard.tsx`:

Add the imports:

```tsx
import AppBar from './AppBar';
import { editLinkFor } from '../lib/editor/edit-link';
```

Remove `signOut` from the `useAuth()` destructure (line 27) — the bar owns sign-out now.

Add `<AppBar current="dashboard" />` to each returned tree. For `status === 'loading'`:

```tsx
	if ( status === 'loading' ) {
		return (
			<>
				<AppBar current="dashboard" />
				<p className="dash__loading">Connecting to your identity…</p>
			</>
		);
	}
```

For the signed-out branch, wrap with the bar:

```tsx
	if ( status !== 'signed-in' || ! agent || ! did ) {
		return (
			<>
				<AppBar current="dashboard" />
				<div className="dash__login">
					<LoginForm />
					{ status === 'error' && error && (
						<p className="dash__error" role="alert">
							Couldn't start the auth client: { error }
						</p>
					) }
				</div>
			</>
		);
	}
```

In the main signed-in `return`, render the bar above `.dash`, and replace the old `<header className="dash__bar">…</header>` with just the breadcrumb (the Studio link + sign-out are gone). The top becomes:

```tsx
	return (
		<>
			<AppBar current="dashboard" />
			<div className="dash">
				<header className="dash__bar">
					<button
						type="button"
						className="dash__crumb"
						onClick={ () => setView( { kind: 'list' } ) }
						disabled={ view.kind === 'list' }
					>
						Your publications
					</button>
				</header>
```

…and add the matching closing `</>` before the final `);` of the component (after the existing closing `</div>` of `.dash`).

- [ ] **Step 3: Add the Edit action to the Posts tab**

In `PublicationManager`'s Posts list (the `articles.map` in the `tab === 'posts'` block, ~line 393), add an Edit link before the Unpublish button:

```tsx
								<li className="dash__post" key={ article.rkey }>
									<a
										className="dash__postlink"
										href={ `/@${ handle }/${ pub.slug }/${ article.rkey }` }
									>
										{ article.title }
									</a>
									{ article.publishedAt && (
										<span className="dash__postdate">
											{ article.publishedAt.slice( 0, 10 ) }
										</span>
									) }
									<a className="dash__edit" href={ editLinkFor( article.rkey ) }>
										Edit
									</a>
									<button
										type="button"
										disabled={ busy === article.rkey }
										onClick={ () => void onUnpublish( article ) }
									>
										{ busy === article.rkey ? 'Unpublishing…' : 'Unpublish' }
									</button>
								</li>
```

- [ ] **Step 4: Style the Edit link to match the post buttons**

In `src/pages/dashboard.astro`'s `<style is:global>` block, extend the existing `.dash__pubactions button, .dash__post button` selector to include the Edit anchor. Find:

```css
		.dash__pubactions button,
		.dash__post button {
```

and replace with:

```css
		.dash__pubactions button,
		.dash__post button,
		.dash__post .dash__edit {
```

Then add directly after that rule:

```css
		.dash__post .dash__edit {
			color: inherit;
			text-decoration: none;
			display: inline-flex;
			align-items: center;
		}
```

- [ ] **Step 5: Type-check and test**

Run: `npm run check && npm test`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open `/dashboard` signed in.
Expected: shared bar at top with a feather **Write** action → `/editor`; account block → public page; Sign out works. The "Your publications" breadcrumb still resets the view. Open a publication → Posts tab → each post has an **Edit** link; clicking it opens `/editor?edit=<rkey>` with the article loaded.

- [ ] **Step 7: Commit**

```bash
git add src/components/Dashboard.tsx src/pages/dashboard.astro
git commit --no-gpg-sign -m "Mount AppBar in dashboard and add per-post Edit action"
```

---

## Task 8: Remove `MyArticles`; clean up editor-chrome styles; final check

**Files:**
- Delete: `src/components/MyArticles.tsx`, `src/components/MyArticles.test.tsx`
- Modify: `src/styles/editor-chrome.css`

- [ ] **Step 1: Confirm `MyArticles` has no importers**

Run: `grep -rn "MyArticles" src --include=*.tsx --include=*.ts`
Expected: only `src/components/MyArticles.tsx` and `src/components/MyArticles.test.tsx` (its own definition/test). If `Studio.tsx` still references it, remove that import first.

- [ ] **Step 2: Delete the component and its test**

```bash
trash src/components/MyArticles.tsx src/components/MyArticles.test.tsx
```

- [ ] **Step 3: Remove dead styles from `editor-chrome.css`**

In `src/styles/editor-chrome.css`, delete the now-unused rule blocks:
- the `Account bar (signed in)` section: `.studio__account`, `.studio__identity`, `.studio__avatar`, `.studio__avatar--fallback`, `.studio__who`, `.studio__name`, `.studio__handle`, `.studio__account-actions`, `.studio__viewpage`, `.studio__viewpage:hover`, `.studio__signout` (lines ~25–96).
- the `Your articles + mode bar` section's `.myarticles*` rules: `.myarticles`, `.myarticles__heading`, `.myarticles__loading`, `.myarticles__list`, `.myarticles__item`, `.myarticles__edited`, `.myarticles__pub`, `.myarticles__actions`, `.myarticles__actions button, .myarticles__actions a`, `.myarticles__actions a` (lines ~199–259).

Keep `.studio__loading`, `.studio__login`, `.studio__error`, the `.publish*` rules, `.studio__mode*`, the `.studio__title*` rules (added in Task 6), and all `.skypress-editor*` rules.

- [ ] **Step 4: Raise the editor canvas height**

In `src/styles/editor-chrome.css`, find the `.skypress-editor .iso-editor` rule and add a `min-height` so the canvas fills ~70% of the viewport by default. Change:

```css
.skypress-editor .iso-editor {
	background-color: var(--paper-raised);
	border: 1px solid var(--line-strong);
	border-radius: var(--radius);
	color: var(--ink);
	box-shadow: var(--shadow);
}
```

to:

```css
.skypress-editor .iso-editor {
	background-color: var(--paper-raised);
	border: 1px solid var(--line-strong);
	border-radius: var(--radius);
	color: var(--ink);
	box-shadow: var(--shadow);
	min-height: 70vh;
}
```

- [ ] **Step 5: Full check + test suite**

Run: `npm run check && npm test`
Expected: `check` PASS; tests PASS (the deleted `MyArticles.test.tsx` no longer runs). No references to deleted symbols remain.

- [ ] **Step 6: Manual verification (the whole flow)**

Run: `npm run dev`.
- `/editor`: shared bar, borderless title above a tall editor, no article list, Publish works.
- `/dashboard`: shared bar (feather → Write), per-post Edit → opens the article in the editor.
- Editor canvas is visibly taller than before. Confirm in the browser that `min-height: 70vh` lands on a sensible node — if the framed surface looks wrong (e.g. the toolbar floats away from content), move the `min-height` to the content region (`.skypress-editor .iso-editor .edit-post-visual-editor`) instead and re-verify.

- [ ] **Step 7: Commit**

```bash
git add src/components/MyArticles.tsx src/components/MyArticles.test.tsx src/styles/editor-chrome.css
git commit --no-gpg-sign -m "Remove MyArticles list and clean up editor chrome styles"
```

---

## Final verification

- [ ] `npm run check` passes (types + lint).
- [ ] `npm test` passes (new `nav`, `edit-link`, `getMyArticle` tests included; `MyArticles.test.tsx` removed).
- [ ] No `@wordpress/*` import reaches `AppBar.tsx`, `nav.ts`, or `edit-link.ts` (grep to confirm): `grep -rn "@wordpress" src/components/AppBar.tsx src/lib/auth/nav.ts src/lib/editor/edit-link.ts` → no matches.
- [ ] Manual: editor + dashboard share the bar; editing flows dashboard → editor via `?edit=`; title is borderless above a ~70vh canvas; published-article list is gone from the editor.
