# Per-article cover image picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let creators pick an explicit per-article cover image in a strip below the editor, persisted to the standard `site.standard.document.coverImage` field and used (with a fallback to the first body image) as the Bluesky card thumb.

**Architecture:** A lightweight React picker (`CoverImagePicker`) reuses the existing PDS upload path (`createMediaUpload` + blob `registry`) via a small bridge helper. The chosen blob ref flows through `Studio` → `PublishPanel` → `publish`/`updateDocument`, where it is written to the document's `coverImage` and preferred over `firstImageBlobRef()` for the post thumb. On edit, the stored `coverImage` is read back and previewed.

**Tech Stack:** Astro + React 18, `@automattic/isolated-block-editor`, `@atproto/api`, Vitest (jsdom), raw `react-dom/client` for component tests.

**Spec:** `docs/superpowers/specs/2026-06-10-cover-image-picker-design.md`

---

## File Structure

**New files:**
- `src/lib/media/cover.ts` — pure helpers + upload bridge: `COVER_MAX_BYTES`, `CoverUpload`, `validateCoverFile`, `coverPreviewUrl`, `uploadCoverViaMedia`.
- `src/lib/media/cover.test.ts` — unit tests for the above.
- `src/components/CoverImagePicker.tsx` — the picker UI (empty / uploading / set states).
- `src/components/CoverImagePicker.test.tsx` — component test.

**Modified files:**
- `src/lib/publish/records.ts` — `DocumentRecord.coverImage` + builder.
- `src/lib/publish/records.test.ts` — coverImage include/omit test.
- `src/lib/publish/publisher.ts` — `PublishInput`/`UpdateInput.coverImage`, thumb resolution, `MyArticle.coverImage` read-back.
- `src/lib/publish/publisher.test.ts` — cover-over-auto thumb, fallback, update, edit round-trip.
- `src/components/PublishPanel.tsx` — `coverImage` prop forwarded to publish/update.
- `src/components/PublishPanel.test.tsx` — forwards coverImage.
- `src/components/Studio.tsx` — `cover` state, `uploadCover`, picker render, edit hydrate, clears.
- `src/styles/editor-chrome.css` — `.studio__cover*` styles.

---

## Task 1: Cover constraints + pure helpers

**Files:**
- Create: `src/lib/media/cover.ts`
- Test: `src/lib/media/cover.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/media/cover.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	validateCoverFile,
	coverPreviewUrl,
	COVER_MAX_BYTES,
} from './cover';

describe( 'COVER_MAX_BYTES', () => {
	it( 'matches the 1MB cover/thumb cap', () => {
		expect( COVER_MAX_BYTES ).toBe( 1_000_000 );
	} );
} );

describe( 'validateCoverFile', () => {
	it( 'rejects non-image files', () => {
		const file = new File( [ 'x' ], 'notes.txt', { type: 'text/plain' } );
		expect( validateCoverFile( file ) ).toMatch( /image/i );
	} );

	it( 'rejects images larger than the cap', () => {
		const big = new File( [ new Uint8Array( COVER_MAX_BYTES + 1 ) ], 'big.png', {
			type: 'image/png',
		} );
		expect( validateCoverFile( big ) ).toMatch( /too large/i );
	} );

	it( 'accepts an image at the cap', () => {
		const ok = new File( [ new Uint8Array( COVER_MAX_BYTES ) ], 'ok.png', {
			type: 'image/png',
		} );
		expect( validateCoverFile( ok ) ).toBeNull();
	} );
} );

describe( 'coverPreviewUrl', () => {
	it( 'builds a getBlob URL from the stored ref', () => {
		const ref = {
			$type: 'blob' as const,
			ref: { $link: 'bafycid' },
			mimeType: 'image/png',
			size: 1234,
		};
		const url = coverPreviewUrl( ref, {
			pdsUrl: 'https://pds.example',
			did: 'did:plc:me',
		} );
		expect( url ).toContain( 'com.atproto.sync.getBlob' );
		expect( url ).toContain( 'did%3Aplc%3Ame' );
		expect( url ).toContain( 'bafycid' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/media/cover.test.ts`
Expected: FAIL — cannot resolve `./cover` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/media/cover.ts`:

```ts
/**
 * Per-article cover image helpers (design 2026-06-10). Pure functions + a thin bridge over
 * the existing media upload path — no `@atproto/*` or network here beyond the injected handler.
 */
