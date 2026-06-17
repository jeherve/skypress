# Writing-first Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a parallel `/write` experience where the writer lands directly in the editor, writes immediately with no login gate, and only meets authentication + publication selection at publish time — with images held locally and uploaded at publish.

**Architecture:** A new client-only `WriteStudio` island at `/write` wraps the existing `AuthProvider` but renders the editor for *every* auth status. Images insert as `data:` URL previews and are never uploaded during editing. The full draft (title, lede, blocks, cover) survives the OAuth full-page redirect via a draft store that keeps light metadata + token-skeletoned blocks in `localStorage` and the heavy image bytes in IndexedDB. Clicking **Publish** persists the draft, stamps a `publishIntent`, and (if signed out) redirects to OAuth; on return the flow auto-resumes, branches on publication count (one → confirm / many → pick / zero → inline create), uploads held images, then reuses the existing `publish()` to write the document + Bluesky post.

**Tech Stack:** Astro (file-router islands), React 18, `@automattic/isolated-block-editor`, `@atproto/api`, TypeScript, Vitest (jsdom; component tests via raw `react-dom/client` + `act`, **no** testing-library).

## Global Constraints

- **React 18 only** — never introduce React 19. (Decision 0001)
- **`@wordpress/*` is version-pinned via `overrides`** — do not bump `isolated-block-editor` here. (Decision 0003)
- **Reading pages must never import `@wordpress/*`.** All new editor code is browser-only and belongs in the `client:only` island or in tests. (Decision 0003)
- **Colocated tests under `src/pages/` MUST be underscore-prefixed** (e.g. `_write.meta.test.ts`) or Astro's router will execute them during prerender and 500 the build. (AGENTS.md §8)
- **Don't surprise users:** publishing also creates a public Bluesky post — every confirm step must say so. (Brief §10)
- **No remote account creation.** OAuth is sign-in only; the signed-out panel offers a *link out* to Bluesky signup, never an inline create-account flow. (Brief guardrail; design Q2)
- **OAuth is a browser public client**; the `redirect_uri` is the current pathname, so a sign-in from `/write` returns to `/write` with no new config. (Decision 0004)
- New PHP/TS files: this is a TS/Astro repo — match existing tab indentation and the `import type` style used throughout `src/`.
- License header convention: follow the surrounding files (none carry per-file license headers today — do not add any).

## File Structure

**New library modules (browser, unit-tested):**
- `src/lib/write/deferred-media.ts` — a `mediaUpload` handler that previews via `data:` URL and uploads nothing.
- `src/lib/write/held-assets.ts` — pure helpers: detect `data:` URLs, split/merge image `data:` URLs out of a block tree (+ cover) into a token→bytes map, and rebuild a `Blob` from a `data:` URL.
- `src/lib/write/asset-store.ts` — `AssetStore` interface + an IndexedDB implementation + an in-memory implementation (for SSR-absent envs and tests).
- `src/lib/write/draft-store.ts` — orchestrates `localStorage` (metadata + token-skeleton blocks + the publish-intent flag) and an injected `AssetStore` (image bytes) into one save/load/clear API.
- `src/lib/write/upload-held.ts` — at publish: upload every held `data:` image (+ cover) to the PDS and return a publish-ready block tree + cover ref.

**New components (browser island):**
- `src/components/SignInPanel.tsx` — signed-out handle entry; one variant carries publish intent, one doesn't; includes the "Need an account? →" link out.
- `src/components/AccountPill.tsx` — signed-in avatar/handle pill with a small menu (Manage publications, Profile, Sign out).
- `src/components/WritePublishFlow.tsx` — the publish stepper (branch → confirm/pick/create → upload → publish).
- `src/components/WriteStudio.tsx` — the island: editor for all auth states, persistence, redirect, resume.

**New route + styles:**
- `src/pages/write.astro` — mounts `WriteStudio` (`client:only`).
- `src/pages/_write.meta.test.ts` — route metadata test (underscore-prefixed).
- `src/styles/write-chrome.css` — corner pill / sign-in panel / publish-flow styling.

**New decision doc:**
- `docs/decisions/0020-writing-first-deferred-publish.md`

**Untouched:** `src/pages/index.astro`, `src/pages/editor.astro`, `src/components/Studio.tsx`, `src/components/PublishPanel.tsx`, `src/components/Dashboard.tsx`, `src/lib/media/mediaUpload.ts`, `src/components/SkyEditor.tsx`.

**Reused unchanged (imported):** `AuthProvider`, `useAuth`, `oauth.ts`, `SkyEditor`, `PublicationForm`, `publisher.ts` (`publish`, `Identity`), `publications.ts` (`listPublications`, `Publication`), `records.ts` (`normalizeBlocks`), `blob.ts` (`attachBlobRefs`, `buildGetBlobUrl`, `BlobRefJson`, `BlobUpload`), `profile.ts` (`authorPath`, `displayNameFor`), `PublishPanel.tsx`'s exported `computePostPreview`, `AppBar`, `PublishedPill`, `CoverImagePicker`.

---

### Task 1: Deferred media handler

A Gutenberg `mediaUpload` handler that, unlike the eager one, never touches the PDS: it reads each file into a `data:` URL and hands it back for inline preview. The actual upload is deferred to publish.

**Files:**
- Create: `src/lib/write/deferred-media.ts`
- Test: `src/lib/write/deferred-media.test.ts`

**Interfaces:**
- Consumes: `MediaUploadHandler`, `MediaUploadArgs` shape from `src/lib/media/mediaUpload.ts` (the handler is `(args) => Promise<void>` where `args` has `filesList`, `onFileChange`, `onError?`, `maxUploadFileSize?`).
- Produces: `export function createDeferredMediaUpload(): MediaUploadHandler`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/write/deferred-media.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createDeferredMediaUpload } from './deferred-media';

