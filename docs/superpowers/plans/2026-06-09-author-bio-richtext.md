# Author Bio Rich Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Linkify URLs, `@mentions`, and `#tags` in author bios on the public author page, matching how Bluesky renders the same plain-text bio.

**Architecture:** A new pure module `src/lib/reader/rich-text.ts` runs `@atproto/api`'s `RichText.detectFacetsWithoutResolution()` (the same detection Bluesky uses, no network) over the bio and returns ordered `BioSegment`s. The author page maps those segments to text + anchors with Astro auto-escaping (no `set:html`).

**Tech Stack:** TypeScript, Astro (SSR), `@atproto/api` (`RichText`), Vitest.

**Reference:** Design doc `docs/superpowers/specs/2026-06-09-author-bio-richtext-design.md`.

**Conventions to match:** tab indentation; spaces inside parens/brackets (`( { ... } )`); single quotes; semicolons. Commit messages use plain imperative sentences (e.g. "Add …"), no `feat:` prefix, no Claude co-author. Commit with `--no-gpg-sign`.

---

### Task 1: `detectBioSegments` module (TDD)

**Files:**
- Create: `src/lib/reader/rich-text.ts`
- Test: `src/lib/reader/rich-text.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reader/rich-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectBioSegments, safeHttpHref } from './rich-text';

describe( 'detectBioSegments', () => {
	it( 'returns a single text segment for plain prose', () => {
		expect( detectBioSegments( 'Just a writer.' ) ).toEqual( [
			{ type: 'text', text: 'Just a writer.' },
		] );
	} );

	it( 'returns an empty array for blank input', () => {
		expect( detectBioSegments( '   ' ) ).toEqual( [] );
	} );

	it( 'linkifies a full URL and keeps trailing punctuation out of the link', () => {
		expect( detectBioSegments( 'Visit https://example.com.' ) ).toEqual( [
			{ type: 'text', text: 'Visit ' },
			{ type: 'link', text: 'https://example.com', href: 'https://example.com' },
			{ type: 'text', text: '.' },
		] );
	} );

	it( 'linkifies a bare domain with an https href and bare display text', () => {
		expect( detectBioSegments( 'example.com' ) ).toEqual( [
			{ type: 'link', text: 'example.com', href: 'https://example.com' },
		] );
	} );

	it( 'links a mention to its Bluesky profile by handle', () => {
		expect( detectBioSegments( 'hi @alice.bsky.social' ) ).toEqual( [
			{ type: 'text', text: 'hi ' },
			{
				type: 'link',
				text: '@alice.bsky.social',
				href: 'https://bsky.app/profile/alice.bsky.social',
			},
		] );
	} );

	it( 'links a hashtag to its Bluesky hashtag page', () => {
		expect( detectBioSegments( 'love #design' ) ).toEqual( [
			{ type: 'text', text: 'love ' },
			{ type: 'link', text: '#design', href: 'https://bsky.app/hashtag/design' },
		] );
	} );

	it( 'orders mixed text, url, mention and tag segments correctly', () => {
		expect(
			detectBioSegments( 'me @alice.bsky.social #design example.com' )
		).toEqual( [
			{ type: 'text', text: 'me ' },
			{
				type: 'link',
				text: '@alice.bsky.social',
				href: 'https://bsky.app/profile/alice.bsky.social',
			},
			{ type: 'text', text: ' ' },
			{ type: 'link', text: '#design', href: 'https://bsky.app/hashtag/design' },
			{ type: 'text', text: ' ' },
			{ type: 'link', text: 'example.com', href: 'https://example.com' },
		] );
	} );
} );

describe( 'safeHttpHref', () => {
	it( 'passes http and https through unchanged', () => {
		expect( safeHttpHref( 'https://example.com' ) ).toBe( 'https://example.com' );
		expect( safeHttpHref( 'http://example.com/x' ) ).toBe( 'http://example.com/x' );
	} );

	it( 'rejects non-http(s) schemes and garbage', () => {
		expect( safeHttpHref( 'javascript:alert(1)' ) ).toBeNull();
		expect( safeHttpHref( 'ftp://example.com' ) ).toBeNull();
		expect( safeHttpHref( 'not a url' ) ).toBeNull();
	} );
} );
```

> **Note on expected strings:** the link/href *intent* is the contract. We deliberately defer text-segment boundaries to `@atproto/api`'s tokenizer, which is the whole point of Approach 1. When you first run these tests, if the installed atproto version splits a *text* segment slightly differently (e.g. whitespace grouping), update the expected literals to match the actual atproto output — but the `link` segments, their display text, and their hrefs must match exactly as written. Do **not** change the implementation to force a particular text split.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/reader/rich-text.test.ts`
Expected: FAIL — `Failed to resolve import './rich-text'` (module does not exist yet).

