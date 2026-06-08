# Signed-in author pill + editor author-info redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a signed-in author pill (avatar + name + handle) on the home page next to "Open the studio", and redesign the editor's account bar with the same richer identity plus a "View my public page" link.

**Architecture:** A read-only `AuthorPill` client island restores the browser OAuth session and fetches the viewer's profile for the home page; `AuthProvider` is extended to expose the same profile fields for the editor. Both share one pure-logic module (`src/lib/auth/profile.ts`) that defines the profile shape, the fetch, and display helpers. The home page stays `@wordpress`-free.

**Tech Stack:** Astro 4 (islands), React 18, `@atproto/api` (`Agent`, `getProfile`), `@atproto/oauth-client-browser`, Vitest (jsdom). Indentation is **tabs**; code style uses spaces inside parens/brackets (match surrounding files).

---

## File Structure

- **Create** `src/lib/auth/profile.ts` — `ViewerProfile` type, `fetchViewerProfile`, `displayNameFor`, `authorPath`. Pure logic + one network call wrapper. The single source of truth for "who is signed in".
- **Create** `src/lib/auth/profile.test.ts` — unit tests for the above.
- **Create** `src/components/AuthorPill.tsx` — home-page client island (read-only session restore + profile → pill).
- **Modify** `src/lib/auth/AuthProvider.tsx` — use `fetchViewerProfile`; expose `displayName` + `avatar`.
- **Modify** `src/components/Studio.tsx` — redesigned account bar.
- **Modify** `src/pages/index.astro` — mount `<AuthorPill>` in the masthead + pill styles.
- **Modify** `src/pages/editor.astro` — `.studio__account` styles for the new layout.

Note on testing: this repo has **no React component-test framework** (vitest only collects `src/**/*.test.ts`; no `@testing-library`). Do **not** add one. All automated tests target `profile.ts`. The islands/bars are verified by `npm run check` (types) and `npm run dev` (browser).

---

## Task 1: Profile module — types + `fetchViewerProfile`

**Files:**
- Create: `src/lib/auth/profile.ts`
- Test: `src/lib/auth/profile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/profile.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import { fetchViewerProfile } from './profile';

/** Minimal Agent stub: only getProfile is exercised. */
function agentReturning( data: Record< string, unknown > ): Agent {
	return { getProfile: vi.fn().mockResolvedValue( { data } ) } as unknown as Agent;
}
function agentThrowing(): Agent {
	return { getProfile: vi.fn().mockRejectedValue( new Error( 'appview down' ) ) } as unknown as Agent;
}

describe( 'fetchViewerProfile', () => {
	it( 'maps did, handle, displayName and avatar from getProfile', async () => {
		const agent = agentReturning( {
			did: 'did:plc:abc',
			handle: 'jane.bsky.social',
			displayName: 'Jane Rivera',
			avatar: 'https://cdn.example/av.jpg',
		} );
		const profile = await fetchViewerProfile( agent, 'did:plc:abc' );
		expect( profile ).toEqual( {
			did: 'did:plc:abc',
			handle: 'jane.bsky.social',
			displayName: 'Jane Rivera',
			avatar: 'https://cdn.example/av.jpg',
		} );
	} );

	it( 'falls back to nulls but keeps the did when getProfile throws', async () => {
		const profile = await fetchViewerProfile( agentThrowing(), 'did:plc:abc' );
		expect( profile ).toEqual( {
			did: 'did:plc:abc',
			handle: null,
			displayName: null,
			avatar: null,
		} );
	} );

	it( 'coerces missing optional fields to null', async () => {
		const agent = agentReturning( { did: 'did:plc:abc', handle: 'jane.bsky.social' } );
		const profile = await fetchViewerProfile( agent, 'did:plc:abc' );
		expect( profile.displayName ).toBeNull();
		expect( profile.avatar ).toBeNull();
		expect( profile.handle ).toBe( 'jane.bsky.social' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- profile`