describe( 'createDeferredMediaUpload', () => {
	it( 'previews each file as a data: URL and uploads nothing', async () => {
		const handler = createDeferredMediaUpload();
		const file = new File( [ 'x' ], 'cat.png', { type: 'image/png' } );
		const onFileChange = vi.fn();

		await handler( { filesList: [ file ], onFileChange } );

		expect( onFileChange ).toHaveBeenCalledTimes( 1 );
		const [ media ] = onFileChange.mock.calls[ 0 ][ 0 ];
		expect( media.url.startsWith( 'data:image/png;base64,' ) ).toBe( true );
		expect( media.url.startsWith( 'blob:' ) ).toBe( false );
		expect( 'id' in media ).toBe( false );
	} );

	it( 'rejects oversize files via onError without previewing them', async () => {
		const handler = createDeferredMediaUpload();
		const big = new File( [ 'x' ], 'big.png', { type: 'image/png' } );
		Object.defineProperty( big, 'size', { value: 5_000_000 } );
		const onFileChange = vi.fn();
		const onError = vi.fn();

		await handler( {
			filesList: [ big ],
			onFileChange,
			onError,
			maxUploadFileSize: 1_000_000,
		} );

		expect( onFileChange ).not.toHaveBeenCalled();
		expect( onError ).toHaveBeenCalledTimes( 1 );
		expect( onError.mock.calls[ 0 ][ 0 ] ).toBeInstanceOf( Error );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/write/deferred-media.test.ts`
Expected: FAIL — cannot resolve `./deferred-media`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/write/deferred-media.ts
import type { MediaUploadHandler } from '../media/mediaUpload';

/** Read a file into a `data:` URL (base64) for inline preview. */
function readAsDataUrl( file: File ): Promise< string > {
	return new Promise( ( resolve, reject ) => {
		const reader = new FileReader();
		reader.onload = () => resolve( reader.result as string );
		reader.onerror = () =>
			reject( reader.error ?? new Error( `Could not read "${ file.name }".` ) );
		reader.readAsDataURL( file );
	} );
}

/**
 * A Gutenberg `mediaUpload` handler for the writing-first flow (design 2026-06-17): it
 * previews each file from a `data:` URL and uploads NOTHING to a PDS. The real upload is
 * deferred to publish (see `upload-held.ts`), so the editor works while signed out.
 *
 * Like the eager handler it must preview from a `data:` URL, never a `blob:` URL — the Image
 * block treats a `blob:` URL as still-uploading and re-runs its upload hook forever.
 */
export function createDeferredMediaUpload(): MediaUploadHandler {
	return async function deferredMediaUpload( {
		filesList,
		onFileChange,
		onError,
		maxUploadFileSize,
	} ): Promise< void > {
		for ( const file of Array.from( filesList ) ) {
			try {
				if ( maxUploadFileSize && file.size > maxUploadFileSize ) {
					const mb = Math.round( maxUploadFileSize / 1024 / 1024 );
					throw new Error( `"${ file.name }" exceeds the ${ mb }MB limit.` );
				}
				const previewUrl = await readAsDataUrl( file );
				// No `id`: PDS blobs aren't WP attachments (mirrors the eager handler).
				onFileChange( [ { url: previewUrl, alt: '' } ] );
			} catch ( error ) {
				onError?.( error instanceof Error ? error : new Error( String( error ) ) );
			}
		}
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/write/deferred-media.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/write/deferred-media.ts src/lib/write/deferred-media.test.ts
git commit --no-gpg-sign -m "Add deferred media handler for writing-first editor"
```

---

### Task 2: Held-asset split/merge + data-URL helpers (pure)

Pure logic to: recognise `data:` URLs, rebuild a `Blob` from one, and split image `data:` URLs (in `core/image` blocks at any depth, plus the cover) out of a tree into a small token-skeleton + a `token → dataUrl` map (and merge them back). This is what lets large image bytes live in IndexedDB while the block skeleton stays small in `localStorage`.

**Files:**
- Create: `src/lib/write/held-assets.ts`
- Test: `src/lib/write/held-assets.test.ts`

**Interfaces:**
- Consumes: `BlockNode` from `src/lib/blocks/render.ts` (`{ name: string; attributes?: Record<string, unknown>; innerBlocks?: BlockNode[] }`).
- Produces:
  - `export function isDataUrl( value: unknown ): value is string`
  - `export function dataUrlToBlob( dataUrl: string ): Blob`
  - `export interface AssetSkeleton { blocks: BlockNode[]; cover: string | null }`
  - `export function splitAssets( blocks: BlockNode[], coverDataUrl: string | null ): { skeleton: AssetSkeleton; assets: Record< string, string > }`
  - `export function mergeAssets( skeleton: AssetSkeleton, assets: Record< string, string > ): { blocks: BlockNode[]; coverDataUrl: string | null }`
  - Token format: body images `a0`, `a1`, … (allocation order is depth-first); cover token is the literal `cover`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/write/held-assets.test.ts
import { describe, it, expect } from 'vitest';
import {
	isDataUrl,
	dataUrlToBlob,
	splitAssets,
	mergeAssets,
} from './held-assets';
import type { BlockNode } from '../blocks/render';

const DATA_A = 'data:image/png;base64,QUFB'; // "AAA"
const DATA_B = 'data:image/jpeg;base64,QkJC'; // "BBB"

function tree(): BlockNode[] {
	return [
		{ name: 'core/paragraph', attributes: { content: 'hi' }, innerBlocks: [] },
		{ name: 'core/image', attributes: { url: DATA_A }, innerBlocks: [] },
		{
			name: 'core/columns',
			attributes: {},
			innerBlocks: [
				{ name: 'core/image', attributes: { url: DATA_B }, innerBlocks: [] },
				{ name: 'core/image', attributes: { url: 'https://ext/img.png' }, innerBlocks: [] },
			],
		},
	];
}

describe( 'isDataUrl', () => {
	it( 'matches data: URLs only', () => {
		expect( isDataUrl( DATA_A ) ).toBe( true );
		expect( isDataUrl( 'https://x/y.png' ) ).toBe( true === false ); // not a data URL
		expect( isDataUrl( undefined ) ).toBe( false );
	} );
} );

describe( 'dataUrlToBlob', () => {
	it( 'reconstructs bytes + mime from a data: URL', async () => {
		const blob = dataUrlToBlob( DATA_A );
		expect( blob.type ).toBe( 'image/png' );
		expect( await blob.text() ).toBe( 'AAA' );
	} );
} );

describe( 'splitAssets / mergeAssets', () => {
	it( 'extracts every data: image URL (depth-first) + cover into tokens and round-trips', () => {
		const { skeleton, assets } = splitAssets( tree(), DATA_A );

		// Body data URLs replaced by tokens; external + non-image untouched.
		expect( skeleton.blocks[ 1 ].attributes!.url ).toBe( 'a0' );
		expect( skeleton.blocks[ 2 ].innerBlocks![ 0 ].attributes!.url ).toBe( 'a1' );
		expect( skeleton.blocks[ 2 ].innerBlocks![ 1 ].attributes!.url ).toBe( 'https://ext/img.png' );
		expect( skeleton.cover ).toBe( 'cover' );
		expect( assets ).toEqual( { a0: DATA_A, a1: DATA_B, cover: DATA_A } );

		const merged = mergeAssets( skeleton, assets );
		expect( merged.blocks ).toEqual( tree() );
		expect( merged.coverDataUrl ).toBe( DATA_A );
	} );

	it( 'leaves a null cover null and a tree with no data URLs unchanged', () => {
		const plain: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'https://ext/x.png' }, innerBlocks: [] },
		];
		const { skeleton, assets } = splitAssets( plain, null );
		expect( assets ).toEqual( {} );
		expect( skeleton.cover ).toBe( null );
		expect( mergeAssets( skeleton, assets ) ).toEqual( { blocks: plain, coverDataUrl: null } );
	} );
} );
```

> Note: the `isDataUrl( 'https://x/y.png' )` assertion above is written `toBe( true === false )` (i.e. `false`) deliberately so the test reads as "an https URL is NOT a data URL". If you prefer, replace with `.toBe( false )`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/write/held-assets.test.ts`
Expected: FAIL — cannot resolve `./held-assets`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/write/held-assets.ts
import type { BlockNode } from '../blocks/render';

/** Block names whose `url` attribute may hold a held (data:) image. Mirrors blob.ts. */
const IMAGE_BLOCKS = new Set( [ 'core/image' ] );

/** True when `value` is a `data:` URL string. */
export function isDataUrl( value: unknown ): value is string {
	return typeof value === 'string' && value.startsWith( 'data:' );
}

/** Rebuild a `Blob` (bytes + mime type) from a base64 `data:` URL. */
export function dataUrlToBlob( dataUrl: string ): Blob {
	const comma = dataUrl.indexOf( ',' );
	const header = dataUrl.slice( 5, comma ); // after "data:"
	const mimeType = header.split( ';' )[ 0 ] || 'application/octet-stream';
	const base64 = dataUrl.slice( comma + 1 );
	const binary = atob( base64 );
	const bytes = new Uint8Array( binary.length );
	for ( let i = 0; i < binary.length; i++ ) {
		bytes[ i ] = binary.charCodeAt( i );
	}
	return new Blob( [ bytes ], { type: mimeType } );
}

export interface AssetSkeleton {
	blocks: BlockNode[];
	/** `'cover'` when a held cover exists, else `null`. */
	cover: string | null;
}

/**
 * Replace every held (`data:`) image URL in the tree — and the cover — with a short token,
 * returning the lightweight skeleton plus a `token → dataUrl` map. Body tokens are `a0`,
 * `a1`, … allocated depth-first; the cover token is the literal `'cover'`. External image
 * URLs and non-image blocks are left untouched. Pure; returns new objects.
 */
export function splitAssets(
	blocks: BlockNode[],
	coverDataUrl: string | null
): { skeleton: AssetSkeleton; assets: Record< string, string > } {
	const assets: Record< string, string > = {};
	let n = 0;

	const walk = ( nodes: BlockNode[] ): BlockNode[] =>
		nodes.map( ( node ) => {
			const url = node.attributes?.url;
			const held = IMAGE_BLOCKS.has( node.name ) && isDataUrl( url );
			let attributes = node.attributes ? { ...node.attributes } : {};
			if ( held ) {
				const token = `a${ n++ }`;
				assets[ token ] = url as string;
				attributes = { ...attributes, url: token };
			}
			return {
				name: node.name,
				attributes,
				innerBlocks: walk( node.innerBlocks ?? [] ),
			};
		} );

	const skeletonBlocks = walk( blocks );
	let cover: string | null = null;
	if ( isDataUrl( coverDataUrl ) ) {
		assets.cover = coverDataUrl;
		cover = 'cover';
	}
	return { skeleton: { blocks: skeletonBlocks, cover }, assets };
}

/** Inverse of `splitAssets`: swap each token back to its `data:` URL. Pure. */
export function mergeAssets(
	skeleton: AssetSkeleton,
	assets: Record< string, string >
): { blocks: BlockNode[]; coverDataUrl: string | null } {
	const walk = ( nodes: BlockNode[] ): BlockNode[] =>
		nodes.map( ( node ) => {
			const url = node.attributes?.url;
			const restore =
				IMAGE_BLOCKS.has( node.name ) && typeof url === 'string' && url in assets;
			return {
				name: node.name,
				attributes: restore
					? { ...node.attributes, url: assets[ url as string ] }
					: { ...( node.attributes ?? {} ) },
				innerBlocks: walk( node.innerBlocks ?? [] ),
			};
		} );

	return {
		blocks: walk( skeleton.blocks ),
		coverDataUrl: skeleton.cover ? assets[ skeleton.cover ] ?? null : null,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/write/held-assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/write/held-assets.ts src/lib/write/held-assets.test.ts
git commit --no-gpg-sign -m "Add pure held-asset split/merge + data-URL helpers"
```

---

### Task 3: Asset store (IndexedDB + in-memory)

A tiny key→value store for held image bytes. The interface is what `draft-store` depends on; the in-memory implementation is what tests inject (jsdom has no IndexedDB) and the SSR/quota-failure fallback.

**Files:**
- Create: `src/lib/write/asset-store.ts`
- Test: `src/lib/write/asset-store.test.ts`

**Interfaces:**
- Produces:
  - `export interface AssetStore { put( assets: Record< string, string > ): Promise< void >; getAll(): Promise< Record< string, string > >; clear(): Promise< void >; }`
  - `export function createMemoryAssetStore(): AssetStore`
  - `export function createIndexedDbAssetStore( dbName?: string, storeName?: string ): AssetStore`

- [ ] **Step 1: Write the failing test** (covers the in-memory store; the IndexedDB impl is exercised via `draft-store` integration + manual smoke)

```ts
// src/lib/write/asset-store.test.ts
import { describe, it, expect } from 'vitest';
import { createMemoryAssetStore } from './asset-store';

describe( 'createMemoryAssetStore', () => {
	it( 'puts, merges, reads all, and clears', async () => {
		const store = createMemoryAssetStore();
		await store.put( { a0: 'data:1' } );
		await store.put( { a1: 'data:2' } );
		expect( await store.getAll() ).toEqual( { a0: 'data:1', a1: 'data:2' } );
		await store.clear();
		expect( await store.getAll() ).toEqual( {} );
	} );

	it( 'replaces a key on re-put', async () => {
		const store = createMemoryAssetStore();
		await store.put( { a0: 'data:1' } );
		await store.put( { a0: 'data:CHANGED' } );
		expect( await store.getAll() ).toEqual( { a0: 'data:CHANGED' } );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/write/asset-store.test.ts`
Expected: FAIL — cannot resolve `./asset-store`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/write/asset-store.ts

/**
 * A small async key→value store for held image bytes (data: URLs) in the writing-first flow.
 * Held bytes can be large, so they live here (IndexedDB) rather than in localStorage with the
 * draft metadata. `put` MERGES (does not replace the whole store) so adding an image keeps the
 * earlier ones; `clear` empties everything (called after a successful publish or a discard).
 */
export interface AssetStore {
	put( assets: Record< string, string > ): Promise< void >;
	getAll(): Promise< Record< string, string > >;
	clear(): Promise< void >;
}

/** In-memory store: the test/SSR/quota-failure fallback. Survives nothing past a reload. */
export function createMemoryAssetStore(): AssetStore {
	let map: Record< string, string > = {};
	return {
		async put( assets ) {
			map = { ...map, ...assets };
		},
		async getAll() {
			return { ...map };
		},
		async clear() {
			map = {};
		},
	};
}

const DEFAULT_DB = 'skypress-write';
const DEFAULT_STORE = 'assets';

function openDb( dbName: string, storeName: string ): Promise< IDBDatabase > {
	return new Promise( ( resolve, reject ) => {
		const req = indexedDB.open( dbName, 1 );
		req.onupgradeneeded = () => {
			if ( ! req.result.objectStoreNames.contains( storeName ) ) {
				req.result.createObjectStore( storeName );
			}
		};
		req.onsuccess = () => resolve( req.result );
		req.onerror = () => reject( req.error ?? new Error( 'IndexedDB open failed' ) );
	} );
}

/**
 * IndexedDB-backed asset store. Each token is one record keyed by the token string. Falls back
 * to an in-memory store when IndexedDB is unavailable (e.g. SSR/tests) so callers never crash.
 */
export function createIndexedDbAssetStore(
	dbName: string = DEFAULT_DB,
	storeName: string = DEFAULT_STORE
): AssetStore {
	if ( typeof indexedDB === 'undefined' ) {
		return createMemoryAssetStore();
	}

	const tx = async < T >(
		mode: IDBTransactionMode,
		run: ( store: IDBObjectStore ) => IDBRequest | void,
		read?: ( store: IDBObjectStore ) => IDBRequest< T >
	): Promise< T | void > => {
		const db = await openDb( dbName, storeName );
		return new Promise< T | void >( ( resolve, reject ) => {
			const transaction = db.transaction( storeName, mode );
			const store = transaction.objectStore( storeName );
			let readReq: IDBRequest< T > | undefined;
			if ( read ) {
				readReq = read( store );
			} else {
				run( store );
			}
			transaction.oncomplete = () => {
				db.close();
				resolve( readReq ? readReq.result : undefined );
			};
			transaction.onerror = () => {
				db.close();
				reject( transaction.error ?? new Error( 'IndexedDB transaction failed' ) );
			};
		} );
	};

	return {
		async put( assets ) {
			await tx( 'readwrite', ( store ) => {
				for ( const [ key, value ] of Object.entries( assets ) ) {
					store.put( value, key );
				}
			} );
		},
		async getAll() {
			const db = await openDb( dbName, storeName );
			return new Promise< Record< string, string > >( ( resolve, reject ) => {
				const transaction = db.transaction( storeName, 'readonly' );
				const store = transaction.objectStore( storeName );
				const keysReq = store.getAllKeys();
				const valsReq = store.getAll();
				transaction.oncomplete = () => {
					db.close();
					const out: Record< string, string > = {};
					( keysReq.result as IDBValidKey[] ).forEach( ( k, i ) => {
						out[ String( k ) ] = valsReq.result[ i ] as string;
					} );
					resolve( out );
				};
				transaction.onerror = () => {
					db.close();
					reject( transaction.error ?? new Error( 'IndexedDB read failed' ) );
				};
			} );
		},
		async clear() {
			await tx( 'readwrite', ( store ) => store.clear() );
		},
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/write/asset-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/write/asset-store.ts src/lib/write/asset-store.test.ts
git commit --no-gpg-sign -m "Add asset store (IndexedDB + in-memory) for held image bytes"
```

---

### Task 4: Draft store

Combine `localStorage` (title, lede, token-skeleton blocks, cover token, `publishIntent`) and an injected `AssetStore` (image bytes) into one save/load/clear API. This is what survives the OAuth redirect.

**Files:**
- Create: `src/lib/write/draft-store.ts`
- Test: `src/lib/write/draft-store.test.ts`

**Interfaces:**
- Consumes: `splitAssets`, `mergeAssets`, `AssetSkeleton` from `./held-assets`; `AssetStore`, `createMemoryAssetStore`, `createIndexedDbAssetStore` from `./asset-store`; `BlockNode`.
- Produces:
  - `export interface WriteDraft { title: string; lede: string; blocks: BlockNode[]; coverDataUrl: string | null }`
  - `export interface DraftStore { save( draft: WriteDraft ): Promise< void >; load(): Promise< WriteDraft | null >; clear(): Promise< void >; setPublishIntent(): void; consumePublishIntent(): boolean }`
  - `export function createDraftStore( opts?: { assets?: AssetStore; storage?: Storage } ): DraftStore`
- localStorage keys: meta → `skypress:write:draft`; intent → `skypress:write:publish-intent`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/write/draft-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDraftStore, type WriteDraft } from './draft-store';
import { createMemoryAssetStore } from './asset-store';
import type { BlockNode } from '../blocks/render';

const DATA = 'data:image/png;base64,QUFB';

function draft(): WriteDraft {
	return {
		title: 'Hello',
		lede: 'A lede',
		blocks: [
			{ name: 'core/paragraph', attributes: { content: 'hi' }, innerBlocks: [] },
			{ name: 'core/image', attributes: { url: DATA }, innerBlocks: [] },
		] as BlockNode[],
		coverDataUrl: DATA,
	};
}

beforeEach( () => window.localStorage.clear() );

function newStore() {
	return createDraftStore( { assets: createMemoryAssetStore(), storage: window.localStorage } );
}

describe( 'draft-store', () => {
	it( 'round-trips a draft including held image + cover bytes', async () => {
		const store = newStore();
		await store.save( draft() );
		// Image bytes must NOT sit in localStorage (only the token skeleton).
		expect( window.localStorage.getItem( 'skypress:write:draft' ) ).not.toContain( 'base64' );
		const loaded = await store.load();
		expect( loaded ).toEqual( draft() );
	} );

	it( 'returns null when nothing is saved', async () => {
		expect( await newStore().load() ).toBe( null );
	} );

	it( 'clear() removes the draft and its assets', async () => {
		const store = newStore();
		await store.save( draft() );
		await store.clear();
		expect( await store.load() ).toBe( null );
	} );

	it( 'publish intent is one-shot (set, then consumed once)', () => {
		const store = newStore();
		expect( store.consumePublishIntent() ).toBe( false );
		store.setPublishIntent();
		expect( store.consumePublishIntent() ).toBe( true );
		expect( store.consumePublishIntent() ).toBe( false );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/write/draft-store.test.ts`
Expected: FAIL — cannot resolve `./draft-store`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/write/draft-store.ts
import type { BlockNode } from '../blocks/render';
import { splitAssets, mergeAssets, type AssetSkeleton } from './held-assets';
import {
	createIndexedDbAssetStore,
	createMemoryAssetStore,
	type AssetStore,
} from './asset-store';

const DRAFT_KEY = 'skypress:write:draft';
const INTENT_KEY = 'skypress:write:publish-intent';

/** The editor content the writing-first flow persists across the OAuth redirect. */
export interface WriteDraft {
	title: string;
	lede: string;
	blocks: BlockNode[];
	coverDataUrl: string | null;
}

interface StoredMeta {
	title: string;
	lede: string;
	skeleton: AssetSkeleton;
}

export interface DraftStore {
	save( draft: WriteDraft ): Promise< void >;
	load(): Promise< WriteDraft | null >;
	clear(): Promise< void >;
	setPublishIntent(): void;
	/** Reads the intent flag and clears it — true at most once per set. */
	consumePublishIntent(): boolean;
}

/**
 * Persist the writing-first draft so it survives the full-page OAuth redirect. Light metadata
 * and the token-skeletoned block tree go in `localStorage`; the heavy image bytes (data: URLs)
 * go in the injected `AssetStore` (IndexedDB in the browser). `setPublishIntent` records that
 * the writer hit Publish before the redirect, so the flow auto-resumes on return.
 */
export function createDraftStore( opts: { assets?: AssetStore; storage?: Storage } = {} ): DraftStore {
	const storage = opts.storage ?? window.localStorage;
	const assets = opts.assets ?? createIndexedDbAssetStore();

	return {
		async save( draft ) {
			const { skeleton, assets: bytes } = splitAssets( draft.blocks, draft.coverDataUrl );
			await assets.clear();
			await assets.put( bytes );
			const meta: StoredMeta = { title: draft.title, lede: draft.lede, skeleton };
			storage.setItem( DRAFT_KEY, JSON.stringify( meta ) );
		},
		async load() {
			const raw = storage.getItem( DRAFT_KEY );
			if ( ! raw ) {
				return null;
			}
			let meta: StoredMeta;
			try {
				meta = JSON.parse( raw ) as StoredMeta;
			} catch {
				return null;
			}
			const bytes = await assets.getAll();
			const { blocks, coverDataUrl } = mergeAssets( meta.skeleton, bytes );
			return { title: meta.title, lede: meta.lede, blocks, coverDataUrl };
		},
		async clear() {
			storage.removeItem( DRAFT_KEY );
			await assets.clear();
		},
		setPublishIntent() {
			storage.setItem( INTENT_KEY, '1' );
		},
		consumePublishIntent() {
			const had = storage.getItem( INTENT_KEY ) === '1';
			storage.removeItem( INTENT_KEY );
			return had;
		},
	};
}

export { createMemoryAssetStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/write/draft-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/write/draft-store.ts src/lib/write/draft-store.test.ts
git commit --no-gpg-sign -m "Add draft store that survives the OAuth redirect"
```

---

### Task 5: Upload held assets at publish

After sign-in, turn the held `data:` images (+ cover) into committed PDS blobs and a publish-ready block tree. Reuses `attachBlobRefs` so the persisted block shape matches the eager path exactly.

**Files:**
- Create: `src/lib/write/upload-held.ts`
- Test: `src/lib/write/upload-held.test.ts`

**Interfaces:**
- Consumes: `isDataUrl`, `dataUrlToBlob` from `./held-assets`; `attachBlobRefs`, `buildGetBlobUrl`, `BlobRefJson`, `BlobUpload` from `../media/blob`; `BlockNode`; `Agent` from `@atproto/api`.
- Produces:
  - `export interface PreparedPublishContent { blocks: BlockNode[]; coverImage?: BlobRefJson }`
  - `export async function uploadHeldAssets( agent: Agent, input: { blocks: BlockNode[]; coverDataUrl: string | null; did: string; pdsUrl: string } ): Promise< PreparedPublishContent >`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/write/upload-held.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import { uploadHeldAssets } from './upload-held';
import type { BlockNode } from '../blocks/render';

const DATA = 'data:image/png;base64,QUFB'; // "AAA"

function fakeAgent() {
	const uploadBlob = vi.fn( async ( _file: Blob ) => ( {
		data: { blob: { ref: { toString: () => 'bafyCID' }, mimeType: 'image/png', size: 3 } },
	} ) );
	return { agent: { uploadBlob } as unknown as Agent, uploadBlob };
}

describe( 'uploadHeldAssets', () => {
	it( 'uploads each held image, attaches skypressBlob + a getBlob url, leaves externals alone', async () => {
		const { agent, uploadBlob } = fakeAgent();
		const blocks: BlockNode[] = [
			{ name: 'core/image', attributes: { url: DATA }, innerBlocks: [] },
			{ name: 'core/image', attributes: { url: 'https://ext/x.png' }, innerBlocks: [] },
		];

		const out = await uploadHeldAssets( agent, {
			blocks,
			coverDataUrl: null,
			did: 'did:plc:me',
			pdsUrl: 'https://pds.example.com',
		} );

		expect( uploadBlob ).toHaveBeenCalledTimes( 1 );
		expect( out.blocks[ 0 ].attributes!.skypressBlob ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafyCID' },
			mimeType: 'image/png',
			size: 3,
		} );
		expect( out.blocks[ 0 ].attributes!.url ).toBe(
			'https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Ame&cid=bafyCID'
		);
		expect( out.blocks[ 1 ].attributes!.url ).toBe( 'https://ext/x.png' );
		expect( out.coverImage ).toBeUndefined();
	} );

	it( 'uploads a held cover into a BlobRefJson', async () => {
		const { agent } = fakeAgent();
		const out = await uploadHeldAssets( agent, {
			blocks: [],
			coverDataUrl: DATA,
			did: 'did:plc:me',
			pdsUrl: 'https://pds.example.com',
		} );
		expect( out.coverImage ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafyCID' },
			mimeType: 'image/png',
			size: 3,
		} );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/write/upload-held.test.ts`
Expected: FAIL — cannot resolve `./upload-held`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/write/upload-held.ts
import type { Agent } from '@atproto/api';
import type { BlockNode } from '../blocks/render';
import {
	attachBlobRefs,
	buildGetBlobUrl,
	type BlobRefJson,
	type BlobUpload,
} from '../media/blob';
import { isDataUrl, dataUrlToBlob } from './held-assets';

export interface PreparedPublishContent {
	blocks: BlockNode[];
	coverImage?: BlobRefJson;
}

/** Upload one held `data:` URL to the PDS and return its portable blob ref + getBlob URL. */
async function uploadOne(
	agent: Agent,
	dataUrl: string,
	did: string,
	pdsUrl: string
): Promise< BlobUpload > {
	const blob = dataUrlToBlob( dataUrl );
	const res = await agent.uploadBlob( blob, { encoding: blob.type } );
	const out = res.data.blob;
	const cid = out.ref.toString();
	return {
		ref: { $type: 'blob', ref: { $link: cid }, mimeType: out.mimeType, size: out.size },
		url: buildGetBlobUrl( pdsUrl, did, cid ),
	};
}

/**
 * Publish-time bridge for the writing-first flow: walk the block tree, upload every held
 * (`data:`) image to the writer's PDS, and rewrite those blocks via `attachBlobRefs` so they
 * carry `skypressBlob` + a portable getBlob URL (byte-identical to the eager path). External
 * image URLs are left untouched. A held cover is uploaded into a `BlobRefJson` for the document
 * record. Each distinct data URL uploads once.
 */
export async function uploadHeldAssets(
	agent: Agent,
	input: { blocks: BlockNode[]; coverDataUrl: string | null; did: string; pdsUrl: string }
): Promise< PreparedPublishContent > {
	const { blocks, coverDataUrl, did, pdsUrl } = input;

	// Collect every distinct held image URL in the tree (depth-first), upload once each.
	const registry = new Map< string, BlobUpload >();
	const collect = ( nodes: BlockNode[] ): string[] =>
		nodes.flatMap( ( node ) => {
			const url = node.attributes?.url;
			const here = node.name === 'core/image' && isDataUrl( url ) ? [ url as string ] : [];
			return [ ...here, ...collect( node.innerBlocks ?? [] ) ];
		} );

	for ( const url of new Set( collect( blocks ) ) ) {
		registry.set( url, await uploadOne( agent, url, did, pdsUrl ) );
	}

	const prepared = attachBlobRefs( blocks, ( url ) => registry.get( url ) );

	let coverImage: BlobRefJson | undefined;
	if ( isDataUrl( coverDataUrl ) ) {
		coverImage = ( await uploadOne( agent, coverDataUrl, did, pdsUrl ) ).ref;
	}

	return { blocks: prepared, coverImage };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/write/upload-held.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/write/upload-held.ts src/lib/write/upload-held.test.ts
git commit --no-gpg-sign -m "Upload held images + cover to the PDS at publish time"
```

---

### Task 6: WritePublishFlow component

The publish stepper. Given a signed-in agent and the writer's publications, it branches: zero → inline `PublicationForm`; one → confirm; many → pick then confirm. The confirm step discloses the public Bluesky post (and notified mentions) and enforces the 300-grapheme limit. On confirm it uploads held assets then calls `publish()`.

**Files:**
- Create: `src/components/WritePublishFlow.tsx`
- Test: `src/components/WritePublishFlow.test.tsx`

**Interfaces:**
- Consumes: `uploadHeldAssets` from `../lib/write/upload-held`; `publish`, `Identity` from `../lib/publish/publisher`; `Publication` from `../lib/publish/publications`; `computePostPreview` from `./PublishPanel`; `PublicationForm` from `./PublicationForm`; `BlockNode`; `Agent`.
- Produces:
  - `interface Props { agent: Agent; identity: Identity; pdsUrl: string; blocks: BlockNode[]; coverDataUrl: string | null; title: string; description: string; publications: Publication[] | null; onReloadPublications: () => void; onPublished: ( result: { articleUrl: string } ) => void; onCancel: () => void; }`
  - `export default function WritePublishFlow( props: Props )`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/WritePublishFlow.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Agent } from '@atproto/api';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

const { publish, uploadHeldAssets } = vi.hoisted( () => ( {
	publish: vi.fn( async () => ( { articleUrl: 'https://x/a' } ) ),
	uploadHeldAssets: vi.fn( async () => ( { blocks: [], coverImage: undefined } ) ),
} ) );
vi.mock( '../lib/publish/publisher', () => ( { publish } ) );
vi.mock( '../lib/write/upload-held', () => ( { uploadHeldAssets } ) );

import WritePublishFlow from './WritePublishFlow';
import type { BlockNode } from '../lib/blocks/render';

const PUB = ( uri: string, name: string ) => ( {
	uri, cid: 'cid', rkey: uri.split( '/' ).pop()!, slug: name, name,
} );
const BLOCKS: BlockNode[] = [ { name: 'core/paragraph', attributes: { content: 'Body' }, innerBlocks: [] } ];

function mount( publications: unknown ) {
	const onPublished = vi.fn();
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	act( () => {
		root.render(
			createElement( WritePublishFlow, {
				agent: {} as Agent,
				identity: { did: 'did:plc:me', handle: 'me.test' },
				pdsUrl: 'https://pds',
				blocks: BLOCKS,
				coverDataUrl: null,
				title: 'Title',
				description: 'Lede',
				publications,
				onReloadPublications: vi.fn(),
				onPublished,
				onCancel: vi.fn(),
			} as never )
		);
	} );
	return { container, root, onPublished };
}

beforeEach( () => {
	publish.mockClear();
	uploadHeldAssets.mockClear();
} );

describe( 'WritePublishFlow', () => {
	it( 'single publication: shows a confirm naming it, never auto-publishes', () => {
		const { container } = mount( [ PUB( 'at://me/site.standard.publication/p1', 'Solo' ) ] );
		expect( container.textContent ).toContain( 'Solo' );
		expect( container.textContent?.toLowerCase() ).toContain( 'bluesky' );
		expect( publish ).not.toHaveBeenCalled();
	} );

	it( 'confirming uploads held assets then publishes', async () => {
		const { container, onPublished } = mount( [ PUB( 'at://me/site.standard.publication/p1', 'Solo' ) ] );
		const confirm = [ ...container.querySelectorAll( 'button' ) ].find( ( b ) =>
			/post to bluesky/i.test( b.textContent ?? '' )
		)!;
		await act( async () => confirm.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) ) );
		expect( uploadHeldAssets ).toHaveBeenCalledTimes( 1 );
		expect( publish ).toHaveBeenCalledTimes( 1 );
		expect( onPublished ).toHaveBeenCalledWith( { articleUrl: 'https://x/a' } );
	} );

	it( 'zero publications: renders the inline create-publication form', () => {
		const { container } = mount( [] );
		expect( container.textContent ).toContain( 'New publication' );
	} );

	it( 'many publications: renders a picker listing each', () => {
		const { container } = mount( [
			PUB( 'at://me/site.standard.publication/p1', 'One' ),
			PUB( 'at://me/site.standard.publication/p2', 'Two' ),
		] );
		expect( container.querySelector( 'select' ) ).not.toBe( null );
		expect( container.textContent ).toContain( 'One' );
		expect( container.textContent ).toContain( 'Two' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/WritePublishFlow.test.tsx`
Expected: FAIL — cannot resolve `./WritePublishFlow`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/WritePublishFlow.tsx
import { useMemo, useState } from 'react';
import type { Agent } from '@atproto/api';
import { publish, type Identity } from '../lib/publish/publisher';
import type { Publication } from '../lib/publish/publications';
import { computePostPreview } from './PublishPanel';
import PublicationForm from './PublicationForm';
import { uploadHeldAssets } from '../lib/write/upload-held';
import type { BlockNode } from '../lib/blocks/render';

interface Props {
	agent: Agent;
	identity: Identity;
	pdsUrl: string;
	blocks: BlockNode[];
	coverDataUrl: string | null;
	title: string;
	description: string;
	/** `null` while still loading; `[]` when the writer has none yet. */
	publications: Publication[] | null;
	/** Ask the parent to re-list publications (after an inline create). */
	onReloadPublications: () => void;
	onPublished: ( result: { articleUrl: string } ) => void;
	onCancel: () => void;
}

type Phase = 'pick' | 'working' | 'error';

/**
 * The writing-first publish stepper (design 2026-06-17). Branches on how many publications the
 * writer owns: zero → inline create; one → confirm; many → pick then confirm. The confirm step
 * always discloses the public Bluesky post (brief §10) and blocks an over-limit post. On confirm
 * it uploads the held images/cover, then reuses `publish()` (document + Bluesky post).
 */
export default function WritePublishFlow( {
	agent,
	identity,
	pdsUrl,
	blocks,
	coverDataUrl,
	title,
	description,
	publications,
	onReloadPublications,
	onPublished,
	onCancel,
}: Props ) {
	const pubs = publications ?? [];
	const [ targetUri, setTargetUri ] = useState( () => pubs[ 0 ]?.uri ?? '' );
	const [ phase, setPhase ] = useState< Phase >( 'pick' );
	const [ error, setError ] = useState< string | null >( null );

	const target = pubs.find( ( p ) => p.uri === targetUri ) ?? pubs[ 0 ];

	const preview = useMemo(
		() =>
			target
				? computePostPreview( {
						title,
						lede: description,
						blocks,
						handle: identity.handle ?? identity.did,
						slug: target.slug,
				  } )
				: null,
		[ target, title, description, blocks, identity ]
	);

	if ( publications === null ) {
		return (
			<section className="writeflow" aria-label="Publish">
				<p className="writeflow__status">Loading your publications…</p>
			</section>
		);
	}

	// Zero publications → inline "create your first publication".
	if ( pubs.length === 0 ) {
		return (
			<section className="writeflow" aria-label="Create your first publication">
				<p className="writeflow__lede">
					You don't have a publication yet — create one to publish into.
				</p>
				<PublicationForm
					agent={ agent }
					did={ identity.did }
					pdsUrl={ pdsUrl }
					handle={ identity.handle ?? identity.did }
					onSaved={ ( pub ) => {
						setTargetUri( pub.uri );
						onReloadPublications();
					} }
					onCancel={ onCancel }
				/>
			</section>
		);
	}

	async function run() {
		if ( ! target ) {
			return;
		}
		setPhase( 'working' );
		setError( null );
		try {
			const prepared = await uploadHeldAssets( agent, {
				blocks,
				coverDataUrl,
				did: identity.did,
				pdsUrl,
			} );
			const res = await publish( agent, identity, {
				title: title.trim(),
				description,
				blocks: prepared.blocks,
				publicationUri: target.uri,
				publicationCid: target.cid,
				publicationSlug: target.slug,
				coverImage: prepared.coverImage,
			} );
			onPublished( { articleUrl: res.articleUrl } );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
			setPhase( 'error' );
		}
	}

	const overLimit = Boolean( preview?.overLimit );

	return (
		<section className="writeflow" aria-label="Publish">
			{ pubs.length > 1 && (
				<label className="writeflow__target">
					<span>Publish to</span>
					<select
						value={ target?.uri ?? '' }
						onChange={ ( e ) => setTargetUri( e.target.value ) }
						disabled={ phase === 'working' }
					>
						{ pubs.map( ( p ) => (
							<option key={ p.uri } value={ p.uri }>
								{ p.name }
							</option>
						) ) }
					</select>
				</label>
			) }

			<p className="writeflow__warning">
				Publishing saves this article to <strong>your PDS</strong> and also creates a{ ' ' }
				<strong>public Bluesky post</strong> linking to it
				{ target ? <> in <strong>{ target.name }</strong></> : null }. Everyone following you
				will see it.
				{ preview && preview.handles.length > 0 && (
					<> It will notify <strong>{ preview.handles.join( ', ' ) }</strong>.</>
				) }
			</p>

			{ overLimit && (
				<p className="writeflow__count" aria-live="polite">
					Bluesky post: { preview!.graphemes }/300 — too long to publish; shorten the
					subtitle or remove a mention.
				</p>
			) }

			{ phase === 'working' ? (
				<p className="writeflow__status">Publishing…</p>
			) : (
				<div className="writeflow__actions">
					<button
						type="button"
						className="writeflow__publish"
						disabled={ overLimit || ! target }
						onClick={ () => void run() }
					>
						Publish &amp; post to Bluesky
					</button>
					<button type="button" className="writeflow__cancel" onClick={ onCancel }>
						Keep editing
					</button>
				</div>
			) }

			{ phase === 'error' && error && (
				<p className="writeflow__error" role="alert">
					Publish failed: { error }
				</p>
			) }
		</section>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/WritePublishFlow.test.tsx`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add src/components/WritePublishFlow.tsx src/components/WritePublishFlow.test.tsx
git commit --no-gpg-sign -m "Add WritePublishFlow stepper (branch, confirm, upload, publish)"
```

---

### Task 7: SignInPanel + AccountPill

The two top-right corner states. `SignInPanel` is the signed-out handle entry (with the link-out to Bluesky signup); `AccountPill` is the signed-in avatar/handle menu. Both are presentational — the island wires the behavior.

**Files:**
- Create: `src/components/SignInPanel.tsx`
- Create: `src/components/AccountPill.tsx`
- Test: `src/components/SignInPanel.test.tsx`
- Test: `src/components/AccountPill.test.tsx`

**Interfaces:**
- `SignInPanel`: `interface Props { forPublish: boolean; error: string | null; onSubmit: ( value: string ) => void; onCancel?: () => void; }` → `export default function SignInPanel( props: Props )`
- `AccountPill`: `interface Props { displayName: string; handle: string | null; avatar: string | null; onSignOut: () => void; }` → `export default function AccountPill( props: Props )` (the Profile link is built from `authorPath( handle )`, omitted when no handle).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/SignInPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;
import SignInPanel from './SignInPanel';

function mount( props: Record< string, unknown > ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	act( () => createRoot( container ).render( createElement( SignInPanel, props as never ) ) );
	return container;
}

describe( 'SignInPanel', () => {
	it( 'for-publish variant frames the CTA around publishing and links out to signup', () => {
		const c = mount( { forPublish: true, error: null, onSubmit: vi.fn() } );
		expect( c.textContent?.toLowerCase() ).toContain( 'publish' );
		const signup = c.querySelector( 'a[href*="bsky.app"]' );
		expect( signup ).not.toBe( null );
	} );

	it( 'submits the typed handle', () => {
		const onSubmit = vi.fn();
		const c = mount( { forPublish: false, error: null, onSubmit } );
		const input = c.querySelector( 'input' )!;
		const form = c.querySelector( 'form' )!;
		act( () => {
			( input as HTMLInputElement ).value = 'alice.bsky.social';
			input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		} );
		act( () => form.dispatchEvent( new Event( 'submit', { bubbles: true, cancelable: true } ) ) );
		expect( onSubmit ).toHaveBeenCalledWith( 'alice.bsky.social' );
	} );

	it( 'shows an error when provided', () => {
		const c = mount( { forPublish: false, error: 'Bad handle', onSubmit: vi.fn() } );
		expect( c.textContent ).toContain( 'Bad handle' );
	} );
} );
```

```tsx
// src/components/AccountPill.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;
import AccountPill from './AccountPill';

function mount( props: Record< string, unknown > ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	act( () => createRoot( container ).render( createElement( AccountPill, props as never ) ) );
	return container;
}

describe( 'AccountPill', () => {
	it( 'shows the handle and a Manage-publications + Profile + Sign out menu', () => {
		const c = mount( {
			displayName: 'Alice', handle: 'alice.test', avatar: null, onSignOut: vi.fn(),
		} );
		expect( c.textContent ).toContain( 'alice.test' );
		expect( c.querySelector( 'a[href="/dashboard"]' ) ).not.toBe( null );
		expect( c.querySelector( 'a[href="/@alice.test"]' ) ).not.toBe( null );
		expect( c.textContent?.toLowerCase() ).toContain( 'sign out' );
	} );

	it( 'invokes onSignOut when Sign out is clicked', () => {
		const onSignOut = vi.fn();
		const c = mount( { displayName: 'Alice', handle: 'alice.test', avatar: null, onSignOut } );
		const btn = [ ...c.querySelectorAll( 'button' ) ].find( ( b ) => /sign out/i.test( b.textContent ?? '' ) )!;
		act( () => btn.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) ) );
		expect( onSignOut ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'omits the Profile link when no handle is known', () => {
		const c = mount( { displayName: 'did:plc:me', handle: null, avatar: null, onSignOut: vi.fn() } );
		expect( c.querySelector( 'a[href^="/@"]' ) ).toBe( null );
	} );
} );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/SignInPanel.test.tsx src/components/AccountPill.test.tsx`
Expected: FAIL — cannot resolve the components.

- [ ] **Step 3: Write the implementations**

```tsx
// src/components/SignInPanel.tsx
import { useState } from 'react';

interface Props {
	/** True when opened from "Publish" — the copy promises a publish on return. */
	forPublish: boolean;
	error: string | null;
	onSubmit: ( value: string ) => void;
	onCancel?: () => void;
}

/**
 * Signed-out handle entry for the writing-first flow. OAuth is sign-in only, so this never
 * creates an account — it links out to Bluesky's hosted signup instead (brief guardrail). The
 * caller persists the draft + sets publish intent before the redirect.
 */
export default function SignInPanel( { forPublish, error, onSubmit, onCancel }: Props ) {
	const [ value, setValue ] = useState( '' );

	return (
		<form
			className="signin-panel"
			onSubmit={ ( event ) => {
				event.preventDefault();
				onSubmit( value.trim() );
			} }
		>
			<h2 className="signin-panel__title">
				{ forPublish ? 'Sign in to publish' : 'Sign in' }
			</h2>
			<p className="signin-panel__lede">
				{ forPublish
					? "Your draft is saved. Sign in and we'll pick up right where you left off and publish it."
					: 'Use your existing Bluesky / AT Protocol identity. Your work stays in your own account.' }
			</p>
			<label className="signin-panel__label" htmlFor="write-handle">
				Your handle, DID, or PDS URL
			</label>
			<input
				id="write-handle"
				className="signin-panel__input"
				name="handle"
				autoComplete="username"
				autoCapitalize="none"
				autoCorrect="off"
				spellCheck={ false }
				placeholder="alice.bsky.social"
				value={ value }
				onChange={ ( event ) => setValue( event.target.value ) }
			/>
			<div className="signin-panel__actions">
				<button className="signin-panel__submit" type="submit">
					Sign in with AT Protocol
				</button>
				{ onCancel && (
					<button className="signin-panel__cancel" type="button" onClick={ onCancel }>
						Cancel
					</button>
				) }
			</div>
			{ error && (
				<p className="signin-panel__error" role="alert">
					{ error }
				</p>
			) }
			<p className="signin-panel__signup">
				Need an account?{ ' ' }
				<a href="https://bsky.app" target="_blank" rel="noreferrer noopener">
					Create one on Bluesky →
				</a>
			</p>
		</form>
	);
}
```

```tsx
// src/components/AccountPill.tsx
import { useEffect, useRef, useState } from 'react';
import { authorPath } from '../lib/auth/profile';

interface Props {
	displayName: string;
	handle: string | null;
	avatar: string | null;
	onSignOut: () => void;
}

/**
 * Signed-in account pill for the writing-first page: avatar + handle, opening a menu with
 * Manage publications (→ existing dashboard), Profile (public author page, omitted when no
 * handle), and Sign out. Management lives on the dashboard by design — the editor stays the
 * focus here (design 2026-06-17, Q5).
 */
export default function AccountPill( { displayName, handle, avatar, onSignOut }: Props ) {
	const [ open, setOpen ] = useState( false );
	const [ avatarOk, setAvatarOk ] = useState( true );
	const rootRef = useRef< HTMLDivElement >( null );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		function onDown( event: MouseEvent ) {
			if ( rootRef.current && ! rootRef.current.contains( event.target as Node ) ) {
				setOpen( false );
			}
		}
		document.addEventListener( 'mousedown', onDown );
		return () => document.removeEventListener( 'mousedown', onDown );
	}, [ open ] );

	const profileHref = authorPath( handle );

	return (
		<div className="account-pill" ref={ rootRef }>
			<button
				type="button"
				className="account-pill__trigger"
				aria-haspopup="menu"
				aria-expanded={ open }
				onClick={ () => setOpen( ( v ) => ! v ) }
			>
				{ avatar && avatarOk ? (
					<img
						className="account-pill__avatar"
						src={ avatar }
						alt=""
						width={ 28 }
						height={ 28 }
						onError={ () => setAvatarOk( false ) }
					/>
				) : (
					<span className="account-pill__avatar account-pill__avatar--fallback" aria-hidden="true">
						{ displayName.charAt( 0 ).toUpperCase() }
					</span>
				) }
				<span className="account-pill__handle">
					{ handle ? `@${ handle }` : displayName }
				</span>
			</button>
			{ open && (
				<div className="account-pill__menu" role="menu">
					<a className="account-pill__item" role="menuitem" href="/dashboard">
						Manage publications
					</a>
					{ profileHref && (
						<a className="account-pill__item" role="menuitem" href={ profileHref }>
							Profile
						</a>
					) }
					<button
						type="button"
						className="account-pill__item account-pill__item--button"
						role="menuitem"
						onClick={ onSignOut }
					>
						Sign out
					</button>
				</div>
			) }
		</div>
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/SignInPanel.test.tsx src/components/AccountPill.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SignInPanel.tsx src/components/AccountPill.tsx \
	src/components/SignInPanel.test.tsx src/components/AccountPill.test.tsx
git commit --no-gpg-sign -m "Add signed-out sign-in panel and signed-in account pill"
```

---

### Task 8: WriteStudio island

The island that ties it together: editor for every auth status, deferred media, draft persistence + auto-restore, the Publish action (persist + intent + redirect when signed out), and the resume-after-redirect that auto-opens `WritePublishFlow`.

**Files:**
- Create: `src/components/WriteStudio.tsx`
- Test: `src/components/WriteStudio.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth`; `SkyEditor`; `AppBar`; `PublishedPill`; `CoverImagePicker`; `SignInPanel`; `AccountPill`; `WritePublishFlow`; `createDeferredMediaUpload`; `createDraftStore`, `WriteDraft`; `listPublications`, `Publication`; `normalizeBlocks` from `../lib/publish/records`; `validateCoverFile`, `CoverUpload` from `../lib/media/cover`; `displayNameFor` from `../lib/auth/profile`; `BlockNode`.
- Produces: `export default function WriteStudio()` (default export, mounted by the route).

> **Cover handling note:** in this flow a chosen cover is held as a `data:` URL. `CoverImagePicker` needs a `CoverUpload` (`{ ref, previewUrl }`); we pass a deferred placeholder ref (`{ $type: 'blob', ref: { $link: '' }, mimeType: file.type, size: file.size }`) and a `data:` URL `previewUrl`. Only `previewUrl` is read downstream — `WritePublishFlow` receives `coverDataUrl = cover?.previewUrl ?? null` and `uploadHeldAssets` produces the real ref at publish.

> **Editor seeding note:** `WriteStudio` keeps content as `BlockNode[]` (`blocks`). `SkyEditor.onChange` yields `BlockInstance[]`; convert with `normalizeBlocks` before storing. On restore, pass the restored nodes once as `SkyEditor`'s `initialBlocks` (captured in a ref so a later `blocks` change doesn't remount the canvas).

- [ ] **Step 1: Write the failing test** (mock `SkyEditor`, `draft-store`, and `listPublications` so the heavy editor and storage are out of scope; assert the auth-state surfaces + resume)

```tsx
// src/components/WriteStudio.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

// Stub the heavy editor: render a marker, ignore props.
vi.mock( './SkyEditor', () => ( { default: () => createElement( 'div', { 'data-testid': 'sky-editor' } ) } ) );
// Stub AppBar to avoid pulling chrome we don't assert on.
vi.mock( './AppBar', () => ( { default: () => null } ) );

const auth = vi.hoisted( () => ( { value: {} as Record< string, unknown > } ) );
vi.mock( '../lib/auth/AuthProvider', () => ( {
	AuthProvider: ( { children }: { children: unknown } ) => children,
} ) );
vi.mock( '../lib/auth/useAuth', () => ( { useAuth: () => auth.value } ) );

const draft = vi.hoisted( () => ( {
	store: {
		load: vi.fn( async () => null ),
		save: vi.fn( async () => {} ),
		clear: vi.fn( async () => {} ),
		setPublishIntent: vi.fn(),
		consumePublishIntent: vi.fn( () => false ),
	},
} ) );
vi.mock( '../lib/write/draft-store', () => ( {
	createDraftStore: () => draft.store,
} ) );
vi.mock( '../lib/publish/publications', () => ( {
	listPublications: vi.fn( async () => [] ),
} ) );

import WriteStudio from './WriteStudio';

function render() {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	return { container, root };
}

beforeEach( () => {
	draft.store.consumePublishIntent.mockReturnValue( false );
	draft.store.load.mockResolvedValue( null );
} );

describe( 'WriteStudio', () => {
	it( 'signed out: renders the editor AND a sign-in affordance (no gate)', async () => {
		auth.value = { status: 'signed-out', agent: null, did: null, handle: null, signIn: vi.fn(), signOut: vi.fn() };
		const { container, root } = render();
		await act( async () => {
			root.render( createElement( WriteStudio ) );
		} );
		expect( container.querySelector( '[data-testid="sky-editor"]' ) ).not.toBe( null );
		expect( container.textContent?.toLowerCase() ).toContain( 'sign in' );
	} );

	it( 'signed in: renders the editor AND the account pill', async () => {
		auth.value = {
			status: 'signed-in', agent: {}, did: 'did:plc:me', handle: 'me.test',
			displayName: 'Me', avatar: null, pdsUrl: 'https://pds', signIn: vi.fn(), signOut: vi.fn(),
		};
		const { container, root } = render();
		await act( async () => {
			root.render( createElement( WriteStudio ) );
		} );
		expect( container.querySelector( '[data-testid="sky-editor"]' ) ).not.toBe( null );
		expect( container.querySelector( '.account-pill' ) ).not.toBe( null );
	} );

	it( 'resume: a publish intent on a signed-in load opens the publish flow', async () => {
		draft.store.consumePublishIntent.mockReturnValue( true );
		auth.value = {
			status: 'signed-in', agent: {}, did: 'did:plc:me', handle: 'me.test',
			displayName: 'Me', avatar: null, pdsUrl: 'https://pds', signIn: vi.fn(), signOut: vi.fn(),
		};
		const { container, root } = render();
		await act( async () => {
			root.render( createElement( WriteStudio ) );
		} );
		expect( container.querySelector( '.writeflow' ) ).not.toBe( null );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/WriteStudio.test.tsx`
Expected: FAIL — cannot resolve `./WriteStudio`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/WriteStudio.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BlockInstance } from '@wordpress/blocks';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import SkyEditor from './SkyEditor';
import AppBar from './AppBar';
import PublishedPill from './PublishedPill';
import CoverImagePicker from './CoverImagePicker';
import SignInPanel from './SignInPanel';
import AccountPill from './AccountPill';
import WritePublishFlow from './WritePublishFlow';
import { createDeferredMediaUpload } from '../lib/write/deferred-media';
import { createDraftStore, type WriteDraft } from '../lib/write/draft-store';
import { listPublications, type Publication } from '../lib/publish/publications';
import { normalizeBlocks } from '../lib/publish/records';
import { validateCoverFile, type CoverUpload } from '../lib/media/cover';
import { displayNameFor } from '../lib/auth/profile';
import type { BlockNode } from '../lib/blocks/render';
import type { BlobRefJson } from '../lib/media/blob';

/** Read a file into a `data:` URL for a held (not-yet-uploaded) cover preview. */
function readAsDataUrl( file: File ): Promise< string > {
	return new Promise( ( resolve, reject ) => {
		const reader = new FileReader();
		reader.onload = () => resolve( reader.result as string );
		reader.onerror = () => reject( reader.error ?? new Error( 'Could not read the file.' ) );
		reader.readAsDataURL( file );
	} );
}

/** A placeholder ref for a held cover — only `previewUrl` (a data URL) is used before publish. */
function deferredCoverRef( file: File ): BlobRefJson {
	return { $type: 'blob', ref: { $link: '' }, mimeType: file.type, size: file.size };
}

function WriteSurface() {
	const { status, agent, did, handle, displayName, avatar, pdsUrl, error, signIn, signOut } =
		useAuth();

	const draftStore = useMemo( () => createDraftStore(), [] );
	const mediaUpload = useMemo( () => createDeferredMediaUpload(), [] );

	const [ title, setTitle ] = useState( '' );
	const [ lede, setLede ] = useState( '' );
	const [ blocks, setBlocks ] = useState< BlockNode[] >( [] );
	const [ cover, setCover ] = useState< CoverUpload | null >( null );
	const [ publications, setPublications ] = useState< Publication[] | null >( null );
	const [ flowOpen, setFlowOpen ] = useState( false );
	const [ pendingPublish, setPendingPublish ] = useState( false );
	const [ signinOpen, setSigninOpen ] = useState( false );
	const [ published, setPublished ] = useState< { url: string } | null >( null );
	const [ editorKey, setEditorKey ] = useState( 0 );

	// Restored content fed to the editor canvas once, captured so a later `blocks`
	// change can't remount SkyEditor (which would wipe the canvas).
	const initialBlocksRef = useRef< BlockNode[] >( [] );
	const restoredRef = useRef( false );
	const intentRef = useRef( false );

	// One-shot restore + intent read on mount.
	useEffect( () => {
		let cancelled = false;
		intentRef.current = draftStore.consumePublishIntent();
		draftStore.load().then( ( d: WriteDraft | null ) => {
			if ( cancelled || ! d ) {
				return;
			}
			restoredRef.current = true;
			initialBlocksRef.current = d.blocks;
			setTitle( d.title );
			setLede( d.lede );
			setBlocks( d.blocks );
			if ( d.coverDataUrl ) {
				setCover( {
					ref: { $type: 'blob', ref: { $link: '' }, mimeType: '', size: 0 },
					previewUrl: d.coverDataUrl,
				} );
			}
			setEditorKey( ( k ) => k + 1 );
		} );
		return () => {
			cancelled = true;
		};
	}, [ draftStore ] );

	// Load publications once signed in.
	useEffect( () => {
		if ( ! agent || ! did ) {
			return;
		}
		let cancelled = false;
		listPublications( agent, did )
			.then( ( list ) => ! cancelled && setPublications( list ) )
			.catch( () => ! cancelled && setPublications( [] ) );
		return () => {
			cancelled = true;
		};
	}, [ agent, did ] );

	// Resume: a publish intent + a signed-in session auto-opens the publish flow.
	useEffect( () => {
		if ( status === 'signed-in' && intentRef.current ) {
			intentRef.current = false;
			setFlowOpen( true );
		}
	}, [ status ] );

	const reloadPublications = () => {
		if ( agent && did ) {
			listPublications( agent, did )
				.then( setPublications )
				.catch( () => setPublications( [] ) );
		}
	};

	async function persistDraft() {
		await draftStore.save( {
			title,
			lede,
			blocks,
			coverDataUrl: cover?.previewUrl ?? null,
		} );
	}

	async function onSignIn( value: string ) {
		await persistDraft();
		if ( pendingPublish ) {
			draftStore.setPublishIntent();
		}
		await signIn( value ); // full-page redirect; never resolves
	}

	function onPublishClicked() {
		if ( status === 'signed-in' ) {
			void persistDraft();
			setFlowOpen( true );
			return;
		}
		// Signed out → reveal the sign-in panel framed around publishing.
		setPendingPublish( true );
		setSigninOpen( true );
	}

	async function uploadCover( file: File ): Promise< CoverUpload > {
		const message = validateCoverFile( file );
		if ( message ) {
			throw new Error( message );
		}
		const previewUrl = await readAsDataUrl( file );
		return { ref: deferredCoverRef( file ), previewUrl };
	}

	const canPublish = title.trim().length > 0 && blocks.length > 0;
	const signedIn = status === 'signed-in' && agent && did;

	return (
		<>
			<AppBar current="editor" />

			<div className="write-corner">
				{ signedIn ? (
					<AccountPill
						displayName={ displayName ? displayNameFor( { did: did!, handle, displayName, avatar } ) : ( handle ?? did! ) }
						handle={ handle }
						avatar={ avatar }
						onSignOut={ () => void signOut() }
					/>
				) : (
					<button
						type="button"
						className="write-corner__signin"
						onClick={ () => {
							setPendingPublish( false );
							setSigninOpen( true );
						} }
					>
						Sign in
					</button>
				) }
			</div>

			{ published && <PublishedPill url={ published.url } isEditing={ false } /> }

			{ ! signedIn && signinOpen && (
				<div className="write-signin">
					<SignInPanel
						forPublish={ pendingPublish }
						error={ error }
						onSubmit={ ( value ) => void onSignIn( value ) }
						onCancel={ () => setSigninOpen( false ) }
					/>
				</div>
			) }

			{ signedIn && flowOpen && (
				<WritePublishFlow
					agent={ agent! }
					identity={ { did: did!, handle } }
					pdsUrl={ pdsUrl ?? '' }
					blocks={ blocks }
					coverDataUrl={ cover?.previewUrl ?? null }
					title={ title }
					description={ lede }
					publications={ publications }
					onReloadPublications={ reloadPublications }
					onPublished={ ( result ) => {
						setFlowOpen( false );
						setPublished( { url: result.articleUrl } );
						void draftStore.clear();
						// Reset to a fresh new article.
						setTitle( '' );
						setLede( '' );
						setBlocks( [] );
						setCover( null );
						initialBlocksRef.current = [];
						setEditorKey( ( k ) => k + 1 );
					} }
					onCancel={ () => setFlowOpen( false ) }
				/>
			) }

			<div key={ editorKey }>
				<div className="write-header">
					<textarea
						className="studio__title"
						rows={ 1 }
						placeholder="Add title"
						aria-label="Article title"
						value={ title }
						onKeyDown={ ( event ) => event.key === 'Enter' && event.preventDefault() }
						onChange={ ( event ) => {
							setPublished( null );
							setTitle( event.target.value );
						} }
					/>
					<button
						type="button"
						className="write-publish"
						disabled={ ! canPublish }
						onClick={ onPublishClicked }
					>
						Publish…
					</button>
				</div>
				<textarea
					className="studio__lede"
					rows={ 1 }
					maxLength={ 3000 }
					placeholder="Add a subtitle…"
					aria-label="Subtitle"
					value={ lede }
					onChange={ ( event ) => setLede( event.target.value ) }
				/>
				<SkyEditor
					onChange={ ( instances: BlockInstance[] ) => setBlocks( normalizeBlocks( instances ) ) }
					mediaUpload={ mediaUpload }
					initialBlocks={ initialBlocksRef.current }
				/>
				<CoverImagePicker cover={ cover } onUpload={ uploadCover } onChange={ setCover } />
			</div>
		</>
	);
}

/** The writing-first island: editor for every auth status, publish deferred (design 2026-06-17). */
export default function WriteStudio() {
	return (
		<AuthProvider>
			<WriteSurface />
		</AuthProvider>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/WriteStudio.test.tsx`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/components/WriteStudio.tsx src/components/WriteStudio.test.tsx
git commit --no-gpg-sign -m "Add WriteStudio island: editor-first, publish deferred"
```

---

### Task 9: `/write` route + styles + meta test

Mount the island at `/write` (parallel to `/editor`, both untouched) and add its chrome styles. The colocated test is underscore-prefixed per the router constraint.

**Files:**
- Create: `src/pages/write.astro`
- Create: `src/styles/write-chrome.css`
- Test: `src/pages/_write.meta.test.ts`

**Interfaces:**
- Consumes: `WriteStudio` default export; `Base` layout; `LoadingScene`; the shared editor stylesheets.
- Produces: a static route at `/write`.

- [ ] **Step 1: Write the failing test**

```ts
// src/pages/_write.meta.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync( new URL( './write.astro', import.meta.url ), 'utf8' );

describe( '/write route', () => {
	it( 'mounts WriteStudio as a client:only island', () => {
		expect( src ).toContain( "import WriteStudio from '../components/WriteStudio.tsx'" );
		expect( src ).toMatch( /<WriteStudio\s+client:only="react"/ );
	} );

	it( 'ships a writing-focused title and the write chrome styles', () => {
		expect( src ).toMatch( /<Base title="Write[^"]*"/ );
		expect( src ).toContain( "import '../styles/write-chrome.css'" );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/_write.meta.test.ts`
Expected: FAIL — `write.astro` does not exist.

- [ ] **Step 3: Write the route + styles**

```astro
---
// src/pages/write.astro
import Base from '../layouts/Base.astro';
import WriteStudio from '../components/WriteStudio.tsx';
import LoadingScene from '../components/LoadingScene.astro';
// The island is `client:only`, so Astro's scoped styles never reach its DOM — its
// chrome is styled globally from these shared stylesheets plus the write-specific one.
import '../styles/app-bar.css';
import '../styles/editor-chrome.css';
import '../styles/login.css';
import '../styles/write-chrome.css';
---

<Base title="Write — SkyPress">
	<main class="editor-shell">
		<!-- client:only — auth + editor run only in the browser (Decisions 0001 & 0004).
		     Unlike /editor this surface never gates on auth: you can write signed out. -->
		<WriteStudio client:only="react">
			<LoadingScene slot="fallback" variant="editor" />
		</WriteStudio>
	</main>
</Base>
```

```css
/* src/styles/write-chrome.css
 * Chrome unique to the writing-first page (/write): the top-right corner (sign-in / pill),
 * the sign-in panel, the publish stepper, and the in-header Publish button. The editor body
 * itself reuses editor-chrome.css (.studio__title / .studio__lede / .studio__cover*).
 */

.write-corner {
	display: flex;
	justify-content: flex-end;
	padding: 0.5rem 1rem;
}

.write-corner__signin,
.write-publish {
	font: inherit;
	cursor: pointer;
	border-radius: 999px;
	border: 1px solid currentColor;
	padding: 0.35rem 0.9rem;
	background: transparent;
}

.write-publish[disabled] {
	opacity: 0.5;
	cursor: default;
}

.write-header {
	display: flex;
	align-items: flex-start;
	gap: 0.75rem;
}

.write-header .studio__title {
	flex: 1 1 auto;
}

.account-pill {
	position: relative;
}

.account-pill__trigger {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	background: transparent;
	border: 0;
	cursor: pointer;
	font: inherit;
}

.account-pill__avatar {
	border-radius: 999px;
}

.account-pill__avatar--fallback {
	display: inline-grid;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: 999px;
	background: rgba( 0, 0, 0, 0.1 );
}

.account-pill__menu {
	position: absolute;
	right: 0;
	margin-top: 0.4rem;
	min-width: 12rem;
	display: flex;
	flex-direction: column;
	background: Canvas;
	border: 1px solid rgba( 0, 0, 0, 0.15 );
	border-radius: 0.5rem;
	box-shadow: 0 8px 24px rgba( 0, 0, 0, 0.12 );
	overflow: hidden;
}

.account-pill__item {
	padding: 0.6rem 0.9rem;
	text-align: left;
	background: transparent;
	border: 0;
	font: inherit;
	cursor: pointer;
	color: inherit;
	text-decoration: none;
}

.account-pill__item:hover {
	background: rgba( 0, 0, 0, 0.06 );
}

.write-signin,
.writeflow {
	max-width: 32rem;
	margin: 1rem auto;
	padding: 1rem 1.25rem;
	border: 1px solid rgba( 0, 0, 0, 0.15 );
	border-radius: 0.75rem;
}

.signin-panel__actions,
.writeflow__actions {
	display: flex;
	gap: 0.75rem;
	margin-top: 0.75rem;
}

.writeflow__warning {
	font-size: 0.95rem;
}

.writeflow__count,
.writeflow__error,
.signin-panel__error {
	color: #b3261e;
}
```

- [ ] **Step 4: Run test + a full check to verify it passes**

Run: `npx vitest run src/pages/_write.meta.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: no new TypeScript/Astro errors from the added files.

- [ ] **Step 5: Commit**

```bash
git add src/pages/write.astro src/pages/_write.meta.test.ts src/styles/write-chrome.css
git commit --no-gpg-sign -m "Add /write route and writing-first chrome styles"
```

---

### Task 10: Decision record + full verification

Capture the durable rationale and verify the whole suite + build.

**Files:**
- Create: `docs/decisions/0020-writing-first-deferred-publish.md`

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Write the decision record**

```markdown
<!-- docs/decisions/0020-writing-first-deferred-publish.md -->
# 0020 — Writing-first flow: deferred publish, no remote account creation

## Context
`/editor` gates the entire editor behind OAuth. We wanted a parallel surface where writing is
the first action and auth/publication selection are deferred to publish time.

## Decision
- Add a parallel route `/write` mounting a new `WriteStudio` island that renders the editor for
  every auth status (no login gate). `/`, `/editor`, `/dashboard` are untouched.
- Images are held locally as `data:` URLs and uploaded to the PDS only at publish
  (`src/lib/write/upload-held.ts`), via one media path regardless of auth state.
- The draft (title, lede, token-skeleton blocks, cover) survives the full-page OAuth redirect:
  light metadata + skeleton in `localStorage`, image bytes in IndexedDB
  (`src/lib/write/draft-store.ts` + `asset-store.ts`). A one-shot `publishIntent` flag makes the
  publish flow auto-resume on return.
- Publish branches on publication count: one → confirm; many → pick; zero → inline create. The
  single-publication case still shows a confirm — publishing also posts to Bluesky (brief §10).

## Why not remote account creation
atproto OAuth authenticates an existing account; `com.atproto.server.createAccount` lives on a
PDS's hosted signup (invite/email gated) and is not exposed to third-party clients. Building an
inline signup would make SkyPress a hosting/signup broker, contradicting the "never a PDS/relay"
guardrail. The signed-out panel therefore links out to Bluesky signup and otherwise offers
sign-in only.

## Consequences
- Signed-in writers lose eager upload error feedback (errors surface at publish) — accepted for a
  single, simpler media path.
- `data:`-URL drafts can be large; bytes go to IndexedDB to avoid the `localStorage` quota.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites, including the new `src/lib/write/*` and `src/components/Write*` / `SignInPanel` / `AccountPill` tests.

- [ ] **Step 3: Type/Astro check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Build (prerender smoke — catches the router-executes-tests trap)**

Run: `npm run build`
Expected: success; `/write` prerenders without 500s (confirms the `_write.meta.test.ts` underscore prefix is respected).

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0020-writing-first-deferred-publish.md
git commit --no-gpg-sign -m "Record decision 0020: writing-first deferred publish"
```

---

## Manual verification (after the plan)

Run `npm run dev` and open `http://127.0.0.1:<port>/write` (127.0.0.1, not localhost — atproto loopback requirement, Decision 0004):

1. **Signed out, write + images:** type a title/lede, insert an image — it previews inline; nothing uploads (check Network: no `uploadBlob`).
2. **Publish → redirect → resume:** click Publish, sign in; on return the draft (incl. the image) is restored and the publish flow opens automatically.
3. **Branch — one pub:** with exactly one publication, confirm names it and discloses the Bluesky post; confirming uploads the image then publishes. Open the live article — the image renders from `getBlob`.
4. **Branch — zero pubs:** with no publication, the inline create form appears; creating one proceeds to publish.
5. **Branch — many pubs:** with 2+, a picker appears before confirm.
6. **Already signed in:** reload `/write` while signed in — the pill shows; Publish opens the flow with no redirect.

## Self-Review

- **Spec coverage:** route & island (T8/T9) ✓; two corner states (T7/T8) ✓; draft persistence across redirect (T3/T4/T8) ✓; deferred one-path media (T1/T5/T8) ✓; publish branching one/many/zero with always-confirm + inline create (T6) ✓; resume-after-redirect via publishIntent (T4/T8) ✓; reuse vs build + untouched routes (file structure) ✓; new-doc-only (no `?edit` path in T8) ✓; no remote account creation (T7 link-out + T10 decision) ✓; testing constraints incl. underscore-prefixed page test (T9) ✓.
- **Placeholder scan:** none — every step ships real code/commands.
- **Type consistency:** `WriteDraft`, `AssetStore`, `AssetSkeleton`, `PreparedPublishContent`, `CoverUpload`, `BlobRefJson`, `Publication`, `Identity`, and `computePostPreview`'s input shape are used consistently across tasks; `uploadHeldAssets`/`publish`/`attachBlobRefs` signatures match their definitions in the reused modules.
```