import {
	BSKY_THUMB_MAX_BYTES,
	buildGetBlobUrl,
	type BlobRefJson,
} from './blob';
import type { BlobRegistry, MediaUploadHandler } from './mediaUpload';

/**
 * The cover image blob constraint — `image/*`, ≤ 1,000,000 bytes. Shared with the Bluesky
 * card thumb (`BSKY_THUMB_MAX_BYTES`) and equal to the `site.standard.document.coverImage`
 * lexicon `maxSize`, so a valid cover is always a valid thumb.
 */
export const COVER_MAX_BYTES = BSKY_THUMB_MAX_BYTES;

/** A chosen cover: the persistable blob ref + a URL to preview it in the picker. */
export interface CoverUpload {
	ref: BlobRefJson;
	previewUrl: string;
}

/**
 * Validate a candidate cover file before upload. Returns a human-readable error string, or
 * `null` when the file is an acceptable cover (`image/*` and ≤ `COVER_MAX_BYTES`).
 */
export function validateCoverFile( file: File ): string | null {
	if ( ! file.type.startsWith( 'image/' ) ) {
		return 'Choose an image file (PNG, JPG, or GIF).';
	}
	if ( file.size > COVER_MAX_BYTES ) {
		const mb = COVER_MAX_BYTES / 1_000_000;
		return `That image is too large — cover images must be ${ mb } MB or smaller.`;
	}
	return null;
}

/**
 * Build a `getBlob` preview URL for an already-committed cover (the edit-load case), from its
 * stored blob ref. A committed cover blob is referenced by the document, so `getBlob` works
 * directly — no `data:` URL needed.
 */
export function coverPreviewUrl(
	ref: BlobRefJson,
	author: { pdsUrl: string; did: string }
): string {
	return buildGetBlobUrl( author.pdsUrl, author.did, ref.ref.$link );
}

/**
 * Upload a cover file through the existing Gutenberg `mediaUpload` handler (same PDS path as
 * content images) and resolve with the persistable ref + preview URL. The handler records the
 * upload in `registry` keyed by the preview `data:` URL it returns via `onFileChange`; we read
 * the ref back out of `registry`. Rejects if the handler errors or returns nothing usable.
 */