(If `@atproto/api` is not installed, run `npm install` first.)

- [ ] **Step 3: Write the implementation**

Create `src/lib/reader/rich-text.ts`:

```ts
/**
 * Linkify a writer's Bluesky bio the way the Bluesky client does.
 *
 * `app.bsky.actor.profile.description` is plain text — profile records carry no `facets`
 * (unlike `app.bsky.feed.post`). bsky.app computes the links at render time via
 * `RichText.detectFacets()`. We do the same with `detectFacetsWithoutResolution()`, which
 * needs no network: we link mentions by handle (not DID), so nothing has to be resolved.
 * That also keeps this off the SSRF-guarded fetch path entirely. (Decision 0015.)
 *
 * Returns ordered segments; the caller renders them with auto-escaping, never `set:html`.
 */
import { RichText } from '@atproto/api';

export type BioSegment =
	| { type: 'text'; text: string }
	| { type: 'link'; text: string; href: string };

/**
 * The original `uri` if it is an http(s) URL, else null. `detectFacets` should only ever
 * produce http(s) links, but this guarantees a hostile PDS can't smuggle e.g. a
 * `javascript:` URL through. Returns the raw uri (not a normalised `URL.href`) so display
 * fidelity matches what the writer typed.
 */
export function safeHttpHref( uri: string ): string | null {
	try {
		const { protocol } = new URL( uri );
		return protocol === 'http:' || protocol === 'https:' ? uri : null;
	} catch {
		return null;
	}
}

export function detectBioSegments( description: string ): BioSegment[] {
	if ( ! description.trim() ) {
		return [];
	}

	const richText = new RichText( { text: description } );
	richText.detectFacetsWithoutResolution();

	const segments: BioSegment[] = [];
	for ( const segment of richText.segments() ) {
		let href: string | null = null;

		if ( segment.isLink() && segment.link ) {
			href = safeHttpHref( segment.link.uri );
		} else if ( segment.isMention() ) {
			const handle = segment.text.replace( /^@/, '' );
			href = handle
				? `https://bsky.app/profile/${ encodeURIComponent( handle ) }`
				: null;
		} else if ( segment.isTag() ) {
			const tag = segment.text.replace( /^#/, '' );
			href = tag ? `https://bsky.app/hashtag/${ encodeURIComponent( tag ) }` : null;
		}

		segments.push(
			href
				? { type: 'link', text: segment.text, href }
				: { type: 'text', text: segment.text }
		);
	}

	return segments;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/reader/rich-text.test.ts`
Expected: PASS (all cases). If only a *text*-segment boundary differs, adjust the test literals per the Step 1 note, then re-run to green.

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no new type errors. (Confirms `RichText` imports cleanly in the SSR/node context — the one risk flagged in the design. If it pulls in browser-only code, isolate the import behind a thin wrapper and re-run.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/reader/rich-text.ts src/lib/reader/rich-text.test.ts
git commit --no-gpg-sign -m "Add bio rich-text facet detection for author pages"
```

---

### Task 2: Render linkified bio on the author page

**Files:**
- Modify: `src/pages/[author]/index.astro` (frontmatter ~line 22-47; bio line 101; styles ~line 225-229)

- [ ] **Step 1: Import the detector**

In the frontmatter import block (after the existing `fetchActorProfile` import, ~line 6), add:

```astro
import { detectBioSegments } from '../../lib/reader/rich-text';
```

- [ ] **Step 2: Declare and populate `bioSegments`**

In the `let` declarations block (near line 22-25), add:

```astro
let bioSegments: ReturnType< typeof detectBioSegments > = [];
```

Inside the `if ( ! error && resolved ) {` block, after `initial` is set (~line 46), add:

```astro
	bioSegments = profile.description ? detectBioSegments( profile.description ) : [];
```

- [ ] **Step 3: Replace the plain-text bio line**

Replace line 101:

```astro
				{profile!.description && <p class="author__bio">{profile!.description}</p>}
```

with:

```astro
				{bioSegments.length > 0 && (
					<p class="author__bio">
						{bioSegments.map( ( seg ) =>
							seg.type === 'link' ? (
								<a href={seg.href} target="_blank" rel="noopener noreferrer nofollow">
									{seg.text}
								</a>
							) : (
								seg.text
							)
						)}
					</p>
				)}
```

> Leave the `Base` `description={profile!.description ?? undefined}` prop (line 58) unchanged — the SEO meta description stays raw plain text.

