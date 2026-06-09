# Empty-state "Create your first publication" CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a "Create your first publication" button next to the public author page's "No SkyPress publications yet." empty state, visible only to the signed-in owner of that profile.

**Architecture:** The author page (`src/pages/[author]/index.astro`) is server-rendered and cannot import the auth stack. Owner detection happens in a small `client:only="react"` island (`CreatePublicationCta`) that wraps the existing `@wordpress`-free `AuthProvider` and compares the viewer's DID against the server-resolved profile DID. The DID-comparison decision is extracted into a pure helper (`isProfileOwner`) so it can be unit-tested — the repo has no React component-test framework, only vitest/jsdom over pure-logic `.test.ts` files.

**Tech Stack:** Astro (islands, `client:only="react"`), React 18, `@atproto/oauth-client-browser` via `AuthProvider`, vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-09-empty-state-create-publication-cta-design.md`

---

### Task 1: Pure owner-detection helper

**Files:**
- Create: `src/lib/auth/cta.ts`
- Test: `src/lib/auth/cta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/cta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isProfileOwner } from './cta';

const PROFILE = 'did:plc:profile';

describe( 'isProfileOwner', () => {
	it( 'is true when signed in and the viewer DID matches the profile DID', () => {
		expect( isProfileOwner( 'signed-in', 'did:plc:profile', PROFILE ) ).toBe( true );
	} );

	it( 'is false when signed in as a different DID', () => {
		expect( isProfileOwner( 'signed-in', 'did:plc:someone-else', PROFILE ) ).toBe( false );
	} );

	it( 'is false when the viewer DID is null', () => {
		expect( isProfileOwner( 'signed-in', null, PROFILE ) ).toBe( false );
	} );

	it( 'is false for loading, signed-out and error statuses even if a DID matches', () => {
		expect( isProfileOwner( 'loading', PROFILE, PROFILE ) ).toBe( false );
		expect( isProfileOwner( 'signed-out', PROFILE, PROFILE ) ).toBe( false );
		expect( isProfileOwner( 'error', PROFILE, PROFILE ) ).toBe( false );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/auth/cta.test.ts`
Expected: FAIL — cannot resolve `./cta` / `isProfileOwner is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/auth/cta.ts`:

```ts
import type { AuthStatus } from './AuthProvider';

/**
 * Whether the signed-in viewer owns the profile being viewed.
 *
 * The public author page resolves the profile DID server-side; the viewer DID
 * comes from the browser-only auth session. The CTA to create a publication is
 * meaningful only to the owner, since publications are always written under the
 * viewer's own DID.
 */
export function isProfileOwner(
	status: AuthStatus,
	viewerDid: string | null,
	profileDid: string
): boolean {
	return status === 'signed-in' && viewerDid !== null && viewerDid === profileDid;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/auth/cta.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/cta.ts src/lib/auth/cta.test.ts
git commit --no-gpg-sign -m "Add isProfileOwner helper for the author-page CTA"
```

---

### Task 2: The CreatePublicationCta island

**Files:**
- Create: `src/components/CreatePublicationCta.tsx`

This is a thin React island with no pure logic of its own (the decision lives in `isProfileOwner`, already tested in Task 1), so it follows the repo convention of unit-testing the helper and verifying the island manually. No new test file.

- [ ] **Step 1: Write the component**

Create `src/components/CreatePublicationCta.tsx`:

```tsx
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import { isProfileOwner } from '../lib/auth/cta';

/**
 * Owner-only CTA shown beneath the public author page's empty state. Renders
 * nothing unless the signed-in viewer owns this profile, so logged-out visitors
 * and other writers just see the static "No SkyPress publications yet." line.
 *
 * Reading-page island: imports only the `@wordpress`-free auth chain (AGENTS.md
 * rules 3 & 7). Mounted with `client:only="react"`.
 */
function Cta( { profileDid }: { profileDid: string } ) {
	const { status, did } = useAuth();
	if ( ! isProfileOwner( status, did, profileDid ) ) {
		return null;
	}
	return (
		<a className="author__cta" href="/dashboard">
			Create your first publication
		</a>
	);
}

export default function CreatePublicationCta( { profileDid }: { profileDid: string } ) {
	return (
		<AuthProvider>
			<Cta profileDid={ profileDid } />
		</AuthProvider>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CreatePublicationCta.tsx
git commit --no-gpg-sign -m "Add CreatePublicationCta owner-only island"
```

---

### Task 3: Mount the CTA on the author page

**Files:**
- Modify: `src/pages/[author]/index.astro` (import; the `publications.length === 0` branch around line 55; the `<style>`/global-style block)

- [ ] **Step 1: Import the island**

In the frontmatter imports of `src/pages/[author]/index.astro`, after the existing component/util imports (e.g. after the `buildGetBlobUrl` import on line 7), add:

```ts
import CreatePublicationCta from '../../components/CreatePublicationCta.tsx';
```

- [ ] **Step 2: Render the island in the empty-state branch**

Replace the empty-state branch (currently):

```jsx
{publications.length === 0 ? (
	<p class="author__empty">No SkyPress publications yet.</p>
) : (
```

with:

```jsx
{publications.length === 0 ? (
	<div class="author__emptyblock">
		<p class="author__empty">No SkyPress publications yet.</p>
		<CreatePublicationCta client:only="react" profileDid={did} />
	</div>
) : (
```

`did` is already destructured from `resolved` earlier in the frontmatter (line 21), so it is in scope.

- [ ] **Step 3: Add styles**

The page's existing `<style>` block (starting at line 86) is Astro-scoped and will **not** reach the `client:only` island's DOM. Add the button rule in a new global block so it applies to the island. Append after the closing `</style>` of the existing scoped block (the file currently ends at the `</style>` on line 211):

```html
<!-- CreatePublicationCta is a `client:only` React island, so Astro's scoped
     styles never reach its DOM. The CTA rule must be global. -->
<style is:global>
	.author__emptyblock {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
	}
	.author__cta {
		display: inline-block;
		border-radius: 8px;
		background: var(--sun);
		color: #fff;
		font-weight: 600;
		text-decoration: none;
		padding: 0.5rem 1rem;
	}
	.author__cta:hover {
		text-decoration: none;
		opacity: 0.92;
	}
</style>
```

Note: `.author__empty` itself stays styled by the existing scoped rule (line 157) — it is server-rendered, so the scoped style reaches it. Only the island-rendered `.author__cta` needs the global rule. The `.author__emptyblock` wrapper is server-rendered too, but lives in the global block here for cohesion with the CTA spacing; this is harmless (a global rule also matches server-rendered DOM).

- [ ] **Step 4: Type-check and run the full test suite**

Run: `npm run check && npm test`
Expected: type-check PASS; all tests PASS (including `cta.test.ts`).

- [ ] **Step 5: Manual verification**

Run: `npm run dev` and open `http://127.0.0.1:<port>` (loopback, per AGENTS.md rule 7 — not `localhost`).
Verify:
- Signed out, visit an author page with no publications → only "No SkyPress publications yet." (no button).
- Signed in as the profile owner, same page → "Create your first publication" button appears and links to `/dashboard`.
- Signed in as a different account, viewing the first profile → no button.

- [ ] **Step 6: Commit**

```bash
git add src/pages/\[author\]/index.astro
git commit --no-gpg-sign -m "Show create-publication CTA to the owner on the empty author page"
```

---

## Self-review notes

- **Spec coverage:** pure helper (Task 1) ↔ spec "New — pure gating helper"; island (Task 2) ↔ "New — CTA island"; page mount + global style (Task 3) ↔ "Changed — `[author]/index.astro`"; tests (Task 1) ↔ spec "Testing"; manual + guard verification (Task 3 step 5) ↔ spec manual checks.
- **Types:** `isProfileOwner(status: AuthStatus, viewerDid: string | null, profileDid: string)` is defined once in Task 1 and called identically in Task 2. `AuthStatus` is exported from `AuthProvider.tsx` (verified). `useAuth()` returns `{ status, did, ... }` (verified).
- **No placeholders:** every code/command step is concrete.
- **`@wordpress` guard:** the island imports only `AuthProvider` / `useAuth` / `cta`, all `@wordpress`-free (same chain `AuthorPill` already uses on a reading page).