export function uploadCoverViaMedia(
	file: File,
	mediaUpload: MediaUploadHandler,
	registry: BlobRegistry
): Promise< CoverUpload > {
	return new Promise( ( resolve, reject ) => {
		void mediaUpload( {
			filesList: [ file ],
			maxUploadFileSize: COVER_MAX_BYTES,
			onFileChange: ( files ) => {
				const previewUrl = files[ 0 ]?.url;
				const upload = previewUrl ? registry.get( previewUrl ) : undefined;
				if ( ! upload ) {
					reject( new Error( 'The upload did not return a usable image.' ) );
					return;
				}
				resolve( { ref: upload.ref, previewUrl } );
			},
			onError: ( err ) =>
				reject( err instanceof Error ? err : new Error( String( err ) ) ),
		} );
	} );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/media/cover.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/cover.ts src/lib/media/cover.test.ts
git commit --no-gpg-sign -m "Add cover image constraints and pure helpers"
```

---

## Task 2: `uploadCoverViaMedia` bridge test

**Files:**
- Modify: `src/lib/media/cover.test.ts`
- (Implementation already written in Task 1.)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/media/cover.test.ts` (add `uploadCoverViaMedia`, `type CoverUpload` to the existing import from `./cover`, and add the imports + block below):

```ts
// Add to the top imports:
//   import { ..., uploadCoverViaMedia, type CoverUpload } from './cover';
//   import type { BlobRegistry, MediaUploadHandler } from './mediaUpload';

describe( 'uploadCoverViaMedia', () => {
	it( 'uploads via the media handler and returns the registry ref + preview URL', async () => {
		const registry: BlobRegistry = new Map();
		const ref = {
			$type: 'blob' as const,
			ref: { $link: 'bafyc' },
			mimeType: 'image/png',
			size: 10,
		};
		const mediaUpload: MediaUploadHandler = async ( { filesList, onFileChange } ) => {
			expect( filesList.length ).toBe( 1 );
			const previewUrl = 'data:image/png;base64,AAA';
			registry.set( previewUrl, { ref, url: 'https://pds/getblob' } );
			onFileChange( [ { url: previewUrl, alt: '' } ] );
		};
		const file = new File( [ 'x' ], 'c.png', { type: 'image/png' } );
		const result: CoverUpload = await uploadCoverViaMedia( file, mediaUpload, registry );
		expect( result.ref ).toEqual( ref );
		expect( result.previewUrl ).toBe( 'data:image/png;base64,AAA' );
	} );

	it( 'rejects when the handler reports an error', async () => {
		const registry: BlobRegistry = new Map();
		const mediaUpload: MediaUploadHandler = async ( { onError } ) => {
			onError?.( new Error( 'upload failed' ) );
		};
		const file = new File( [ 'x' ], 'c.png', { type: 'image/png' } );
		await expect(
			uploadCoverViaMedia( file, mediaUpload, registry )
		).rejects.toThrow( 'upload failed' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it passes immediately**

Run: `npm test -- src/lib/media/cover.test.ts`
Expected: PASS (now 7 tests). (Implementation was written in Task 1; this task locks in the bridge behavior.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/media/cover.test.ts
git commit --no-gpg-sign -m "Test cover upload bridge over media handler"
```

---

## Task 3: Persist `coverImage` on the document record

**Files:**
- Modify: `src/lib/publish/records.ts:180-217` (`DocumentRecord` + `buildDocumentRecord`)
- Test: `src/lib/publish/records.test.ts:214-247` (`buildDocumentRecord` describe)

- [ ] **Step 1: Write the failing test**

In `src/lib/publish/records.test.ts`, inside `describe( 'buildDocumentRecord', () => {` (after the `omits updatedAt…` test, before the closing `} );` of that describe), add:

```ts
	it( 'omits coverImage unless provided, includes it when set', () => {
		expect( 'coverImage' in buildDocumentRecord( base ) ).toBe( false );
		const cover = {
			$type: 'blob' as const,
			ref: { $link: 'bafycover' },
			mimeType: 'image/png',
			size: 4242,
		};
		expect(
			buildDocumentRecord( { ...base, coverImage: cover } ).coverImage
		).toEqual( cover );
	} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/publish/records.test.ts`
Expected: FAIL — `coverImage` does not exist on the input type / record (TS error or assertion failure).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/publish/records.ts`, add `coverImage` to the `DocumentRecord` interface (after `content: GutenbergContent;`):

```ts
export interface DocumentRecord {
	$type: 'site.standard.document';
	site: string;
	title: string;
	path: string;
	publishedAt: string;
	textContent: string;
	content: GutenbergContent;
	/** Optional per-article cover (≤1MB, image/*) — the standard.site coverImage field. */
	coverImage?: BlobRefJson;
	description?: string;
	bskyPostRef?: StrongRef;
	updatedAt?: string;
}
```

Add `coverImage` to the `buildDocumentRecord` input type (after `publishedAt: string;`):

```ts
		publishedAt: string;
		/** Optional per-article cover blob ref to persist (design 2026-06-10). */
		coverImage?: BlobRefJson;
		description?: string;
```

And spread it into the returned record (after the `content: buildContentObject( input.blocks ),` line):

```ts
		content: buildContentObject( input.blocks ),
		...( input.coverImage ? { coverImage: input.coverImage } : {} ),
		...( input.description ? { description: input.description } : {} ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/publish/records.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/records.ts src/lib/publish/records.test.ts
git commit --no-gpg-sign -m "Persist optional coverImage on the document record"
```

---

## Task 4: Thumb resolution + publish/update wiring

**Files:**
- Modify: `src/lib/publish/publisher.ts` (imports, `PublishInput`, `publish`, `UpdateInput`, `updateDocument`)
- Test: `src/lib/publish/publisher.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/publish/publisher.test.ts`, inside `describe( 'publish', () => {` (after the `omits thumb when no usable image…` test), add:

```ts
	it( 'prefers an explicit coverImage over the first content image for the thumb', async () => {
		const auto = {
			$type: 'blob',
			ref: { $link: 'bafyauto' },
			mimeType: 'image/jpeg',
			size: 5000,
		};
		const cover = {
			$type: 'blob',
			ref: { $link: 'bafycover' },
			mimeType: 'image/png',
			size: 9000,
		};
		const blocksWithImage: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'getblob://x', skypressBlob: auto }, innerBlocks: [] },
		];
		const { agent, created } = mockAgent();
		await publish(
			agent,
			{ did: DID, handle: HANDLE },
			{ title: 'Hello', blocks: blocksWithImage, coverImage: cover as never, ...TARGET }
		);
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: { thumb?: { ref: { $link: string } } } };
		};
		expect( post.embed.external.thumb?.ref.$link ).toBe( 'bafycover' );
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record as {
			coverImage?: { ref: { $link: string } };
		};
		expect( doc.coverImage?.ref.$link ).toBe( 'bafycover' );
	} );

	it( 'falls back to the first content image when no cover is set', async () => {
		const auto = {
			$type: 'blob',
			ref: { $link: 'bafyauto' },
			mimeType: 'image/jpeg',
			size: 5000,
		};
		const blocksWithImage: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'getblob://x', skypressBlob: auto }, innerBlocks: [] },
		];
		const { agent, created } = mockAgent();
		await publish(
			agent,
			{ did: DID, handle: HANDLE },
			{ title: 'Hello', blocks: blocksWithImage, ...TARGET }
		);
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: { thumb?: { ref: { $link: string } } } };
		};
		expect( post.embed.external.thumb?.ref.$link ).toBe( 'bafyauto' );
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record as {
			coverImage?: unknown;
		};
		expect( 'coverImage' in doc ).toBe( false );
	} );