- [ ] **Step 4: Style bio links**

In the `.author__bio` style rule (~line 225-229), add a following rule:

```css
		.author__bio a {
			color: var(--sun);
		}
```

- [ ] **Step 5: Type-check and build**

Run: `npm run check && npm run build`
Expected: both succeed with no new errors. (There is no Astro component-render test harness in this repo; Task 1 unit tests cover the detection logic, and `check` + `build` verify the template wiring.)

- [ ] **Step 6: Manual verification (dev)**

Per AGENTS.md constraint 7, serve on `127.0.0.1`. Note: the dev server binds IPv6 — browse via `localhost`, not `curl 127.0.0.1` (see auto-memory `astro-dev-binds-ipv6-localhost`).

Run: `npm run dev`
Visit an author page whose Bluesky bio contains a URL, `@mention`, and `#tag` (e.g. `http://localhost:<port>/@<handle>`). Confirm the bio shows clickable links pointing at the raw URL, `bsky.app/profile/<handle>`, and `bsky.app/hashtag/<tag>`, and that surrounding text renders normally.

- [ ] **Step 7: Commit**

```bash
git add src/pages/[author]/index.astro
git commit --no-gpg-sign -m "Render linkified bios on the author page"
```

---

### Task 3: Docs — update contract comment and record the decision

**Files:**
- Modify: `src/lib/reader/profile.ts:9`
- Create: `docs/decisions/0015-author-bio-richtext.md`

- [ ] **Step 1: Update the `profile.ts` contract comment**

Replace line 9:

```ts
 * `displayName`/`description` are plain text; callers render them as text, never as HTML.
```

with:

```ts
 * `displayName` is plain text. `description` is plain text in the record, but the author
 * page linkifies it at render via `detectBioSegments` (rich-text.ts), mirroring Bluesky.
 * Neither is ever injected as raw HTML. (Decision 0015.)
```

- [ ] **Step 2: Write the decision record**

Create `docs/decisions/0015-author-bio-richtext.md`:

```markdown
# 0015 — Linkified author bios from detected facets

## Context

Author pages show the writer's Bluesky bio (`app.bsky.actor.profile.description`). On
bsky.app that bio has clickable URLs, `@mentions`, and `#tags`, but those links are **not
in the PDS record** — profile descriptions are plain text and carry no `facets` (unlike
`app.bsky.feed.post`). Bluesky's client computes them at render time with
`RichText.detectFacets()`. We want the same on the author page.

## Options

1. **Hand-rolled regex detector.** Full control, no extra import, but "match Bluesky
   fully" becomes a hand-maintained moving target (URL tokenizer subtleties, bare domains,
   trailing punctuation, unicode tags) that silently drifts from bsky.app.
2. **`@atproto/api` `RichText.detectFacets(agent)`.** Exact Bluesky behaviour *including*
   handle→DID resolution — but resolution means network calls and new SSRF surface, for no
   benefit since we link mentions by handle.
3. **`@atproto/api` `RichText.detectFacetsWithoutResolution()`.** The same detection code
   Bluesky runs, minus mention resolution. Pure, no network.

## Choice

Option 3. A pure module `src/lib/reader/rich-text.ts` exposes `detectBioSegments()`, which
returns ordered `text`/`link` segments. The author page renders them with Astro
auto-escaping (no `set:html`). Mentions link to `https://bsky.app/profile/<handle>`, tags
to `https://bsky.app/hashtag/<tag>`, URLs to the detected uri. An http(s) scheme guard
(`safeHttpHref`) drops any non-http(s) link as defence in depth.

## Why

- **Fidelity by construction.** Reusing atproto's detection means our links can't drift
  from bsky.app's.
- **No new read-path risk.** No network call, so the SSRF guard (AGENTS.md constraint 6a)
  does not apply; no `set:html`, so the sanitiser (6b) does not apply — Astro escapes both
  text and attributes, and the scheme guard blocks hostile URL schemes.
- **No DID resolution needed** because mentions link by handle (we accept linking to
  Bluesky rather than internal author pages for now).

## Scope

Author bios only. Publication descriptions, display names, and post excerpts are
unchanged. Article body links are unaffected — they are authored HTML anchors in the block
tree, never facets.
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/reader/profile.ts docs/decisions/0015-author-bio-richtext.md
git commit --no-gpg-sign -m "Document bio rich-text contract and record decision 0015"
```

---

## Final verification

- [ ] Run the full suite: `npm run test`
- [ ] Run: `npm run check && npm run build`
- [ ] All green → ready for branch finish / PR.
