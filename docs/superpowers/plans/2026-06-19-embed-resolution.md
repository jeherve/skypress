# Embed Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render atproto post URLs and YouTube/Vimeo URLs in article content as rich, server-rendered static cards on the reading page, with a live atproto preview in the editor.

**Architecture:** A shared, dependency-free `src/lib/embeds/` module recognises URLs (registry), fetches data at read time via the SSRF-guarded `safeFetch` (resolve), and builds trusted card HTML with all untrusted values escaped (card). The reader runs an async `resolveEmbeds` pre-pass that attaches resolved data onto `core/embed` nodes; `render.ts` then renders the card synchronously and the existing sanitiser runs last. Video is a static facade whose `<iframe>` is injected client-side only on a play click, validated against a two-host allowlist. The editor reuses the same fetch + card code through a `@wordpress/api-fetch` middleware over `core/embed`.

**Tech Stack:** TypeScript, Astro (SSR), Vitest (jsdom), `@wordpress/blocks`/`block-editor`/`api-fetch`, `sanitize-html`, the public Bluesky AppView (`public.api.bsky.app`), YouTube/Vimeo oEmbed.

## Global Constraints

- **React 18 only.** Do not introduce React 19. (Decision 0001)
- **`src/lib/embeds/*`, `render.ts`, `render-article.ts`, `sanitize.ts` must NEVER import `@wordpress/*`.** They run on reading pages, which are editor-free. (Decision 0003, AGENTS.md rule 3)
- **Sanitise is the LAST step before any injection.** Embed cards are rendered into the tree before `sanitizeArticleHtml`; the sanitiser allowlist is widened, never bypassed. (Decision 0018, AGENTS.md rule 6)
- **Any server-side `fetch` to a user-derived host MUST go through `src/lib/net/safe-fetch.ts`.** (AGENTS.md rule 6a)
- **New PHP-style strict types N/A** (TS project). **Tests are colocated `*.test.ts`**, run with `npm run test` (`vitest run`). Files under `src/pages/` that are tests must be `_`-prefixed (AGENTS.md rule 8) — not relevant here (no page tests).
- **View links point at `mu.social` / "the ATmosphere"** via `src/lib/social/atmosphere-url.ts`. (Decision 0022)
- **Code style:** spaces inside parens/brackets `( like this )`, tabs for indent, single quotes, JSDoc on exported functions — match surrounding files.
- **Curated allowlist unchanged:** `core/embed` is already allowlisted; do not add or remove blocks. (Decision 0002)

---

## Shared Contract (types & names used across tasks)

Define these in Task 1/Task 2 exactly as written; later tasks import them.

```ts
// src/lib/embeds/registry.ts
export type EmbedKind = 'atproto' | 'youtube' | 'vimeo';
export interface EmbedMatch {
	kind: EmbedKind;
	/** atproto: "<authority>/<rkey>" (authority = handle or did). youtube/vimeo: the video id. */
	id: string;
}
export function detectEmbed( url: string ): EmbedMatch | null;

// src/lib/embeds/card.ts
export interface AtprotoImage { src: string; alt: string }
export interface AtprotoCardData {
	kind: 'atproto';
	authorName: string;     // displayName or @handle
	handle: string;         // bare handle, no @
	avatar?: string;
	text: string;
	images: AtprotoImage[];
	createdAt?: string;     // ISO string
	viewUrl: string;        // mu.social view link
}
export interface VideoCardData {
	kind: 'youtube' | 'vimeo';
	id: string;
	title: string;
	thumbnail: string;
	url: string;            // original watch URL (facade fallback link)
}
export type EmbedData = AtprotoCardData | VideoCardData;
export function escapeHtml( value: string ): string;
export function renderEmbedCard( data: EmbedData ): string;

// src/lib/embeds/playback.ts
export function playbackUrl( provider: 'youtube' | 'vimeo', id: string ): string;
export function isTrustedPlaybackUrl( url: string ): boolean;

// src/lib/embeds/resolve.ts
export type FetchLike = ( url: string ) => Promise< Response >;
export function fetchAtprotoCard( match: EmbedMatch, fetchImpl?: FetchLike ): Promise< AtprotoCardData | null >;
export function fetchVideoCard( match: EmbedMatch, fetchImpl?: FetchLike ): Promise< VideoCardData | null >;
export function resolveEmbeds(
	blocks: BlockNode[],
	options?: { only?: EmbedKind[]; fetchImpl?: FetchLike }
): Promise< BlockNode[] >;
```

**Payload convention:** `resolveEmbeds` attaches the resolved data onto the node as `attributes._skypressEmbed: EmbedData`. `render.ts`'s `core/embed` case reads `node.attributes?._skypressEmbed`.

---

### Task 1: Provider registry (`detectEmbed`)

**Files:**
- Create: `src/lib/embeds/registry.ts`
- Test: `src/lib/embeds/registry.test.ts`

**Interfaces:**
- Produces: `EmbedKind`, `EmbedMatch`, `detectEmbed( url ) → EmbedMatch | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/embeds/registry.test.ts
import { describe, expect, it } from 'vitest';
import { detectEmbed } from './registry';

describe( 'detectEmbed', () => {
	it( 'recognises a bsky.app post URL', () => {
		expect( detectEmbed( 'https://bsky.app/profile/jeremy.herve.bzh/post/3momrv24o4wlj' ) ).toEqual(
			{ kind: 'atproto', id: 'jeremy.herve.bzh/3momrv24o4wlj' }
		);
	} );

	it( 'recognises a mu.social post URL', () => {
		expect( detectEmbed( 'https://mu.social/profile/renderg.host/post/3mokzwgfyck2e' ) ).toEqual(
			{ kind: 'atproto', id: 'renderg.host/3mokzwgfyck2e' }
		);
	} );

	it( 'recognises a DID-based post URL', () => {
		expect( detectEmbed( 'https://bsky.app/profile/did:plc:abc123/post/xyz' ) ).toEqual(
			{ kind: 'atproto', id: 'did:plc:abc123/xyz' }
		);
	} );

	it( 'recognises a raw at:// post URI', () => {
		expect( detectEmbed( 'at://did:plc:abc123/app.bsky.feed.post/xyz' ) ).toEqual(
			{ kind: 'atproto', id: 'did:plc:abc123/xyz' }
		);
	} );

	it( 'recognises youtube watch + youtu.be + nocookie URLs', () => {
		expect( detectEmbed( 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' ) ).toEqual( { kind: 'youtube', id: 'dQw4w9WgXcQ' } );
		expect( detectEmbed( 'https://youtu.be/dQw4w9WgXcQ' ) ).toEqual( { kind: 'youtube', id: 'dQw4w9WgXcQ' } );
	} );

	it( 'recognises a vimeo URL', () => {
		expect( detectEmbed( 'https://vimeo.com/123456789' ) ).toEqual( { kind: 'vimeo', id: '123456789' } );
	} );

	it( 'does NOT match look-alike hosts (dot-boundary safety)', () => {
		expect( detectEmbed( 'https://notbsky.app/profile/a/post/b' ) ).toBeNull();
		expect( detectEmbed( 'https://bsky.app.evil.com/profile/a/post/b' ) ).toBeNull();
		expect( detectEmbed( 'https://evil-youtube.com/watch?v=x' ) ).toBeNull();
	} );

	it( 'returns null for unrelated or malformed URLs', () => {
		expect( detectEmbed( 'https://example.com/article' ) ).toBeNull();
		expect( detectEmbed( 'not a url' ) ).toBeNull();
		expect( detectEmbed( 'https://bsky.app/profile/alice.bsky.social' ) ).toBeNull(); // profile, not a post
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/embeds/registry.test.ts`
Expected: FAIL — `Cannot find module './registry'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/embeds/registry.ts
/**
 * Recognise which embed provider a URL belongs to (the embed content model).
 *
 * Dependency-free (no `@wordpress/*`) so both the reader path and the editor can
 * import it. Hosts are matched at a dot boundary — `host === domain ||
 * host.endsWith( '.' + domain )` — so look-alikes (`notbsky.app`,
 * `bsky.app.evil.com`) do NOT match. Mirrors the `detectProvider` pattern
 * (Decision 0017). A URL we don't recognise returns null → it stays a plain link.
 */