```

In `describe( 'updateDocument', () => {` (after the existing test), add:

```ts
	it( 'writes the coverImage when provided', async () => {
		const cover = {
			$type: 'blob',
			ref: { $link: 'bafycover' },
			mimeType: 'image/png',
			size: 9000,
		};
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
				coverImage: cover as never,
			}
		);
		const doc = put.find( ( p ) => p.collection === 'site.standard.document' )!.record as {
			coverImage?: { ref: { $link: string } };
		};
		expect( doc.coverImage?.ref.$link ).toBe( 'bafycover' );
	} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/publish/publisher.test.ts`
Expected: FAIL — `coverImage` not accepted on `PublishInput`/`UpdateInput`; thumb still uses `firstImageBlobRef`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/publish/publisher.ts`:

Update the blob import (line 10) to also bring in the JSON normalizer + type:

```ts
import { firstImageBlobRef, normalizeBlobRefJson, type BlobRefJson } from '../media/blob';
```

Add `coverImage` to `PublishInput` (after `description?: string;`):

```ts
	description?: string;
	/** Optional explicit per-article cover; overrides the first-content-image thumb. */
	coverImage?: BlobRefJson;
```

In `publish()`, step 1 document create, add `coverImage` to the `buildDocumentRecord` args (after `publishedAt: now,`):

```ts
					publishedAt: now,
					coverImage: input.coverImage,
					description,
```

In `publish()`, step 2, change the thumb line:

```ts
				// Prefer the writer's explicit cover; else reuse the first uploaded image (Decision 0014).
				thumb: input.coverImage ?? firstImageBlobRef( input.blocks ),
```

In `publish()`, step 3 putRecord, add `coverImage` to the `buildDocumentRecord` args (after `publishedAt: now,`):

```ts
					publishedAt: now,
					coverImage: input.coverImage,
					description,
					bskyPostRef,
```

Add `coverImage` to `UpdateInput` (after `description?: string;`):

```ts
	description?: string;
	/** Optional explicit per-article cover (design 2026-06-10). */
	coverImage?: BlobRefJson;
```

In `updateDocument()`, add `coverImage` to the `buildDocumentRecord` args (after `publishedAt: input.publishedAt,`):

```ts
					publishedAt: input.publishedAt,
					coverImage: input.coverImage,
					description,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/publish/publisher.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/publisher.ts src/lib/publish/publisher.test.ts
git commit --no-gpg-sign -m "Prefer explicit cover over first image and persist it on publish/update"
```

---

## Task 5: Read `coverImage` back on edit-load

**Files:**
- Modify: `src/lib/publish/publisher.ts` (`MyArticle`, `RawDocValue`, `toMyArticle`)
- Test: `src/lib/publish/publisher.test.ts` (`getMyArticle` describe)

- [ ] **Step 1: Write the failing test**

In `src/lib/publish/publisher.test.ts`, inside `describe( 'getMyArticle', () => {`, add this test (the `repo()` helper already exists in that describe):

```ts
	it( 'round-trips the stored coverImage as a normalized blob ref', async () => {
		const { agent } = mockAgent( {
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
					value: {
						title: 'In A',
						site: `at://${ DID }/site.standard.publication/pub1`,
						coverImage: {
							$type: 'blob',
							ref: { $link: 'bafycover' },
							mimeType: 'image/png',
							size: 4242,
						},
					},
				},
			],
		} );
		const article = await getMyArticle( agent, DID, 'd1' );
		expect( article?.coverImage ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafycover' },
			mimeType: 'image/png',
			size: 4242,
		} );
	} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/publish/publisher.test.ts`
Expected: FAIL — `article.coverImage` is `undefined` (not yet read).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/publish/publisher.ts`:

