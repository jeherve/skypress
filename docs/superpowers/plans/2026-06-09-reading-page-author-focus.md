# Reading-page author focus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus the reading pages on the publication and its author — drop SkyPress branding from the headers and render dates in a long English format.

**Architecture:** A new pure `formatLongDate` helper handles dates. The publication page loses its header; the single-post page swaps the SkyPress logo for the publication's logo+title (header) and the publication name for the author's avatar/name/handle (eyebrow). Page behaviour is pinned with source-level regex tests in the existing colocated `_*.meta.test.ts` files (page rendering isn't unit-testable in this jsdom suite).

**Tech Stack:** Astro (SSR pages), TypeScript, Vitest, `Intl.DateTimeFormat`.

Design: `docs/superpowers/specs/2026-06-09-reading-page-author-focus-design.md`

---

## File structure

- Create: `src/lib/reader/dates.ts` — pure `formatLongDate(iso)` long-English formatter.
- Create: `src/lib/reader/dates.test.ts` — unit tests for the formatter.
- Modify: `src/pages/[author]/[slug]/index.astro` — remove header, long dates.
- Modify: `src/pages/[author]/[slug]/_index.meta.test.ts` — pin header-removal + date.
- Modify: `src/pages/[author]/[slug]/[rkey].astro` — publication header, author eyebrow, long dates.
- Modify: `src/pages/[author]/[slug]/_[rkey].meta.test.ts` — pin new header + eyebrow + date.

---

## Task 1: Long-date helper

**Files:**
- Create: `src/lib/reader/dates.ts`
- Test: `src/lib/reader/dates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reader/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatLongDate } from './dates';

describe( 'formatLongDate', () => {
	it( 'formats an ISO datetime as a long English date', () => {
		expect( formatLongDate( '2026-06-09T12:00:00Z' ) ).toBe( 'June 9, 2026' );
	} );

	it( 'pins the calendar day to UTC regardless of time-of-day', () => {
		// Late-evening UTC must not roll forward to the 10th.
		expect( formatLongDate( '2026-06-09T23:30:00Z' ) ).toBe( 'June 9, 2026' );
		// Early-morning UTC must not roll back to the 8th.
		expect( formatLongDate( '2026-06-09T00:30:00Z' ) ).toBe( 'June 9, 2026' );
	} );

	it( 'accepts a date-only string', () => {
		expect( formatLongDate( '2026-12-25' ) ).toBe( 'December 25, 2026' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/reader/dates.test.ts`
Expected: FAIL — cannot resolve `./dates` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/reader/dates.ts`:

```ts
/**
 * Format an ISO date/datetime as a long English date, e.g. "June 9, 2026".
 *
 * The reading pages are server-rendered and the UI is English, so we render a
 * fixed `en-US` long format rather than negotiating the reader's locale (which
 * would need client JS — disallowed on the read path). `timeZone: 'UTC'` pins
 * the rendered calendar day so a late-evening UTC timestamp can't roll to the
 * next day on a server in a western zone.
 */
const longDate = new Intl.DateTimeFormat( 'en-US', {
	dateStyle: 'long',
	timeZone: 'UTC',
} );

export function formatLongDate( iso: string ): string {
	return longDate.format( new Date( iso ) );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/reader/dates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reader/dates.ts src/lib/reader/dates.test.ts
git commit --no-gpg-sign -m "Add formatLongDate reader helper"
```

---

## Task 2: Publication page — remove header, long dates

**Files:**
- Modify: `src/pages/[author]/[slug]/index.astro`
- Test: `src/pages/[author]/[slug]/_index.meta.test.ts`

- [ ] **Step 1: Write the failing test**

Append these two `describe` blocks to `src/pages/[author]/[slug]/_index.meta.test.ts` (after the existing blocks, before the final newline):

```ts
describe( 'publication page focuses on the publication', () => {
	it( 'no longer renders the SkyPress masthead/logo', () => {
		expect( page ).not.toMatch( /class="masthead"/ );
		expect( page ).not.toMatch( /import Logo from/ );
	} );

	it( 'renders article dates in long format via formatLongDate', () => {
		expect( page ).toMatch(
			/import\s*\{\s*formatLongDate\s*\}\s*from\s*'[^']*lib\/reader\/dates'/
		);
		expect( page ).toMatch( /formatLongDate\(/ );
		// The old ISO-slice date format is gone.
		expect( page ).not.toMatch( /publishedAt\?\.slice\(\s*0,\s*10\s*\)/ );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- "src/pages/[author]/[slug]/_index.meta.test.ts"`
Expected: FAIL — masthead/Logo still present, `formatLongDate` not imported.

- [ ] **Step 3: Implement the changes**

In `src/pages/[author]/[slug]/index.astro`:

a) Remove the `Logo` import line:

```astro
import Logo from '../../../components/Logo.astro';
```

b) Add the `formatLongDate` import after the `fetchActorProfile` import:

```astro
import { formatLongDate } from '../../../lib/reader/dates';
```

c) Change the article date mapping. Replace:

```astro
				publishedLabel: record.value.publishedAt?.slice( 0, 10 ) ?? null,
```

with:

```astro
				publishedLabel: record.value.publishedAt
					? formatLongDate( record.value.publishedAt )
					: null,
```

d) Remove the entire header block:

```astro
			<header class="masthead">
				<a href="/"><Logo /></a>
			</header>

```

e) Remove the now-unused masthead CSS rules from the `<style>` block:

```css
	.masthead {
		padding: 1.5rem clamp(1.25rem, 5vw, 4rem);
		border-bottom: 1px solid var(--line);
	}
	.masthead a {
		text-decoration: none;
	}
```

- [ ] **Step 4: Run tests + check**

Run: `npm run test -- "src/pages/[author]/[slug]/_index.meta.test.ts"`
Expected: PASS (all blocks, including the two new ones).

Run: `npm run check`
Expected: no type/astro errors.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/[author]/[slug]/index.astro" "src/pages/[author]/[slug]/_index.meta.test.ts"
git commit --no-gpg-sign -m "Drop SkyPress header and use long dates on publication page"
```

---

## Task 3: Single post page — publication header + author eyebrow + long dates

**Files:**
- Modify: `src/pages/[author]/[slug]/[rkey].astro`
- Test: `src/pages/[author]/[slug]/_[rkey].meta.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `describe` block to `src/pages/[author]/[slug]/_[rkey].meta.test.ts` (after the existing block):

```ts
describe( 'document page focuses on publication + author', () => {
	it( 'replaces the SkyPress logo header with the publication logo + title linking to the publication', () => {
		expect( page ).not.toMatch( /import Logo from/ );
		expect( page ).not.toMatch( /<a href="\/"><Logo \/><\/a>/ );
		expect( page ).toMatch( /class="masthead__pub"\s+href=\{pubUrl\}/ );
		expect( page ).toMatch( /class="masthead__title">\{publication!?\.name\}/ );
	} );

	it( 'fetches the author profile for the eyebrow', () => {
		expect( page ).toMatch(
			/import\s*\{\s*fetchActorProfile\s*\}\s*from\s*'[^']*lib\/reader\/profile'/
		);
		expect( page ).toMatch( /fetchActorProfile\(/ );
	} );

	it( 'shows the author (name, avatar, handle) in the eyebrow, linked to the profile', () => {
		expect( page ).toMatch( /class="reader__author"\s+href=\{`\/@\$\{\s*handle\s*\}`\}/ );
		expect( page ).toMatch( /reader__avatar/ );
		expect( page ).toMatch( /authorName/ );
		// The publication name no longer stands in for the byline in the eyebrow.
		expect( page ).not.toMatch( /class="reader__author"\s+href=\{pubUrl\}/ );
	} );

	it( 'renders dates in long format via formatLongDate', () => {
		expect( page ).toMatch(
			/import\s*\{\s*formatLongDate\s*\}\s*from\s*'[^']*lib\/reader\/dates'/
		);
		expect( page ).toMatch( /formatLongDate\(/ );
		expect( page ).not.toMatch( /\.slice\(\s*0,\s*10\s*\)/ );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- "src/pages/[author]/[slug]/_[rkey].meta.test.ts"`
Expected: FAIL — Logo import present, no `masthead__pub`, no `fetchActorProfile`, no `formatLongDate`.

- [ ] **Step 3: Implement the changes**

In `src/pages/[author]/[slug]/[rkey].astro`:

a) Remove the `Logo` import line:

```astro
import Logo from '../../../components/Logo.astro';
```

b) Add these imports after the `resolveReaderPublication` import:

```astro
import { fetchActorProfile } from '../../../lib/reader/profile';
import { formatLongDate } from '../../../lib/reader/dates';
```

c) Add new top-level `let` declarations alongside the existing ones (after `let updatedLabel: string | null = null;`):

```astro
let authorName = '';
let authorHandle: string | null = null;
let authorAvatar: string | null = null;
let logoUrl: string | null = null;
let initial = '';
```

d) In the success branch (the `else` after `record.value` is validated), set the author + logo values. Add, right after `themeStyle = themeStyleBlock( publication.basicTheme );`:

```astro
				const profile = await fetchActorProfile( pdsUrl, did );
				authorName = profile.displayName ?? `@${ handle }`;
				// Only show a separate @handle chip when there's a distinct display name.
				authorHandle = profile.displayName ? `@${ handle }` : null;
				authorAvatar = profile.avatar;
				logoUrl = publication.icon
					? buildGetBlobUrl( pdsUrl, did, publication.icon.ref.$link )
					: null;
				initial = publication.name.charAt( 0 ).toUpperCase();
```

e) Change the date labels. Replace:

```astro
				publishedLabel = doc.publishedAt ? doc.publishedAt.slice( 0, 10 ) : null;
				updatedLabel = doc.updatedAt ? doc.updatedAt.slice( 0, 10 ) : null;
```

with:

```astro
				publishedLabel = doc.publishedAt ? formatLongDate( doc.publishedAt ) : null;
				updatedLabel = doc.updatedAt ? formatLongDate( doc.updatedAt ) : null;
```

f) Replace the header block. Replace:

```astro
	<header class="masthead">
		<a href="/"><Logo /></a>
	</header>
```

with:

```astro
	<header class="masthead">
		<a class="masthead__pub" href={pubUrl}>
			{logoUrl ? (
				<img class="masthead__logo" src={logoUrl} alt="" width="36" height="36" />
			) : (
				<span class="masthead__logo masthead__logo--fallback" aria-hidden="true">{initial}</span>
			)}
			<span class="masthead__title">{publication!.name}</span>
		</a>
	</header>
```

g) Replace the eyebrow block. Replace:

```astro
		<p class="reader__meta eyebrow">
			<a class="reader__author" href={pubUrl}>{publication!.name}</a>
			{publishedLabel && <> · {publishedLabel}</>}
			{updatedLabel && <> · updated {updatedLabel}</>}
			· {readingMinutes} min read
		</p>
```

with:

```astro
		<p class="reader__meta eyebrow">
			<a class="reader__author" href={`/@${ handle }`}>
				{authorAvatar && (
					<img class="reader__avatar" src={authorAvatar} alt="" width="22" height="22" />
				)}
				<span class="reader__authorname">{authorName}</span>
				{authorHandle && <span class="reader__handle">{authorHandle}</span>}
			</a>
			{publishedLabel && <> · {publishedLabel}</>}
			{updatedLabel && <> · updated {updatedLabel}</>}
			· {readingMinutes} min read
		</p>
```

h) Update the `<style>` block. Add the publication-header styles right after the existing `.masthead a { text-decoration: none; }` rule:

```css
	.masthead__pub {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		color: var(--ink);
	}
	.masthead__logo {
		width: 36px;
		height: 36px;
		border-radius: 9px;
		object-fit: cover;
		background: var(--paper-raised);
	}
	.masthead__logo--fallback {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--sun);
		background: var(--sun-tint);
	}
	.masthead__title {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.18rem;
		letter-spacing: -0.015em;
	}
```

Then replace the existing `.reader__author` rule:

```css
	.reader__author {
		color: var(--sun);
		text-decoration: none;
	}
```

with:

```css
	.reader__author {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--ink-soft);
		text-decoration: none;
	}
	.reader__author:hover {
		color: var(--sun);
	}
	.reader__avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		object-fit: cover;
	}
	.reader__handle {
		color: var(--muted);
	}
```

- [ ] **Step 4: Run tests + check**

Run: `npm run test -- "src/pages/[author]/[slug]/_[rkey].meta.test.ts"`
Expected: PASS (existing OG/error blocks + the new focus block).

Run: `npm run check`
Expected: no type/astro errors. (In particular `Logo` must be gone with no remaining references.)

- [ ] **Step 5: Commit**

```bash
git add "src/pages/[author]/[slug]/[rkey].astro" "src/pages/[author]/[slug]/_[rkey].meta.test.ts"
git commit --no-gpg-sign -m "Show publication header and author byline on single post page"
```

---

## Task 4: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`
Expected: all suites PASS (no regressions in render, sanitize, meta, etc.).

- [ ] **Step 2: Type/astro check**

Run: `npm run check`
Expected: clean.

- [ ] **Step 3: Build smoke**

Run: `npm run build`
Expected: build succeeds (the read pages are `prerender = false`, so this confirms no import-time breakage).

---

## Self-review notes

- **Spec coverage:** header removal (Task 2d/e), publication header swap (Task 3f/h),
  author eyebrow (Task 3d/g/h), long dates both pages (Tasks 2c, 3e + helper Task 1).
  All four design goals mapped.
- **No-JS constraint:** the date helper runs at SSR time; no client script added.
- **Profile degradation:** `fetchActorProfile` returns nulls (never throws) on failure,
  so a missing profile yields `authorName = @handle`, no avatar, no separate handle chip —
  the page still renders.
- **Type consistency:** `authorName`/`authorHandle`/`authorAvatar`/`logoUrl`/`initial`
  declared in Task 3c, assigned in 3d, consumed in 3f/3g.