Expected: FAIL — cannot resolve `./profile` (module not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/auth/profile.ts`:

```ts
import type { Agent } from '@atproto/api';

/** The signed-in writer's identity, as shown in the home pill and editor bar. */
export interface ViewerProfile {
	did: string;
	handle: string | null;
	displayName: string | null;
	avatar: string | null;
}

/**
 * Fetch the viewer's profile for display. Wraps a single `getProfile` call and
 * never throws: on failure (e.g. the appview is unreachable) it returns the DID
 * with null display fields, so callers always have something to render.
 */
export async function fetchViewerProfile( agent: Agent, did: string ): Promise< ViewerProfile > {
	try {
		const { data } = await agent.getProfile( { actor: did } );
		return {
			did,
			handle: data.handle ?? null,
			displayName: data.displayName ?? null,
			avatar: data.avatar ?? null,
		};
	} catch {
		return { did, handle: null, displayName: null, avatar: null };
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- profile`
Expected: PASS — the three `fetchViewerProfile` tests are green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/profile.ts src/lib/auth/profile.test.ts
git commit --no-gpg-sign -m "Add fetchViewerProfile: single source for signed-in identity"
```

---

## Task 2: Profile module — `displayNameFor` + `authorPath`

**Files:**
- Modify: `src/lib/auth/profile.ts`
- Test: `src/lib/auth/profile.test.ts`

- [ ] **Step 1: Add the failing tests**

First, widen the import in `src/lib/auth/profile.test.ts`. Change:

```ts
import { fetchViewerProfile } from './profile';
```

to:

```ts
import { fetchViewerProfile, displayNameFor, authorPath } from './profile';
```

Then append to `src/lib/auth/profile.test.ts` (after the existing `describe`):

```ts
describe( 'displayNameFor', () => {
	const base = { did: 'did:plc:abc', handle: 'jane.bsky.social', avatar: null };
	it( 'prefers displayName', () => {
		expect( displayNameFor( { ...base, displayName: 'Jane Rivera' } ) ).toBe( 'Jane Rivera' );
	} );
	it( 'falls back to handle when displayName is null', () => {
		expect( displayNameFor( { ...base, displayName: null } ) ).toBe( 'jane.bsky.social' );
	} );
	it( 'falls back to the did when handle and displayName are null', () => {
		expect(
			displayNameFor( { did: 'did:plc:abc', handle: null, displayName: null, avatar: null } )
		).toBe( 'did:plc:abc' );
	} );
} );

describe( 'authorPath', () => {
	it( 'builds the public page path for a handle', () => {
		expect( authorPath( 'jane.bsky.social' ) ).toBe( '/@jane.bsky.social' );
	} );
	it( 'returns null when there is no handle', () => {
		expect( authorPath( null ) ).toBeNull();
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- profile`
Expected: FAIL — `displayNameFor` / `authorPath` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/auth/profile.ts`:

```ts
/** Best display label for a viewer: real name, else handle, else the raw DID. */
export function displayNameFor( profile: ViewerProfile ): string {
	return profile.displayName ?? profile.handle ?? profile.did;
}

/**
 * Public author-page path for a handle (the `/[author]` route requires a leading
 * `@` and resolves by handle). Returns null when no handle is known, so callers
 * can omit the link rather than render a broken one.
 */
export function authorPath( handle: string | null ): string | null {
	return handle ? `/@${ handle }` : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- profile`
Expected: PASS — all `profile.test.ts` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/profile.ts src/lib/auth/profile.test.ts
git commit --no-gpg-sign -m "Add displayNameFor + authorPath display helpers"
```

---

## Task 3: Extend `AuthProvider` to expose displayName + avatar

**Files:**
- Modify: `src/lib/auth/AuthProvider.tsx`

This task is wiring on an existing fetch (no new network call); verified by `npm run check`. No new automated test (no component-test framework — see header).

- [ ] **Step 1: Replace the `resolveHandle` helper with `fetchViewerProfile`**

In `src/lib/auth/AuthProvider.tsx`, update the import block. Change:

```ts
import { createOAuthClient } from './oauth';
import { isValidAccountInput, normalizeHandle } from './config';
import { resolvePdsUrl } from '../media/pds';
```

to:

```ts
import { createOAuthClient } from './oauth';
import { isValidAccountInput, normalizeHandle } from './config';
import { resolvePdsUrl } from '../media/pds';
import { fetchViewerProfile } from './profile';
```

Then delete the entire `resolveHandle` helper function (the `/** Best-effort handle lookup… */` block and its body).

- [ ] **Step 2: Add displayName + avatar to the context type**

In the `AuthContextValue` interface, add two fields after `handle: string | null;`:

```ts
	handle: string | null;
	displayName: string | null;
	avatar: string | null;
```

- [ ] **Step 3: Add state and populate it from one profile fetch**

Add state near the other `useState` calls (after the `handle` state):

```ts
	const [ displayName, setDisplayName ] = useState< string | null >( null );
	const [ avatar, setAvatar ] = useState< string | null >( null );
```

In `adoptSession`, replace the line:

```ts
		setHandle( await resolveHandle( nextAgent, session.did ) );
```

with:

```ts
		const profile = await fetchViewerProfile( nextAgent, session.did );
		setHandle( profile.handle );
		setDisplayName( profile.displayName );
		setAvatar( profile.avatar );
```

- [ ] **Step 4: Reset the new fields on sign-out and expose them**

In `signOut`, after `setHandle( null );` add:

```ts
		setDisplayName( null );
		setAvatar( null );
```

In the `AuthContext.Provider` value object, add the two fields (after `handle`):

```ts
			value={ { status, agent, did, handle, displayName, avatar, pdsUrl, error, signIn, signOut } }
```

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: PASS — no type errors. (`resolveHandle` is fully removed; all references updated.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/AuthProvider.tsx
git commit --no-gpg-sign -m "Expose displayName + avatar from AuthProvider via fetchViewerProfile"
```

---

## Task 4: Redesign the editor account bar

**Files:**
- Modify: `src/components/Studio.tsx`
- Modify: `src/pages/editor.astro` (global styles)

- [ ] **Step 1: Consume the new fields and render the redesigned bar**

In `src/components/Studio.tsx`, update the `useAuth()` destructure (currently `const { status, agent, handle, did, pdsUrl, error, signOut } = useAuth();`) to add `displayName` and `avatar`:

```ts
	const { status, agent, handle, displayName, avatar, did, pdsUrl, error, signOut } = useAuth();
```

Add an import at the top, after the other lib imports:

```ts
	import { displayNameFor, authorPath } from '../lib/auth/profile';
```

Replace the entire `<div className="studio__account">…</div>` block with:

```tsx
					<div className="studio__account">
						<span className="studio__identity">
							{ avatar ? (
								<img className="studio__avatar" src={ avatar } alt="" width={ 38 } height={ 38 } />
							) : (
								<span className="studio__avatar studio__avatar--fallback" aria-hidden="true">
									{ displayNameFor( { did, handle, displayName, avatar } ).charAt( 0 ).toUpperCase() }
								</span>
							) }
							<span className="studio__who">
								<strong className="studio__name">
									{ displayNameFor( { did, handle, displayName, avatar } ) }
								</strong>
								{ handle && <span className="studio__handle">@{ handle }</span> }
							</span>
						</span>
						<span className="studio__account-actions">
							{ authorPath( handle ) && (
								<a className="studio__viewpage" href={ authorPath( handle ) as string }>
									View my public page ↗
								</a>
							) }
							<button
								type="button"
								className="studio__signout"
								onClick={ () => void signOut() }
							>
								Sign out
							</button>
						</span>
					</div>
```

- [ ] **Step 2: Add the styles**

In `src/pages/editor.astro`, inside the `<style is:global>` block, replace the existing `.studio__account` and `.studio__signout` rules with:

```css
		/* Account bar (signed in) */
		.studio__account {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			padding: 0.5rem 1.25rem;
			background: var(--panel);
			border-bottom: 1px solid var(--line);
			font-size: 0.9rem;
			flex-wrap: wrap;
		}
		.studio__identity {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			min-width: 0;
		}
		.studio__avatar {
			width: 38px;
			height: 38px;
			border-radius: 50%;
			object-fit: cover;
			flex: none;
		}
		.studio__avatar--fallback {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			background: var(--sun-tint);
			color: var(--sun);
			font-weight: 700;
		}
		.studio__who {
			display: flex;
			flex-direction: column;
			line-height: 1.15;
			min-width: 0;
		}
		.studio__name {
			font-weight: 680;
		}
		.studio__handle {
			color: var(--muted);
			font-size: 0.8rem;
		}
		.studio__account-actions {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			flex-wrap: wrap;
		}
		.studio__viewpage {
			color: var(--sun);
			text-decoration: none;
			font-size: 0.85rem;
			padding: 0.3rem 0.5rem;
			border-radius: var(--radius-sm);
		}
		.studio__viewpage:hover {
			text-decoration: underline;
		}
		.studio__signout {
			border: 1px solid var(--line-strong);
			background: var(--paper-raised);
			border-radius: var(--radius-sm);
			padding: 0.3rem 0.7rem;
			cursor: pointer;
			font: inherit;
		}
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open `http://127.0.0.1:4321/editor` (use `127.0.0.1`, not `localhost` — atproto loopback requirement). If signed in, confirm: avatar (or initial fallback), display name, `@handle`, a working "View my public page ↗" link to `/@{handle}`, and Sign out. If signed out, confirm the login form still renders.

- [ ] **Step 5: Commit**

```bash
git add src/components/Studio.tsx src/pages/editor.astro
git commit --no-gpg-sign -m "Redesign editor account bar: avatar + name/handle + public-page link"
```

---

## Task 5: Build the home `AuthorPill` island

**Files:**
- Create: `src/components/AuthorPill.tsx`

The island is thin wiring over the tested `profile.ts` helpers; verified by `npm run check` + browser. No component test (see header).

- [ ] **Step 1: Create the island**

Create `src/components/AuthorPill.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Agent } from '@atproto/api';
import { createOAuthClient } from '../lib/auth/oauth';
import { fetchViewerProfile, displayNameFor, authorPath, type ViewerProfile } from '../lib/auth/profile';

/**
 * Read-only signed-in badge for the home masthead. Restores the browser OAuth
 * session and shows the viewer's avatar + name + handle, linking to their public
 * page. Renders nothing when signed out or if anything fails — it is non-critical
 * chrome, so it never surfaces errors (the editor is where auth errors live).
 */
export default function AuthorPill() {
	const [ profile, setProfile ] = useState< ViewerProfile | null >( null );

	useEffect( () => {
		let cancelled = false;
		( async () => {
			try {
				const client = await createOAuthClient();
				const result = await client.init();
				if ( cancelled || ! result?.session ) {
					return;
				}
				const next = await fetchViewerProfile( new Agent( result.session ), result.session.did );
				if ( ! cancelled ) {
					setProfile( next );
				}
			} catch {
				// Non-critical chrome: stay hidden on any failure.
			}
		} )();
		return () => {
			cancelled = true;
		};
	}, [] );

	if ( ! profile ) {
		return null;
	}

	const name = displayNameFor( profile );
	const href = authorPath( profile.handle );

	const inner = (
		<>
			{ profile.avatar ? (
				<img className="authorpill__avatar" src={ profile.avatar } alt="" width={ 30 } height={ 30 } />
			) : (
				<span className="authorpill__avatar authorpill__avatar--fallback" aria-hidden="true">
					{ name.charAt( 0 ).toUpperCase() }
				</span>
			) }
			<span className="authorpill__who">
				<span className="authorpill__name">{ name }</span>
				{ profile.handle && <span className="authorpill__handle">@{ profile.handle }</span> }
			</span>
		</>
	);

	return href ? (
		<a className="authorpill" href={ href }>
			{ inner }
		</a>
	) : (
		<span className="authorpill">{ inner }</span>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/AuthorPill.tsx
git commit --no-gpg-sign -m "Add read-only AuthorPill island for the home masthead"
```

---

## Task 6: Mount the pill in the home masthead + style it

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Import and mount the island**

In `src/pages/index.astro`, add to the frontmatter import block (after the `Logo` import):

```astro
import AuthorPill from '../components/AuthorPill.tsx';
```

Replace the masthead block:

```astro
			<header class="masthead">
				<Logo />
				<a class="btn btn--ghost" href="/editor">Open the studio</a>
			</header>
```

with (pill left of the button, per the approved layout):

```astro
			<header class="masthead">
				<Logo />
				<div class="masthead__right">
					<AuthorPill client:only="react" />
					<a class="btn btn--ghost" href="/editor">Open the studio</a>
				</div>
			</header>
```

- [ ] **Step 2: Add the pill styles**

In `src/pages/index.astro`, inside the `<style>` block, add a `.masthead__right` rule near the `.masthead` rule:

```css
		.masthead__right {
			display: flex;
			align-items: center;
			gap: 0.75rem;
		}
```

Then add the pill styles. The pill sits on the sky, so it uses the same per-phase chip variables as the ghost buttons. Add after the `.masthead .btn--ghost` block:

```css
		/* Signed-in author pill — shares the frosted sky-chip treatment + button radius. */
		.masthead .authorpill {
			display: inline-flex;
			align-items: center;
			gap: 0.55rem;
			padding: 0.32rem 0.7rem 0.32rem 0.4rem;
			border-radius: var(--radius-sm);
			background: var(--sky-chip);
			border: 1px solid var(--sky-line);
			color: var(--sky-ink);
			text-decoration: none;
			backdrop-filter: blur(8px);
			-webkit-backdrop-filter: blur(8px);
			text-shadow: var(--sky-shadow);
		}
		.masthead .authorpill:hover {
			border-color: var(--sky-ink);
		}
		.authorpill__avatar {
			width: 30px;
			height: 30px;
			border-radius: 50%;
			object-fit: cover;
			flex: none;
		}
		.authorpill__avatar--fallback {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			background: rgba(255, 255, 255, 0.25);
			font-weight: 700;
			font-size: 0.85rem;
		}
		.authorpill__who {
			display: flex;
			flex-direction: column;
			line-height: 1.1;
		}
		.authorpill__name {
			font-weight: 680;
			font-size: 0.86rem;
		}
		.authorpill__handle {
			font-size: 0.72rem;
			opacity: 0.8;
		}
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open `http://127.0.0.1:4321/`.
- Signed out: masthead shows only "Open the studio" (no pill, no flash of placeholder).
- Signed in (sign in via `/editor` first if needed): the pill appears left of the button with avatar/name/handle and links to `/@{handle}`.
- Toggle a couple of `data-phase` values (via devtools on `<html>`) to confirm the pill reads on both dark and the pale midday sky.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro
git commit --no-gpg-sign -m "Show signed-in author pill in the home masthead"
```

---

## Task 7: Full verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — including the new `profile.test.ts`; no regressions.

- [ ] **Step 2: Type-check the whole project**

Run: `npm run check`
Expected: PASS — no errors.

- [ ] **Step 3: Confirm the home bundle stays `@wordpress`-free**

Run: `npm run build`
Expected: build succeeds. Then confirm no `@wordpress` code is pulled into the landing page by checking that the home page's emitted client JS does not reference WordPress packages:

Run: `grep -rl "@wordpress" dist/ | grep -i "index\|author-pill\|AuthorPill" || echo "clean: no @wordpress in home/pill chunks"`
Expected: prints `clean: …` (the `AuthorPill` + index chunks must not contain `@wordpress`). If any home/pill chunk matches, the island accidentally pulled in the editor — stop and trace the import.

- [ ] **Step 4: Final manual pass**

Run: `npm run dev`, then exercise both pages at `http://127.0.0.1:4321/`:
- `/` signed out → button only; `/` signed in → pill + button, pill links to `/@{handle}`.
- `/editor` signed in → redesigned bar (avatar/name/handle + public-page link + Sign out); Sign out works and returns to the login form; reload `/` → pill is gone.

- [ ] **Step 5: No commit** (verification only). If any fix was needed, commit it with a descriptive message.