Add `coverImage` to the `MyArticle` interface (after `bskyPostRef?: StrongRef;`):

```ts
	bskyPostRef?: StrongRef;
	/** The stored per-article cover blob ref, normalized for re-preview on edit. */
	coverImage?: BlobRefJson;
	blocks: BlockNode[];
```

Add `coverImage` to `RawDocValue` (after `bskyPostRef?: StrongRef;`):

```ts
	bskyPostRef?: StrongRef;
	coverImage?: unknown;
	content?: { blocks?: BlockNode[] };
```

In `toMyArticle`, add the normalized field to the returned object (after `bskyPostRef: value.bskyPostRef,`):

```ts
		bskyPostRef: value.bskyPostRef,
		coverImage: normalizeBlobRefJson( value.coverImage ),
		blocks: value.content?.blocks ?? [],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/publish/publisher.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/publisher.ts src/lib/publish/publisher.test.ts
git commit --no-gpg-sign -m "Read coverImage back from the document on edit-load"
```

---

## Task 6: Forward `coverImage` through PublishPanel

**Files:**
- Modify: `src/components/PublishPanel.tsx`
- Test: `src/components/PublishPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/components/PublishPanel.test.tsx`, replace the `clickUpdate` helper signature to accept an optional cover and pass it, then add an assertion. Change the helper to:

```ts
async function clickUpdate( description: string, coverImage?: unknown ) {
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
```

Add a new test inside `describe( 'PublishPanel', () => {`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/PublishPanel.test.tsx`
Expected: FAIL — `coverImage` is not a prop of `PublishPanel`, and `updateDocument` is not called with it.

- [ ] **Step 3: Write minimal implementation**

In `src/components/PublishPanel.tsx`:

Add the import for the type (extend the existing records import on line 10):

```ts
import { normalizeBlocks, type StrongRef } from '../lib/publish/records';
import type { BlobRefJson } from '../lib/media/blob';
```

Add the prop to the `Props` interface (after `description: string;`):

```ts
	/** The lede / excerpt for the document + Bluesky-card description (blank → auto-derived). */
	description: string;
	/** Optional explicit per-article cover blob ref to persist + use as the card thumb. */
	coverImage?: BlobRefJson;
	/** Called after a successful publish/update so the parent can refresh. */
	onComplete?: () => void;
```

Destructure it in the component signature (after `description,`):

```ts
	title,
	description,
	coverImage,
	onComplete,
}: Props ) {
```

Pass it to `updateDocument` (in the `if ( editing )` branch, after `blocks: prepared,`):

```ts
					blocks: prepared,
					coverImage,
				} );
```

Pass it to `publish` (in the `else` branch, after `publicationSlug: pub.slug,`):

```ts
						publicationSlug: pub.slug,
						coverImage,
					} );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/PublishPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PublishPanel.tsx src/components/PublishPanel.test.tsx
git commit --no-gpg-sign -m "Forward coverImage through PublishPanel to publish/update"
```

---

## Task 7: `CoverImagePicker` component

**Files:**
- Create: `src/components/CoverImagePicker.tsx`
- Test: `src/components/CoverImagePicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/CoverImagePicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { CoverUpload } from '../lib/media/cover';
import CoverImagePicker from './CoverImagePicker';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

function mount( props: {
	cover: CoverUpload | null;
	onUpload: ( file: File ) => Promise< CoverUpload >;
	onChange: ( cover: CoverUpload | null ) => void;
} ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	act( () => {
		root.render( createElement( CoverImagePicker, props ) );
	} );
	return {
		container,
		cleanup: () => {
			root.unmount();
			container.remove();
		},
	};
}

function setFiles( input: HTMLInputElement, files: File[] ) {
	Object.defineProperty( input, 'files', { value: files, configurable: true } );
	input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
}

const onUpload = vi.fn< [ File ], Promise< CoverUpload > >();
const onChange = vi.fn();

beforeEach( () => {
	onUpload.mockReset();
	onChange.mockReset();
} );