export type EmbedKind = 'atproto' | 'youtube' | 'vimeo';

export interface EmbedMatch {
	kind: EmbedKind;
	/** atproto: "<authority>/<rkey>" (authority = handle or did). video: the id. */
	id: string;
}

/** AppView web hosts that use the standard `/profile/<id>/post/<rkey>` scheme. */
const ATPROTO_HOSTS = [ 'bsky.app', 'mu.social' ];

function hostMatches( host: string, domain: string ): boolean {
	const h = host.toLowerCase();
	return h === domain || h.endsWith( '.' + domain );
}

export function detectEmbed( url: string ): EmbedMatch | null {
	// Raw at:// post URI.
	const at = url.match( /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)/ );
	if ( at ) {
		return { kind: 'atproto', id: `${ at[ 1 ] }/${ at[ 2 ] }` };
	}

	let parsed: URL;
	try {
		parsed = new URL( url );
	} catch {
		return null;
	}
	const host = parsed.hostname;

	if ( ATPROTO_HOSTS.some( ( d ) => hostMatches( host, d ) ) ) {
		const m = parsed.pathname.match( /^\/profile\/([^/]+)\/post\/([^/?#]+)/ );
		return m ? { kind: 'atproto', id: `${ m[ 1 ] }/${ m[ 2 ] }` } : null;
	}

	if ( hostMatches( host, 'youtube.com' ) ) {
		const v = parsed.searchParams.get( 'v' );
		return v ? { kind: 'youtube', id: v } : null;
	}
	if ( hostMatches( host, 'youtu.be' ) ) {
		const id = parsed.pathname.slice( 1 ).split( '/' )[ 0 ];
		return id ? { kind: 'youtube', id } : null;
	}
	if ( hostMatches( host, 'vimeo.com' ) ) {
		const id = parsed.pathname.split( '/' ).filter( Boolean )[ 0 ];
		return id && /^\d+$/.test( id ) ? { kind: 'vimeo', id } : null;
	}

	return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/embeds/registry.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/embeds/registry.ts src/lib/embeds/registry.test.ts
git commit --no-gpg-sign -m "Embeds: recognise atproto/youtube/vimeo URLs (registry)"
```

---

### Task 2: Card rendering + HTML escaping (`card.ts`)

**Files:**
- Create: `src/lib/embeds/card.ts`
- Test: `src/lib/embeds/card.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `AtprotoImage`, `AtprotoCardData`, `VideoCardData`, `EmbedData`, `escapeHtml( value )`, `renderEmbedCard( data )`.

The card markup is built by trusted code; **every interpolated value is passed through `escapeHtml`**. The video card is a static facade — thumbnail + title + a play `<button>` carrying `data-embed-provider`/`data-embed-id` — and contains **no `<iframe>`** (the iframe is injected client-side in Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/embeds/card.test.ts
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEmbedCard } from './card';

describe( 'escapeHtml', () => {
	it( 'escapes the HTML metacharacters', () => {
		expect( escapeHtml( `<img src=x onerror="alert(1)"> & "q" 'a'` ) ).toBe(
			'&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;q&quot; &#39;a&#39;'
		);
	} );
} );

describe( 'renderEmbedCard — atproto', () => {
	const data = {
		kind: 'atproto' as const,
		authorName: 'Jeremy',
		handle: 'jeremy.herve.bzh',
		avatar: 'https://cdn.example/av.jpg',
		text: 'Hello <script>alert(1)</script> world',
		images: [ { src: 'https://cdn.example/i.jpg', alt: 'a "nice" pic' } ],
		createdAt: '2026-06-19T10:00:00.000Z',
		viewUrl: 'https://mu.social/profile/did:plc:x/post/abc',
	};

	it( 'renders a static card with escaped post text', () => {
		const html = renderEmbedCard( data );
		expect( html ).toContain( 'class="wp-block-embed skypress-embed skypress-embed--atproto"' );
		expect( html ).toContain( 'Hello &lt;script&gt;alert(1)&lt;/script&gt; world' );
		expect( html ).not.toContain( '<script>' );
		expect( html ).toContain( 'href="https://mu.social/profile/did:plc:x/post/abc"' );
		expect( html ).toContain( '@jeremy.herve.bzh' );
	} );

	it( 'escapes hostile image alt text', () => {
		expect( renderEmbedCard( data ) ).toContain( 'alt="a &quot;nice&quot; pic"' );
	} );

	it( 'contains no iframe', () => {
		expect( renderEmbedCard( data ) ).not.toContain( '<iframe' );
	} );
} );

describe( 'renderEmbedCard — video facade', () => {
	const data = {
		kind: 'youtube' as const,
		id: 'dQw4w9WgXcQ',
		title: 'Cool <b>video</b>',
		thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
		url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	};

	it( 'renders a facade with a play button and data attributes, no iframe', () => {
		const html = renderEmbedCard( data );
		expect( html ).toContain( 'skypress-embed--video' );
		expect( html ).toContain( 'data-embed-provider="youtube"' );
		expect( html ).toContain( 'data-embed-id="dQw4w9WgXcQ"' );
		expect( html ).toContain( '<button' );
		expect( html ).toContain( 'Cool &lt;b&gt;video&lt;/b&gt;' );
		expect( html ).not.toContain( '<iframe' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/embeds/card.test.ts`
Expected: FAIL — `Cannot find module './card'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/embeds/card.ts
/**
 * Build trusted embed-card HTML from resolved data. Dependency-free (no
 * `@wordpress/*`) so the reader path and the editor share one renderer.
 *
 * SECURITY: the card structure is trusted, but every interpolated value comes
 * from a PDS or a provider's oEmbed (UNTRUSTED) and is passed through
 * `escapeHtml`. The video card is a facade — it carries no `<iframe>`; the
 * iframe is injected client-side on a play click, validated against a two-host
 * allowlist (see `playback.ts`). The whole card still passes through
 * `sanitizeArticleHtml` last (Decision 0018).
 */
export interface AtprotoImage { src: string; alt: string }

export interface AtprotoCardData {
	kind: 'atproto';
	authorName: string;
	handle: string;
	avatar?: string;
	text: string;
	images: AtprotoImage[];
	createdAt?: string;
	viewUrl: string;
}

export interface VideoCardData {
	kind: 'youtube' | 'vimeo';
	id: string;
	title: string;
	thumbnail: string;
	url: string;
}

export type EmbedData = AtprotoCardData | VideoCardData;

export function escapeHtml( value: string ): string {
	return value
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' )
		.replace( /'/g, '&#39;' );
}

function atprotoCard( d: AtprotoCardData ): string {
	const avatar = d.avatar
		? `<img class="skypress-embed__avatar" src="${ escapeHtml( d.avatar ) }" alt=""/>`
		: '';
	const images = d.images
		.map(
			( img ) =>
				`<img class="skypress-embed__image" src="${ escapeHtml( img.src ) }" alt="${ escapeHtml( img.alt ) }"/>`
		)
		.join( '' );
	const text = escapeHtml( d.text ).replace( /\n/g, '<br/>' );
	return (
		`<figure class="wp-block-embed skypress-embed skypress-embed--atproto">` +
		`<a class="skypress-embed__link" href="${ escapeHtml( d.viewUrl ) }">` +
		`<span class="skypress-embed__head">${ avatar }` +
		`<span class="skypress-embed__author">${ escapeHtml( d.authorName ) }</span>` +
		`<span class="skypress-embed__handle">@${ escapeHtml( d.handle ) }</span></span>` +
		`<span class="skypress-embed__text">${ text }</span>` +
		( images ? `<span class="skypress-embed__media">${ images }</span>` : '' ) +
		`<span class="skypress-embed__footer">🌀 View on the ATmosphere</span>` +
		`</a></figure>`
	);
}

function videoCard( d: VideoCardData ): string {
	return (
		`<figure class="wp-block-embed skypress-embed skypress-embed--video">` +
		`<button type="button" class="skypress-embed__play" data-embed-provider="${ escapeHtml( d.kind ) }" data-embed-id="${ escapeHtml( d.id ) }">` +
		`<img class="skypress-embed__thumb" src="${ escapeHtml( d.thumbnail ) }" alt=""/>` +
		`<span class="skypress-embed__playicon" aria-hidden="true">▶</span>` +
		`<span class="skypress-embed__title">${ escapeHtml( d.title ) }</span>` +
		`</button>` +
		`<a class="skypress-embed__fallback" href="${ escapeHtml( d.url ) }">Watch on ${ d.kind === 'youtube' ? 'YouTube' : 'Vimeo' }</a>` +
		`</figure>`
	);
}

export function renderEmbedCard( data: EmbedData ): string {
	return data.kind === 'atproto' ? atprotoCard( data ) : videoCard( data );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/embeds/card.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/embeds/card.ts src/lib/embeds/card.test.ts
git commit --no-gpg-sign -m "Embeds: trusted card + facade renderer with escaping"
```

---

### Task 3: Playback URL helper (`playback.ts`)

**Files:**
- Create: `src/lib/embeds/playback.ts`
- Test: `src/lib/embeds/playback.test.ts`

**Interfaces:**
- Produces: `playbackUrl( provider, id )`, `isTrustedPlaybackUrl( url )`. Used by the reader facade script (Task 7) to build and re-validate the iframe `src`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/embeds/playback.test.ts
import { describe, expect, it } from 'vitest';
import { playbackUrl, isTrustedPlaybackUrl } from './playback';

describe( 'playbackUrl', () => {
	it( 'builds privacy-friendly youtube + vimeo URLs', () => {
		expect( playbackUrl( 'youtube', 'dQw4w9WgXcQ' ) ).toBe(
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1'
		);
		expect( playbackUrl( 'vimeo', '123456789' ) ).toBe(
			'https://player.vimeo.com/video/123456789?autoplay=1'
		);
	} );

	it( 'URL-encodes the id', () => {
		expect( playbackUrl( 'youtube', 'a/b?c' ) ).toContain( '/embed/a%2Fb%3Fc?' );
	} );
} );

describe( 'isTrustedPlaybackUrl', () => {
	it( 'accepts only the two playback hosts', () => {
		expect( isTrustedPlaybackUrl( 'https://www.youtube-nocookie.com/embed/x?autoplay=1' ) ).toBe( true );
		expect( isTrustedPlaybackUrl( 'https://player.vimeo.com/video/1?autoplay=1' ) ).toBe( true );
	} );

	it( 'rejects anything else', () => {
		expect( isTrustedPlaybackUrl( 'https://evil.com/embed/x' ) ).toBe( false );
		expect( isTrustedPlaybackUrl( 'https://www.youtube-nocookie.com.evil.com/embed/x' ) ).toBe( false );
		expect( isTrustedPlaybackUrl( 'javascript:alert(1)' ) ).toBe( false );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/embeds/playback.test.ts`
Expected: FAIL — `Cannot find module './playback'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/embeds/playback.ts
/**
 * The trusted video playback hosts and the URLs the reader facade is allowed to
 * load. Kept tiny and host-exact: the facade script reconstructs the iframe `src`
 * from provider + id (never a raw URL from the document) and re-validates it with
 * `isTrustedPlaybackUrl` before insertion (AGENTS.md rule 6). Dependency-free.
 */
const PLAYBACK_HOSTS = [ 'www.youtube-nocookie.com', 'player.vimeo.com' ];

export function playbackUrl( provider: 'youtube' | 'vimeo', id: string ): string {
	const safeId = encodeURIComponent( id );
	return provider === 'youtube'
		? `https://www.youtube-nocookie.com/embed/${ safeId }?autoplay=1`
		: `https://player.vimeo.com/video/${ safeId }?autoplay=1`;
}

export function isTrustedPlaybackUrl( url: string ): boolean {
	try {
		const parsed = new URL( url );
		return parsed.protocol === 'https:' && PLAYBACK_HOSTS.includes( parsed.hostname );
	} catch {
		return false;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/embeds/playback.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/embeds/playback.ts src/lib/embeds/playback.test.ts
git commit --no-gpg-sign -m "Embeds: trusted playback URL builder + validator"
```

---

### Task 4: Embed resolution (`resolve.ts`)

**Files:**
- Create: `src/lib/embeds/resolve.ts`
- Test: `src/lib/embeds/resolve.test.ts`

**Interfaces:**
- Consumes: `detectEmbed`/`EmbedMatch`/`EmbedKind` (Task 1); `AtprotoCardData`/`VideoCardData` (Task 2); `atmospherePostWebUrl` (`src/lib/social/atmosphere-url.ts`); `safeFetch` (`src/lib/net/safe-fetch.ts`); `BlockNode` (`src/lib/blocks/render.ts`).
- Produces: `FetchLike`, `fetchAtprotoCard`, `fetchVideoCard`, `resolveEmbeds`.

Mirrors `fetchPostExists` (`src/lib/social/interactions.ts`): unauthenticated AppView reads via `app.bsky.feed.getPosts?uris=`, injectable `fetchImpl`, graceful null on any failure. A handle authority is resolved to a DID via `app.bsky.actor.getProfile` first (getPosts needs a DID at-uri). The `viewUrl` is always built from the DID at-uri with `atmospherePostWebUrl` (Decision 0022). YouTube/Vimeo use their public oEmbed endpoints for title + thumbnail.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/embeds/resolve.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fetchAtprotoCard, fetchVideoCard, resolveEmbeds } from './resolve';
import type { EmbedMatch } from './registry';

function jsonResponse( body: unknown, ok = true ): Response {
	return { ok, json: async () => body } as unknown as Response;
}

describe( 'fetchAtprotoCard', () => {
	it( 'resolves a handle authority to a DID, then fetches the post', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce( jsonResponse( { did: 'did:plc:abc' } ) ) // getProfile
			.mockResolvedValueOnce(
				jsonResponse( {
					posts: [
						{
							uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
							author: { handle: 'jeremy.herve.bzh', displayName: 'Jeremy', avatar: 'https://cdn/av.jpg' },
							record: { text: 'Hi there', createdAt: '2026-06-19T10:00:00Z' },
							embed: {
								$type: 'app.bsky.embed.images#view',
								images: [ { fullsize: 'https://cdn/i.jpg', alt: 'pic' } ],
							},
						},
					],
				} )
			);

		const match: EmbedMatch = { kind: 'atproto', id: 'jeremy.herve.bzh/xyz' };
		const card = await fetchAtprotoCard( match, fetchImpl );

		expect( fetchImpl.mock.calls[ 0 ][ 0 ] ).toContain( 'app.bsky.actor.getProfile?actor=jeremy.herve.bzh' );
		expect( fetchImpl.mock.calls[ 1 ][ 0 ] ).toContain(
			'getPosts?uris=at%3A%2F%2Fdid%3Aplc%3Aabc%2Fapp.bsky.feed.post%2Fxyz'
		);
		expect( card ).toMatchObject( {
			kind: 'atproto',
			authorName: 'Jeremy',
			handle: 'jeremy.herve.bzh',
			text: 'Hi there',
			images: [ { src: 'https://cdn/i.jpg', alt: 'pic' } ],
			viewUrl: 'https://mu.social/profile/did:plc:abc/post/xyz',
		} );
	} );

	it( 'skips profile resolution when the authority is already a DID', async () => {
		const fetchImpl = vi.fn().mockResolvedValueOnce(
			jsonResponse( {
				posts: [ { uri: 'at://did:plc:abc/app.bsky.feed.post/xyz', author: { handle: 'a.bsky.social' }, record: { text: 't' } } ],
			} )
		);
		await fetchAtprotoCard( { kind: 'atproto', id: 'did:plc:abc/xyz' }, fetchImpl );
		expect( fetchImpl ).toHaveBeenCalledTimes( 1 );
		expect( fetchImpl.mock.calls[ 0 ][ 0 ] ).toContain( 'getPosts' );
	} );

	it( 'returns null when the post is missing', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( jsonResponse( { posts: [] } ) );
		expect( await fetchAtprotoCard( { kind: 'atproto', id: 'did:plc:abc/xyz' }, fetchImpl ) ).toBeNull();
	} );

	it( 'returns null on a thrown fetch', async () => {
		const fetchImpl = vi.fn().mockRejectedValue( new Error( 'network' ) );
		expect( await fetchAtprotoCard( { kind: 'atproto', id: 'did:plc:abc/xyz' }, fetchImpl ) ).toBeNull();
	} );
} );

describe( 'fetchVideoCard', () => {
	it( 'reads title + thumbnail from youtube oEmbed', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse( { title: 'Cool', thumbnail_url: 'https://i.ytimg/x.jpg' } )
		);
		const card = await fetchVideoCard( { kind: 'youtube', id: 'dQw4w9WgXcQ' }, fetchImpl );
		expect( card ).toEqual( {
			kind: 'youtube',
			id: 'dQw4w9WgXcQ',
			title: 'Cool',
			thumbnail: 'https://i.ytimg/x.jpg',
			url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		} );
	} );

	it( 'returns null on oEmbed failure', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( jsonResponse( {}, false ) );
		expect( await fetchVideoCard( { kind: 'vimeo', id: '1' }, fetchImpl ) ).toBeNull();
	} );
} );

describe( 'resolveEmbeds', () => {
	const blocks = [
		{ name: 'core/paragraph', attributes: { content: 'hello' } },
		{ name: 'core/embed', attributes: { url: 'https://vimeo.com/123' } },
	];

	it( 'attaches resolved data onto recognised core/embed nodes', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( jsonResponse( { title: 'V', thumbnail_url: 'https://t/x.jpg' } ) );
		const out = await resolveEmbeds( blocks, { fetchImpl } );
		expect( out[ 0 ].attributes ).not.toHaveProperty( '_skypressEmbed' );
		expect( out[ 1 ].attributes?._skypressEmbed ).toMatchObject( { kind: 'vimeo', title: 'V' } );
	} );

	it( 'leaves unrecognised embeds and other blocks untouched', async () => {
		const fetchImpl = vi.fn();
		const out = await resolveEmbeds(
			[ { name: 'core/embed', attributes: { url: 'https://example.com/x' } } ],
			{ fetchImpl }
		);
		expect( fetchImpl ).not.toHaveBeenCalled();
		expect( out[ 0 ].attributes ).not.toHaveProperty( '_skypressEmbed' );
	} );

	it( 'honours the `only` filter (RSS resolves atproto, not video)', async () => {
		const fetchImpl = vi.fn();
		const out = await resolveEmbeds( blocks, { only: [ 'atproto' ], fetchImpl } );
		expect( fetchImpl ).not.toHaveBeenCalled();
		expect( out[ 1 ].attributes ).not.toHaveProperty( '_skypressEmbed' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/embeds/resolve.test.ts`
Expected: FAIL — `Cannot find module './resolve'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/embeds/resolve.ts
/**
 * Resolve recognised `core/embed` URLs into card DATA at read time, attached onto
 * the node as `attributes._skypressEmbed`. Server-side fetches go through
 * `safeFetch` (SSRF guard, AGENTS.md rule 6a); a `fetchImpl` can be injected for
 * tests and for the browser editor preview (CORS-friendly AppView). Any failure
 * resolves to null → the node keeps no payload → `render.ts` falls back to a link.
 * Dependency-free (no `@wordpress/*`).
 */
import type { BlockNode } from '../blocks/render';
import { safeFetch } from '../net/safe-fetch';
import { atmospherePostWebUrl } from '../social/atmosphere-url';
import { detectEmbed, type EmbedKind, type EmbedMatch } from './registry';
import type { AtprotoCardData, AtprotoImage, VideoCardData } from './card';

export type FetchLike = ( url: string ) => Promise< Response >;

const APPVIEW = 'https://public.api.bsky.app';
const defaultFetch: FetchLike = ( url ) => safeFetch( url );

function extractImages( embed: unknown ): AtprotoImage[] {
	const e = embed as { $type?: string; images?: { fullsize?: string; thumb?: string; alt?: string }[] };
	if ( ! e || ! Array.isArray( e.images ) ) {
		return [];
	}
	return e.images
		.map( ( img ) => ( { src: img.fullsize ?? img.thumb ?? '', alt: img.alt ?? '' } ) )
		.filter( ( img ) => img.src );
}

export async function fetchAtprotoCard(
	match: EmbedMatch,
	fetchImpl: FetchLike = defaultFetch
): Promise< AtprotoCardData | null > {
	try {
		const [ authority, rkey ] = match.id.split( '/' );
		let did = authority;
		if ( ! did.startsWith( 'did:' ) ) {
			const profileRes = await fetchImpl(
				`${ APPVIEW }/xrpc/app.bsky.actor.getProfile?actor=${ encodeURIComponent( authority ) }`
			);
			if ( ! profileRes.ok ) {
				return null;
			}
			const profile = ( await profileRes.json() ) as { did?: string };
			if ( ! profile.did ) {
				return null;
			}
			did = profile.did;
		}

		const uri = `at://${ did }/app.bsky.feed.post/${ rkey }`;
		const res = await fetchImpl(
			`${ APPVIEW }/xrpc/app.bsky.feed.getPosts?uris=${ encodeURIComponent( uri ) }`
		);
		if ( ! res.ok ) {
			return null;
		}
		const data = ( await res.json() ) as { posts?: PostView[] };
		const post = data.posts?.[ 0 ];
		if ( ! post ) {
			return null;
		}
		const handle = post.author?.handle ?? '';
		return {
			kind: 'atproto',
			authorName: post.author?.displayName || `@${ handle }`,
			handle,
			avatar: post.author?.avatar,
			text: post.record?.text ?? '',
			images: extractImages( post.embed ),
			createdAt: post.record?.createdAt,
			viewUrl: atmospherePostWebUrl( uri ),
		};
	} catch {
		return null;
	}
}

interface PostView {
	uri: string;
	author?: { handle?: string; displayName?: string; avatar?: string };
	record?: { text?: string; createdAt?: string };
	embed?: unknown;
}

const OEMBED_ENDPOINTS: Record< 'youtube' | 'vimeo', ( id: string ) => string > = {
	youtube: ( id ) =>
		`https://www.youtube.com/oembed?format=json&url=${ encodeURIComponent(
			`https://www.youtube.com/watch?v=${ id }`
		) }`,
	vimeo: ( id ) => `https://vimeo.com/api/oembed.json?url=${ encodeURIComponent( `https://vimeo.com/${ id }` ) }`,
};

function watchUrl( kind: 'youtube' | 'vimeo', id: string ): string {
	return kind === 'youtube' ? `https://www.youtube.com/watch?v=${ id }` : `https://vimeo.com/${ id }`;
}

export async function fetchVideoCard(
	match: EmbedMatch,
	fetchImpl: FetchLike = defaultFetch
): Promise< VideoCardData | null > {
	if ( match.kind !== 'youtube' && match.kind !== 'vimeo' ) {
		return null;
	}
	try {
		const res = await fetchImpl( OEMBED_ENDPOINTS[ match.kind ]( match.id ) );
		if ( ! res.ok ) {
			return null;
		}
		const data = ( await res.json() ) as { title?: string; thumbnail_url?: string };
		if ( ! data.thumbnail_url ) {
			return null;
		}
		return {
			kind: match.kind,
			id: match.id,
			title: data.title ?? '',
			thumbnail: data.thumbnail_url,
			url: watchUrl( match.kind, match.id ),
		};
	} catch {
		return null;
	}
}

async function resolveOne( url: string, only: EmbedKind[] | undefined, fetchImpl: FetchLike ) {
	const match = detectEmbed( url );
	if ( ! match || ( only && ! only.includes( match.kind ) ) ) {
		return null;
	}
	return match.kind === 'atproto'
		? fetchAtprotoCard( match, fetchImpl )
		: fetchVideoCard( match, fetchImpl );
}

export async function resolveEmbeds(
	blocks: BlockNode[],
	options: { only?: EmbedKind[]; fetchImpl?: FetchLike } = {}
): Promise< BlockNode[] > {
	const fetchImpl = options.fetchImpl ?? defaultFetch;
	return Promise.all(
		blocks.map( async ( block ) => {
			const innerBlocks = await resolveEmbeds( block.innerBlocks ?? [], options );
			let attributes = { ...block.attributes };
			if ( block.name === 'core/embed' && typeof block.attributes?.url === 'string' ) {
				const data = await resolveOne( block.attributes.url, options.only, fetchImpl );
				if ( data ) {
					attributes = { ...attributes, _skypressEmbed: data };
				}
			}
			return { name: block.name, attributes, innerBlocks };
		} )
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/embeds/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/embeds/resolve.ts src/lib/embeds/resolve.test.ts
git commit --no-gpg-sign -m "Embeds: resolve atproto + video data via safe-fetch"
```

---

### Task 5: `render.ts` `core/embed` case

**Files:**
- Modify: `src/lib/blocks/render.ts` (the `switch` in `renderBlock`, ~line 28-77; header comment ~line 10-11)
- Modify: `src/lib/blocks/render.test.ts` (add an embed `describe`)

**Interfaces:**
- Consumes: `renderEmbedCard`, `EmbedData` (Task 2); the `_skypressEmbed` payload convention (Task 4).
- Produces: a `core/embed` rendering — card when a payload is present, plain link otherwise.

The existing fidelity test (`render.test.ts`) does not include `core/embed`, so it is unaffected. The embed card intentionally diverges from `serialize()` (a read-time enhancement, like blob-image URL resolution already is — AGENTS.md rule 4).

- [ ] **Step 1: Write the failing test**

```ts
// append inside src/lib/blocks/render.test.ts
describe( 'core/embed', () => {
	it( 'renders the resolved card when a payload is attached', () => {
		const html = renderBlocks( [
			{
				name: 'core/embed',
				attributes: {
					url: 'https://bsky.app/profile/a/post/b',
					_skypressEmbed: {
						kind: 'atproto',
						authorName: 'A',
						handle: 'a.bsky.social',
						text: 'hi',
						images: [],
						viewUrl: 'https://mu.social/profile/did:plc:a/post/b',
					},
				},
			},
		] );
		expect( html ).toContain( 'skypress-embed--atproto' );
		expect( html ).toContain( 'hi' );
	} );

	it( 'falls back to a plain link when there is no payload', () => {
		const html = renderBlocks( [
			{ name: 'core/embed', attributes: { url: 'https://example.com/x' } },
		] );
		expect( html ).toContain( '<a' );
		expect( html ).toContain( 'https://example.com/x' );
		expect( html ).not.toContain( 'skypress-embed' );
	} );

	it( 'renders nothing for an embed with no url and no payload', () => {
		expect( renderBlocks( [ { name: 'core/embed', attributes: {} } ] ) ).toBe( '' );
	} );
} );
```

(Add `import type { BlockNode }` is already present via the module; `renderBlocks` is already imported in this test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/blocks/render.test.ts -t "core/embed"`
Expected: FAIL — the embed renders via the default branch (no card, no link).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/blocks/render.ts`, add the import near the top (after the file's docstring, before `export interface BlockNode` is fine — but `card.ts` imports nothing from this file's runtime, so no cycle at module-eval; `resolve.ts` imports the *type* `BlockNode` only):

```ts
import { renderEmbedCard, type EmbedData } from '../embeds/card';
```

Add this case to the `switch` in `renderBlock`, before `default:`:

```ts
		case 'core/embed': {
			const data = node.attributes?._skypressEmbed as EmbedData | undefined;
			if ( data ) {
				return renderEmbedCard( data );
			}
			const url = attr( node, 'url' );
			return url
				? `<figure class="wp-block-embed"><a href="${ url }">${ url }</a></figure>`
				: '';
		}
```

Update the header comment (lines ~10-11) to reflect that embeds are now resolved:

```ts
 * Covers the curated allowlist (Decision 0002). `core/embed` renders a resolved
 * card (atproto post / video facade) when `resolveEmbeds` has attached a payload,
 * else a plain link. Card markup intentionally diverges from `serialize()` — a
 * read-time enhancement, like blob-image URL resolution (rule 4).
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/blocks/render.test.ts`
Expected: PASS — the new `core/embed` cases pass and the existing fidelity tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocks/render.ts src/lib/blocks/render.test.ts
git commit --no-gpg-sign -m "Render: core/embed renders resolved card or link fallback"
```

---

### Task 6: Sanitiser allowlist for embed cards

**Files:**
- Modify: `src/lib/reader/sanitize.ts` (the `OPTIONS` object)
- Modify: `src/lib/reader/sanitize.test.ts`

**Interfaces:**
- Consumes: card markup shape from Task 2 (`figure.wp-block-embed`, `button.skypress-embed__play` with `data-embed-provider`/`data-embed-id`, `span`, `img`, `a`).
- Produces: a sanitiser that keeps the facade markup but still strips any document-injected `<iframe>` and neutralises arbitrary attributes.

The facade carries **no iframe** through sanitise — so `iframe` stays OFF the allowlist. We allow `button` plus the two scoped `data-embed-*` attributes (only on `button`), and `loading` on `img`. A malicious doc that hand-writes a `<button data-embed-provider="…" data-embed-id="…">` can only ever cause the facade script to build a youtube/vimeo URL re-validated by `isTrustedPlaybackUrl` — never an arbitrary iframe.

- [ ] **Step 1: Write the failing test**

```ts
// append inside src/lib/reader/sanitize.test.ts
import { sanitizeArticleHtml } from './sanitize'; // (already imported at top — do not duplicate)

describe( 'embed cards', () => {
	it( 'keeps the atproto card structure', () => {
		const html = sanitizeArticleHtml(
			'<figure class="wp-block-embed skypress-embed skypress-embed--atproto"><a class="skypress-embed__link" href="https://mu.social/profile/x/post/y"><span class="skypress-embed__text">hi</span></a></figure>'
		);
		expect( html ).toContain( 'skypress-embed--atproto' );
		expect( html ).toContain( 'href="https://mu.social/profile/x/post/y"' );
	} );

	it( 'keeps the video facade button + scoped data attributes', () => {
		const html = sanitizeArticleHtml(
			'<figure class="wp-block-embed skypress-embed skypress-embed--video"><button type="button" class="skypress-embed__play" data-embed-provider="youtube" data-embed-id="dQw4w9WgXcQ"><img class="skypress-embed__thumb" src="https://i/x.jpg" alt=""/></button></figure>'
		);
		expect( html ).toContain( '<button' );
		expect( html ).toContain( 'data-embed-provider="youtube"' );
		expect( html ).toContain( 'data-embed-id="dQw4w9WgXcQ"' );
	} );

	it( 'still strips a document-injected iframe', () => {
		const html = sanitizeArticleHtml( '<p>x</p><iframe src="https://evil.com"></iframe>' );
		expect( html ).not.toContain( '<iframe' );
	} );

	it( 'strips data attributes on non-button elements and onclick handlers', () => {
		const html = sanitizeArticleHtml(
			'<span data-embed-id="x" onclick="alert(1)">t</span>'
		);
		expect( html ).not.toContain( 'data-embed-id' );
		expect( html ).not.toContain( 'onclick' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reader/sanitize.test.ts -t "embed cards"`
Expected: FAIL — `button` and the `data-embed-*` attributes are stripped (not yet allowed).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/reader/sanitize.ts`, extend `OPTIONS`:

```ts
	allowedTags: [
		'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'ul', 'ol', 'li',
		'blockquote', 'cite',
		'pre', 'code', 'kbd',
		'hr', 'figure', 'figcaption', 'img',
		'strong', 'em', 'b', 'i', 's', 'del', 'ins', 'sub', 'sup', 'mark',
		'a', 'br', 'span',
		'button', // video-embed facade play button (no iframe — injected client-side, Task 7)
	],
	allowedAttributes: {
		a: [ 'href', 'title', 'rel', 'target' ],
		img: [ 'src', 'alt', 'loading' ],
		button: [ 'type', 'data-embed-provider', 'data-embed-id' ],
		'*': [ 'class' ],
	},
```

Leave `allowedSchemes`, `allowedSchemesByTag`, and `transformTags` unchanged. `iframe` is deliberately NOT added.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/reader/sanitize.test.ts`
Expected: PASS — facade survives; iframe and stray `data-*`/`onclick` stripped.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reader/sanitize.ts src/lib/reader/sanitize.test.ts
git commit --no-gpg-sign -m "Sanitize: allow embed facade markup, keep iframe blocked"
```

---

### Task 7: Reader facade script (play → validated iframe)

**Files:**
- Create: `src/lib/embeds/facade.ts` (testable core)
- Create: `src/lib/embeds/facade.test.ts`
- Create: `src/scripts/embed-facade.ts` (browser entry — wires the core to the DOM)

**Interfaces:**
- Consumes: `playbackUrl`, `isTrustedPlaybackUrl` (Task 3).
- Produces: `activatePlay( button )` — replaces a facade `<button>` with a validated playback `<iframe>`; `initEmbedFacades( root )` — delegates click handling.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/embeds/facade.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { activatePlay } from './facade';

function facade( provider: string, id: string ): HTMLButtonElement {
	const fig = document.createElement( 'figure' );
	fig.className = 'wp-block-embed skypress-embed skypress-embed--video';
	const btn = document.createElement( 'button' );
	btn.className = 'skypress-embed__play';
	btn.dataset.embedProvider = provider;
	btn.dataset.embedId = id;
	fig.appendChild( btn );
	document.body.appendChild( fig );
	return btn;
}

describe( 'activatePlay', () => {
	it( 'replaces the button with a trusted youtube iframe', () => {
		const btn = facade( 'youtube', 'dQw4w9WgXcQ' );
		activatePlay( btn );
		const iframe = document.querySelector( 'iframe' );
		expect( iframe ).not.toBeNull();
		expect( iframe!.getAttribute( 'src' ) ).toBe(
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1'
		);
		expect( document.querySelector( 'button' ) ).toBeNull();
	} );

	it( 'does nothing for an unknown provider (never builds an iframe)', () => {
		const btn = facade( 'evil', 'x' );
		activatePlay( btn );
		expect( document.querySelector( 'iframe' ) ).toBeNull();
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/embeds/facade.test.ts`
Expected: FAIL — `Cannot find module './facade'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/embeds/facade.ts
/**
 * Client-side activation of a video-embed facade. The play button carries only
 * provider + id (set by trusted card code, Task 2); we reconstruct the playback
 * URL with `playbackUrl` and re-validate it with `isTrustedPlaybackUrl` before
 * inserting the iframe (AGENTS.md rule 6) — a hostile document can never reach an
 * arbitrary `src`. Dependency-free.
 */
import { playbackUrl, isTrustedPlaybackUrl } from './playback';

export function activatePlay( button: HTMLElement ): void {
	const provider = button.dataset.embedProvider;
	const id = button.dataset.embedId;
	if ( ( provider !== 'youtube' && provider !== 'vimeo' ) || ! id ) {
		return;
	}
	const src = playbackUrl( provider, id );
	if ( ! isTrustedPlaybackUrl( src ) ) {
		return;
	}
	const iframe = document.createElement( 'iframe' );
	iframe.setAttribute( 'src', src );
	iframe.setAttribute( 'allow', 'autoplay; fullscreen; picture-in-picture' );
	iframe.setAttribute( 'allowfullscreen', 'true' );
	iframe.setAttribute( 'loading', 'lazy' );
	iframe.className = 'skypress-embed__iframe';
	button.replaceWith( iframe );
}

export function initEmbedFacades( root: ParentNode = document ): void {
	root.addEventListener( 'click', ( event ) => {
		const button = ( event.target as HTMLElement )?.closest?.( '.skypress-embed__play' );
		if ( button instanceof HTMLElement ) {
			activatePlay( button );
		}
	} );
}
```

```ts
// src/scripts/embed-facade.ts
// Browser entry: wire facade play buttons once the article DOM is present.
import { initEmbedFacades } from '../lib/embeds/facade';

initEmbedFacades();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/embeds/facade.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/embeds/facade.ts src/lib/embeds/facade.test.ts src/scripts/embed-facade.ts
git commit --no-gpg-sign -m "Embeds: client facade activation with host re-validation"
```

---

### Task 8: Wire the article reading page + embed styles

**Files:**
- Modify: `src/pages/[author]/[slug]/[rkey].astro` (frontmatter ~line 66-67; imports ~line 14-23; add a `<script>` near the article)
- Create: `src/styles/embeds.css`

**Interfaces:**
- Consumes: `resolveEmbeds` (Task 4), the facade script (Task 7), card classes (Task 2).
- Produces: embed cards rendered on the live reading page.

This task is integration wiring — verified by `npm run check`, `npm run build`, and a manual smoke test rather than a unit test (the page composes already-tested units).

- [ ] **Step 1: Add the async pre-pass in the page frontmatter**

In `src/pages/[author]/[slug]/[rkey].astro`, add the import alongside the other reader imports (after line 6):

```ts
import { resolveEmbeds } from '../../../lib/embeds/resolve';
```

Replace the render call (currently around lines 65-67):

```ts
		const doc = document.value;
		// Blob URLs, render, sanitise, and the text fallback all live in render-article.
		const rendered = renderArticle( doc, { pdsUrl, did }, { highlight: true } );
```

with:

```ts
		const doc = document.value;
		// Resolve embeds (atproto cards + video facades) before rendering — async
		// fetches can't run inside the synchronous render-article pipeline. The
		// enriched blocks then flow through blob-resolve → render → sanitise.
		const blocksWithEmbeds = await resolveEmbeds( doc.content?.blocks ?? [] );
		const docWithEmbeds = { ...doc, content: { ...doc.content, blocks: blocksWithEmbeds } };
		const rendered = renderArticle( docWithEmbeds, { pdsUrl, did }, { highlight: true } );
```

- [ ] **Step 2: Import the embed styles and add the facade script**

Add to the style imports block (after line 19, near the other frontend block styles):

```ts
// Embed cards (atproto posts) + video facade — frontend only.
import '../../../styles/embeds.css';
```

Add the facade script just after the `<article …set:html={html} />` line (~line 163), inside the happy-path template:

```astro
		<article class="reader__article" set:html={html} />
		<script src="../../../scripts/embed-facade.ts"></script>
```

(Astro bundles a local `<script src>` that points at a project file. If the relative path errors in `check`, use an inline module script instead: `<script>import { initEmbedFacades } from '/src/lib/embeds/facade'; initEmbedFacades();</script>` — but prefer the imported entry.)

- [ ] **Step 3: Create the embed styles**

```css
/* src/styles/embeds.css — embed cards on the reading page. Utility surfaces use
   fixed colors (not theme tokens) so per-publication themes don't recolor them. */
.skypress-embed {
	margin: 1.8rem 0;
	border: 1px solid var(--line);
	border-radius: var(--radius);
	overflow: hidden;
	background: var(--paper-raised);
}
.skypress-embed--atproto .skypress-embed__link {
	display: block;
	padding: 1rem 1.2rem;
	text-decoration: none;
	color: var(--ink);
}
.skypress-embed__head {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-bottom: 0.5rem;
}
.skypress-embed__avatar {
	width: 32px;
	height: 32px;
	border-radius: 50%;
	object-fit: cover;
}
.skypress-embed__author { font-weight: 600; }
.skypress-embed__handle { color: var(--muted); font-size: 0.92rem; }
.skypress-embed__text {
	display: block;
	white-space: pre-wrap;
	line-height: 1.5;
}
.skypress-embed__media {
	display: grid;
	gap: 0.4rem;
	margin-top: 0.75rem;
}
.skypress-embed__image { width: 100%; border-radius: 8px; }
.skypress-embed__footer {
	display: block;
	margin-top: 0.75rem;
	font-size: 0.88rem;
	color: var(--muted);
}
/* Video facade */
.skypress-embed--video { position: relative; }
.skypress-embed__play {
	display: block;
	width: 100%;
	padding: 0;
	border: 0;
	background: #000;
	cursor: pointer;
	position: relative;
}
.skypress-embed__thumb { width: 100%; display: block; opacity: 0.92; }
.skypress-embed__playicon {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 3rem;
	color: #fff;
	text-shadow: 0 2px 8px rgba( 0, 0, 0, 0.5 );
}
.skypress-embed__title {
	display: block;
	padding: 0.6rem 1rem;
	color: #fff;
	background: #000;
	text-align: left;
	font-size: 0.95rem;
}
.skypress-embed__fallback {
	display: block;
	padding: 0.5rem 1rem;
	font-size: 0.85rem;
}
.skypress-embed__iframe {
	width: 100%;
	aspect-ratio: 16 / 9;
	border: 0;
	display: block;
}
```

- [ ] **Step 4: Verify the build + types**

Run: `npm run check`
Expected: no new type errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/[author]/[slug]/[rkey].astro" src/styles/embeds.css
git commit --no-gpg-sign -m "Reader: resolve + render embeds on the article page"
```

---

### Task 9: Editor live preview (apiFetch middleware over `core/embed`)

**Files:**
- Modify: `package.json` (add `@wordpress/api-fetch` dependency)
- Create: `src/lib/editor/embed-preview.ts`
- Create: `src/lib/editor/embed-preview.test.ts`
- Modify: `src/components/SkyEditor.tsx` (register the middleware in the mount-time `useMemo`, ~line 93-99)

**Interfaces:**
- Consumes: `detectEmbed` (Task 1), `fetchAtprotoCard` (Task 4), `renderEmbedCard` (Task 2).
- Produces: `buildEmbedPreview( url, fetchImpl )` (pure, testable) → an oEmbed-shaped object or null; `registerEmbedPreviewMiddleware()` (side-effecting, registers once).

`core/embed` resolves its preview via `apiFetch({ path: '/oembed/1.0/proxy?url=…' })`. The middleware intercepts that path: atproto → a real card via the CORS-friendly AppView; youtube/vimeo → a placeholder (their oEmbed isn't browser-CORS-reachable); anything else → pass through (stays a link).

- [ ] **Step 1: Add the dependency**

Run:
```bash
npm install @wordpress/api-fetch@^7.21.0
npm dedupe
```
Expected: `@wordpress/api-fetch` added to `dependencies`; `npm dedupe` keeps a single copy. (If `^7.21.0` doesn't resolve against the installed `@wordpress` wave, install the version `@wordpress/core-data` already depends on — check `npm ls @wordpress/api-fetch`.)

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/editor/embed-preview.test.ts
import { describe, expect, it, vi } from 'vitest';
import { buildEmbedPreview } from './embed-preview';

function jsonResponse( body: unknown, ok = true ): Response {
	return { ok, json: async () => body } as unknown as Response;
}

describe( 'buildEmbedPreview', () => {
	it( 'returns a rich card for an atproto URL', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse( {
				posts: [ { uri: 'at://did:plc:a/app.bsky.feed.post/b', author: { handle: 'a.bsky.social', displayName: 'A' }, record: { text: 'hello' } } ],
			} )
		);
		const preview = await buildEmbedPreview( 'https://bsky.app/profile/did:plc:a/post/b', fetchImpl );
		expect( preview ).toMatchObject( { type: 'rich', provider_name: 'Bluesky' } );
		expect( preview!.html ).toContain( 'skypress-embed--atproto' );
		expect( preview!.html ).toContain( 'hello' );
	} );

	it( 'returns a placeholder for a youtube URL (no network)', async () => {
		const fetchImpl = vi.fn();
		const preview = await buildEmbedPreview( 'https://youtu.be/dQw4w9WgXcQ', fetchImpl );
		expect( fetchImpl ).not.toHaveBeenCalled();
		expect( preview!.html ).toContain( 'renders on your published page' );
		expect( preview!.provider_name ).toBe( 'YouTube' );
	} );

	it( 'returns null for an unrecognised URL', async () => {
		expect( await buildEmbedPreview( 'https://example.com/x', vi.fn() ) ).toBeNull();
	} );
} );
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/editor/embed-preview.test.ts`
Expected: FAIL — `Cannot find module './embed-preview'`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/lib/editor/embed-preview.ts
/**
 * Make `core/embed` resolve previews without a WordPress backend. `core/embed`
 * fetches `/oembed/1.0/proxy?url=…` via `@wordpress/api-fetch`; we register a
 * middleware that answers that path from our own embed registry:
 *   - atproto  → a real card (CORS-friendly AppView), reusing the reader's
 *     `fetchAtprotoCard` + `renderEmbedCard` so editor and reader match exactly;
 *   - youtube/vimeo → a placeholder (their oEmbed isn't browser-CORS-reachable);
 *   - anything else → pass through (the URL stays a plain link).
 */
import apiFetch from '@wordpress/api-fetch';
import { detectEmbed } from '../embeds/registry';
import { fetchAtprotoCard, type FetchLike } from '../embeds/resolve';
import { renderEmbedCard } from '../embeds/card';

interface EmbedPreview {
	type: 'rich';
	version: '1.0';
	provider_name: string;
	html: string;
}

const PROVIDER_LABEL: Record< 'youtube' | 'vimeo', string > = {
	youtube: 'YouTube',
	vimeo: 'Vimeo',
};

function placeholder( label: string ): string {
	return (
		`<figure class="wp-block-embed skypress-embed skypress-embed--placeholder">` +
		`<span class="skypress-embed__text">▶ ${ label } — renders on your published page</span>` +
		`</figure>`
	);
}

export async function buildEmbedPreview(
	url: string,
	fetchImpl: FetchLike = ( u ) => fetch( u )
): Promise< EmbedPreview | null > {
	const match = detectEmbed( url );
	if ( ! match ) {
		return null;
	}
	if ( match.kind === 'atproto' ) {
		const card = await fetchAtprotoCard( match, fetchImpl );
		if ( ! card ) {
			return null;
		}
		return { type: 'rich', version: '1.0', provider_name: 'Bluesky', html: renderEmbedCard( card ) };
	}
	return {
		type: 'rich',
		version: '1.0',
		provider_name: PROVIDER_LABEL[ match.kind ],
		html: placeholder( PROVIDER_LABEL[ match.kind ] ),
	};
}

/** Extract the `url` query arg from the embed-proxy apiFetch path. */
function proxyUrl( path?: string ): string | null {
	if ( ! path || ! path.includes( '/oembed/1.0/proxy' ) ) {
		return null;
	}
	const q = path.indexOf( '?' );
	if ( q === -1 ) {
		return null;
	}
	return new URLSearchParams( path.slice( q + 1 ) ).get( 'url' );
}

let registered = false;

export function registerEmbedPreviewMiddleware(): void {
	if ( registered ) {
		return;
	}
	registered = true;
	apiFetch.use( async ( options, next ) => {
		const url = proxyUrl( ( options as { path?: string } ).path );
		if ( ! url ) {
			return next( options );
		}
		const preview = await buildEmbedPreview( url );
		// Resolve with our preview, or surface a 404 so core/embed shows "cannot
		// embed" (a clean link) rather than spinning forever.
		if ( preview ) {
			return preview as unknown as ReturnType< typeof next >;
		}
		throw { code: 'oembed_invalid_url', message: 'Not an embeddable URL' };
	} );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/editor/embed-preview.test.ts`
Expected: PASS.

- [ ] **Step 6: Register the middleware at editor mount**

In `src/components/SkyEditor.tsx`, add the import near the other lib imports (~line 49-50):

```ts
import { registerEmbedPreviewMiddleware } from '../lib/editor/embed-preview';
```

In the mount-time `useMemo` (~line 93-97), add the registration alongside the others:

```ts
	const initialValue = useMemo( () => {
		registerSkyPressBlocks();
		registerMentionFormat();
		registerMentionAutocompleter();
		registerEmbedPreviewMiddleware();
		return initialBlocks && initialBlocks.length > 0 ? toEditorBlocks( initialBlocks ) : [];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );
```

- [ ] **Step 7: Verify types + build**

Run: `npm run check`
Expected: no new type errors. (If `@wordpress/api-fetch` lacks bundled types in this setup, add a minimal `declare module '@wordpress/api-fetch'` to `src/types/wordpress.d.ts` exposing `use` and the callable default — mirror the existing declarations there.)

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/editor/embed-preview.ts src/lib/editor/embed-preview.test.ts src/components/SkyEditor.tsx src/types/wordpress.d.ts
git commit --no-gpg-sign -m "Editor: live atproto preview + placeholders via apiFetch middleware"
```

---

### Task 10: Decision record + full verification + smoke test

**Files:**
- Create: `docs/decisions/0023-embed-resolution-pipeline.md`

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Write the decision record**

```markdown
# 0023 — Embed resolution pipeline

- **Status:** Accepted
- **Date:** 2026-06-19
- **Scope:** `src/lib/embeds/*`, `src/lib/blocks/render.ts`, `src/lib/reader/sanitize.ts`,
  `src/lib/editor/embed-preview.ts`, the article reading page.

## Context

`core/embed` is allowlisted (Decision 0002) but resolved previews require a WordPress
oEmbed proxy SkyPress doesn't have, so embeds rendered as nothing on reading pages and
pasting an embeddable URL produced no block in the editor. We want atproto post embeds
(an improvement) and working video embeds (a fix).

## Decision

Resolve embeds in SkyPress's own pipeline:

- A dependency-free `src/lib/embeds/` module (registry → resolve → card) recognises a
  small provider set (atproto posts, YouTube, Vimeo; one entry to add more) and builds
  trusted card HTML with every PDS/provider value escaped.
- Reading pages run an async `resolveEmbeds` pre-pass (it can't live in the synchronous,
  dependency-free `render-article` pipeline) that attaches resolved DATA onto each
  `core/embed` node; `render.ts` renders the card synchronously; `sanitizeArticleHtml`
  runs last (Decision 0018). Server fetches go through `safeFetch` (rule 6a).
- Video is a **facade**: the sanitised HTML carries no iframe — only a thumbnail, title,
  and a play button with `data-embed-provider`/`data-embed-id`. Reader JS reconstructs the
  playback URL from provider + id and re-validates it against a two-host allowlist
  (`youtube-nocookie.com`, `player.vimeo.com`) before inserting the iframe. So the widened
  sanitiser (which allows `button` + the two scoped data attributes, never `iframe`)
  cannot be abused by a hostile PDS to load an arbitrary frame.
- The editor reuses the same fetch + card code through a `@wordpress/api-fetch` middleware
  over `core/embed`: live cards for atproto (CORS-friendly AppView), placeholders for
  video (oEmbed isn't browser-CORS-reachable). Pasting a URL still auto-creates the block.

## Consequences

- View links in atproto cards use `atmospherePostWebUrl` → mu.social (Decision 0022).
- SSR resolves embeds per request; v1 relies on `safeFetch` timeouts + graceful link
  fallback. Caching (Cloudflare Cache API / in-worker memo) is a fast-follow if latency
  warrants it.
- RSS renders embeds as plain links in v1 (the feed builder stays pure/test-locked);
  atproto-card-in-RSS is a documented fast-follow.
- Adding a provider = one registry entry + a resolve branch + a card branch + tests.
- The embed card intentionally diverges from `serialize()` (read-time enhancement, like
  blob-image resolution) — the fidelity test (rule 4) does not cover `core/embed`.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: all tests pass (new embed tests + the existing suite).

- [ ] **Step 3: Run the type/build checks**

Run: `npm run check && npm run build`
Expected: both succeed.

- [ ] **Step 4: Manual smoke test (reader + editor)**

- Start the dev server: `npm run dev` (serve on `http://127.0.0.1:<port>` — atproto loopback requirement, Decision 0004).
- **Reader:** open the known smoke-test article that contains the `mu.social` post link (`@jeherve.com` publications — see auto memory "SkyPress smoke-test account"). Confirm the atproto post renders as a card with author + text + a "View on the ATmosphere" link, and that a YouTube link renders as a thumbnail facade that loads the player only after a click. Use the Chrome DevTools MCP for the in-browser check (global rule).
- **Editor:** paste `https://bsky.app/profile/jeremy.herve.bzh/post/3momrv24o4wlj` on its own line → confirm it becomes an embed block showing a live card. Paste a YouTube URL → confirm the placeholder card appears.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0023-embed-resolution-pipeline.md
git commit --no-gpg-sign -m "Record decision 0023: embed resolution pipeline"
```

---

## Self-Review (completed)

- **Spec coverage:** registry (Task 1), card+escaping (Task 2), playback validation (Task 3), resolve/AppView+oEmbed (Task 4), render case (Task 5), sanitiser (Task 6), facade JS (Task 7), reader wiring+styles (Task 8), editor middleware (Task 9), decision record + RSS-scope note + verification (Task 10). All spec sections map to a task.
- **Type consistency:** `EmbedMatch`/`EmbedKind` (Task 1) → used in Tasks 4, 9. `EmbedData`/`AtprotoCardData`/`VideoCardData` (Task 2) → used in Tasks 4, 5. `FetchLike` (Task 4) → used in Task 9. Payload key `_skypressEmbed` consistent in Tasks 4 & 5. `playbackUrl`/`isTrustedPlaybackUrl` (Task 3) → used in Task 7. `data-embed-provider`/`data-embed-id` consistent across Tasks 2, 6, 7.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
```