describe( 'CoverImagePicker', () => {
	it( 'shows the empty state with the fallback hint and the 1 MB cap', () => {
		const { container, cleanup } = mount( { cover: null, onUpload, onChange } );
		expect( container.textContent ).toMatch( /first image in your article/i );
		expect( container.textContent ).toMatch( /1 MB/i );
		cleanup();
	} );

	it( 'renders a preview and a Remove control when a cover is set', () => {
		const cover: CoverUpload = {
			ref: { $type: 'blob', ref: { $link: 'bafyc' }, mimeType: 'image/png', size: 10 },
			previewUrl: 'data:image/png;base64,AAA',
		};
		const { container, cleanup } = mount( { cover, onUpload, onChange } );
		const img = container.querySelector( 'img' )!;
		expect( img.getAttribute( 'src' ) ).toBe( 'data:image/png;base64,AAA' );
		const remove = Array.from( container.querySelectorAll( 'button' ) ).find(
			( b ) => b.textContent === 'Remove'
		)!;
		act( () => {
			remove.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) );
		} );
		expect( onChange ).toHaveBeenCalledWith( null );
		cleanup();
	} );

	it( 'rejects an oversize file inline without uploading', () => {
		const { container, cleanup } = mount( { cover: null, onUpload, onChange } );
		const input = container.querySelector( 'input[type="file"]' ) as HTMLInputElement;
		const big = new File( [ new Uint8Array( 1_000_001 ) ], 'big.png', { type: 'image/png' } );
		act( () => {
			setFiles( input, [ big ] );
		} );
		expect( container.textContent ).toMatch( /too large/i );
		expect( onUpload ).not.toHaveBeenCalled();
		cleanup();
	} );

	it( 'uploads a valid file and reports the result via onChange', async () => {
		const result: CoverUpload = {
			ref: { $type: 'blob', ref: { $link: 'bafynew' }, mimeType: 'image/png', size: 20 },
			previewUrl: 'data:image/png;base64,BBB',
		};
		onUpload.mockResolvedValue( result );
		const { container, cleanup } = mount( { cover: null, onUpload, onChange } );
		const input = container.querySelector( 'input[type="file"]' ) as HTMLInputElement;
		const ok = new File( [ 'x' ], 'ok.png', { type: 'image/png' } );
		await act( async () => {
			setFiles( input, [ ok ] );
		} );
		expect( onUpload ).toHaveBeenCalledTimes( 1 );
		expect( onChange ).toHaveBeenCalledWith( result );
		cleanup();
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/CoverImagePicker.test.tsx`
Expected: FAIL — cannot resolve `./CoverImagePicker`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/CoverImagePicker.tsx`:

```tsx
import { useRef, useState } from 'react';
import { validateCoverFile, type CoverUpload } from '../lib/media/cover';

interface Props {
	/** The currently chosen cover, or `null` when none is set. */
	cover: CoverUpload | null;
	/** Upload a chosen file to the PDS; resolves with the persistable ref + a preview URL. */
	onUpload: ( file: File ) => Promise< CoverUpload >;
	/** Report the new cover (or `null` when removed) to the parent. */
	onChange: ( cover: CoverUpload | null ) => void;
}

/**
 * The per-article cover image picker, shown below the editor (outside the block canvas).
 * Reuses the same PDS upload path as content images via `onUpload`. Surfaces the 1 MB cap as
 * helper text AND as the rejection message, and — when no cover is set — makes the
 * "first body image" fallback visible (design 2026-06-10).
 */
export default function CoverImagePicker( { cover, onUpload, onChange }: Props ) {
	const inputRef = useRef< HTMLInputElement >( null );
	const [ uploading, setUploading ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	async function handleFiles( files: FileList | null ) {
		const file = files?.[ 0 ];
		if ( ! file ) {
			return;
		}
		const validationError = validateCoverFile( file );
		if ( validationError ) {
			setError( validationError );
			return;
		}
		setError( null );
		setUploading( true );
		try {
			const next = await onUpload( file );
			onChange( next );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
		} finally {
			setUploading( false );
			// Let the writer re-select the same file after a remove/replace.
			if ( inputRef.current ) {
				inputRef.current.value = '';
			}
		}
	}

	return (
		<section className="studio__cover" aria-label="Cover image">
			<span className="studio__cover-label">Cover image</span>

			{ cover ? (
				<div className="studio__cover-preview">
					<img className="studio__cover-image" src={ cover.previewUrl } alt="" />
					<div className="studio__cover-actions">
						<button
							type="button"
							onClick={ () => inputRef.current?.click() }
							disabled={ uploading }
						>
							{ uploading ? 'Uploading…' : 'Replace' }
						</button>
						<button
							type="button"
							onClick={ () => {
								setError( null );
								onChange( null );
							} }
							disabled={ uploading }
						>
							Remove
						</button>
					</div>
				</div>
			) : (
				<div className="studio__cover-empty">
					<button
						type="button"
						onClick={ () => inputRef.current?.click() }
						disabled={ uploading }
					>
						{ uploading ? 'Uploading…' : 'Upload cover image' }
					</button>
					<p className="studio__cover-hint">
						No cover set — the first image in your article will be used. PNG, JPG,
						or GIF, max 1 MB.
					</p>
				</div>
			) }

			<input
				ref={ inputRef }
				className="studio__cover-input"
				type="file"
				accept="image/*"
				hidden
				onChange={ ( event ) => void handleFiles( event.target.files ) }
			/>

			{ error && (
				<p className="studio__cover-error" role="alert">
					{ error }
				</p>
			) }
		</section>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/CoverImagePicker.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CoverImagePicker.tsx src/components/CoverImagePicker.test.tsx
git commit --no-gpg-sign -m "Add CoverImagePicker component"
```

---

## Task 8: Wire the picker into Studio

**Files:**
- Modify: `src/components/Studio.tsx`

This is integration wiring (no new unit test — covered by the component + publisher tests and the final smoke check). Make each edit exactly.

- [ ] **Step 1: Add imports**

In `src/components/Studio.tsx`, after the existing `import PublishPanel from './PublishPanel';` line, add:

```ts
import CoverImagePicker from './CoverImagePicker';
```

And after the `import { createMediaUpload, ... } from '../lib/media/mediaUpload';` line, add:

```ts
import {
	coverPreviewUrl,
	uploadCoverViaMedia,
	type CoverUpload,
} from '../lib/media/cover';
```

- [ ] **Step 2: Add cover state**

After the `const [ editing, setEditing ] = useState< MyArticle | null >( null );` line, add:

```ts
	const [ cover, setCover ] = useState< CoverUpload | null >( null );
```

- [ ] **Step 3: Hydrate cover on edit-load**

In the `getMyArticle( agent, did, rkey ).then( ( article ) => {` callback, inside the `if ( article ) {` block, after `setExcerpt( article.description ?? '' );`, add:

```ts
						if ( article.coverImage && pdsUrl ) {
							setCover( {
								ref: article.coverImage,
								previewUrl: coverPreviewUrl( article.coverImage, { pdsUrl, did } ),
							} );
						}
```

Then add `pdsUrl` to that effect's dependency array — change `}, [ agent, did ] );` (the one closing the edit-load effect) to:

```ts
	}, [ agent, did, pdsUrl ] );
```

- [ ] **Step 4: Build the cover uploader**

After the `const mediaUpload = useMemo( ... );` block, add:

```ts
	const uploadCover = useMemo( () => {
		if ( ! mediaUpload ) {
			return undefined;
		}
		return ( file: File ) => uploadCoverViaMedia( file, mediaUpload, registry );
	}, [ mediaUpload, registry ] );
```

- [ ] **Step 5: Clear cover on "New article" and after a new publish**

In the `startNew` function, after `setBlocks( [] );`, add:

```ts
			setCover( null );
```

In the `PublishPanel` `onComplete` callback, inside the `if ( ! editing ) {` block, after `setBlocks( [] );`, add:

```ts
								setCover( null );
```

- [ ] **Step 6: Pass coverImage to PublishPanel and render the picker**

Add the `coverImage` prop to `<PublishPanel ... />` — after the `description={ excerpt }` line, add:

```tsx
						description={ excerpt }
						coverImage={ cover?.ref }
```

After the `<SkyEditor ... />` element (before the closing `</div>` of the keyed wrapper), add:

```tsx
						{ uploadCover && (
							<CoverImagePicker
								cover={ cover }
								onUpload={ uploadCover }
								onChange={ setCover }
							/>
						) }
```

- [ ] **Step 7: Type-check + full test run**

Run: `npm run check`
Expected: no type errors.

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/Studio.tsx
git commit --no-gpg-sign -m "Wire cover image picker into the Studio editor"
```

---

## Task 9: Style the cover picker strip

**Files:**
- Modify: `src/styles/editor-chrome.css`

- [ ] **Step 1: Add styles**

Append to `src/styles/editor-chrome.css` (after the editor-surface rules), matching the existing centered-column convention used by `.studio__lede` and `.skypress-editor`:

```css
/* Cover image picker — a labeled strip below the editor, in the shared content
   column. Distinct from the editor canvas; the chosen image is the article's
   explicit cover (else the first body image is used). */
.studio__cover {
	max-width: var(--studio-measure);
	margin: 0 auto 3rem;
	padding: 0 var(--studio-gutter);
}
.studio__cover-label {
	display: block;
	margin-bottom: 0.5rem;
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--ink);
}
.studio__cover-empty {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	align-items: flex-start;
}
.studio__cover-hint {
	margin: 0;
	font-size: 0.8rem;
	color: var(--muted);
}
.studio__cover-preview {
	display: flex;
	flex-direction: column;
	gap: 0.6rem;
	align-items: flex-start;
}
.studio__cover-image {
	max-width: 100%;
	max-height: 18rem;
	border: 1px solid var(--line-strong);
	border-radius: var(--radius);
}
.studio__cover-actions {
	display: flex;
	gap: 0.6rem;
}
.studio__cover-error {
	margin: 0.5rem 0 0;
	font-size: 0.8rem;
	color: var(--danger, #c0392b);
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds (CSS is global; no scoping errors).

- [ ] **Step 3: Commit**

```bash
git add src/styles/editor-chrome.css
git commit --no-gpg-sign -m "Style the cover image picker strip"
```

---

## Task 10: Decision record + final verification

**Files:**
- Create: `docs/decisions/NNNN-cover-image-picker.md` (next number after the highest existing)

- [ ] **Step 1: Determine the next decision number**

Run: `ls docs/decisions | sort | tail -3`
Use the next integer after the highest `NNNN-*.md` (e.g. if `0015-*` is highest, create `0016-cover-image-picker.md`).

- [ ] **Step 2: Write the decision record**

Create `docs/decisions/<NNNN>-cover-image-picker.md`:

```markdown
# <NNNN>. Per-article cover image picker

**Status:** Accepted
**Date:** 2026-06-10

## Context

Until now the Bluesky card thumb was auto-derived from the first usable content
image (`firstImageBlobRef`, Decision 0014), and articles had no explicit cover.
The standard `site.standard.document` lexicon already defines an optional
`coverImage` blob field (`image/*`, ≤1MB) that was never populated (deferred in
Decisions 0006 and 0014).

## Decision

Add a per-article cover image picker as a strip BELOW the block editor (outside
the editor canvas). It reuses the existing `mediaUpload` + blob-registry path
(no second isolated-block-editor instance) and writes the chosen blob to
`site.standard.document.coverImage`.

Thumb resolution becomes: explicit `coverImage` → `firstImageBlobRef(blocks)` →
omit. The auto-pick is now the fallback, so nothing regresses for articles
without an explicit cover.

The 1MB cap (equal to `BSKY_THUMB_MAX_BYTES` and the lexicon `maxSize`) is
surfaced in the picker UI as helper text and as the oversize rejection message.

## Consequences

- Covers persist on the document, survive edits (re-previewed via `getBlob`), and
  become available to future reading-page/OG/RSS surfaces (still unwired —
  separate follow-up; see the 2026-06-09 OG design which deferred this field).
- This partially supersedes Decision 0014: the first-image pick is retained only
  as the fallback when no explicit cover is set.
- Consuming `coverImage` on the reading page / OG tags remains out of scope.
```

- [ ] **Step 3: Full verification**

Run: `npm run check`
Expected: no type errors.

Run: `npm test`
Expected: all suites PASS.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual browser smoke (per global CLAUDE.md — Chrome DevTools MCP)**

Serve dev on `http://127.0.0.1:<port>` (atproto loopback requirement), sign in, and confirm:
- The "Cover image" strip appears below the editor with the "max 1 MB" hint.
- Uploading a small image shows a preview; "Remove" returns to the empty state with the fallback hint.
- An oversize image shows the "too large" error and does not upload.
- Publishing an article with a cover sets the document `coverImage` and the post thumb to that image; publishing without one falls back to the first body image.
- Editing a published article with a cover re-shows it in the picker.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/*-cover-image-picker.md
git commit --no-gpg-sign -m "Record cover image picker decision"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** data model (Task 3), thumb fallback (Task 4), edit reload (Task 5), picker UI + max-size + remove hint (Task 7), wiring (Task 8), styling (Task 9). All spec sections map to a task.
- **Type consistency:** `CoverUpload` (cover.ts) is the single shape passed picker→Studio; only `cover.ref` (a `BlobRefJson`) crosses into PublishPanel/publisher. `coverImage` is the consistent field name across `DocumentRecord`, `PublishInput`, `UpdateInput`, `MyArticle`, and the `PublishPanel` prop.
- **Fallback chain** is written exactly once, in `publish()`: `input.coverImage ?? firstImageBlobRef( input.blocks )`.
```
