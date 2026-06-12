# Editor @mentions + Bluesky mention notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a writer `@`-mention atproto users in the article body; render those mentions as profile links, and notify the mentioned users via `#mention` facets on the companion Bluesky post.

**Architecture:** A registered `skypress/mention` rich-text format stores the mention inline in the block tree as `<a class="skypress-mention" href="https://bsky.app/profile/{handle}" data-did="{did}">@{handle}</a>` — the single source of truth. At publish, we scan blocks for these anchors and derive three outputs: (1) the companion `app.bsky.feed.post` body gains the lede + a `cc @a @b` line with `#mention` facets (the notification), (2) the `blog.skypress.content.gutenberg` content object gains a flat `mentions` list (interop), (3) the article render gets the link for free (verbatim content pass-through). The reader's sanitizer strips `data-did` but keeps the `class` + `href`, yielding a clean profile link.

**Tech Stack:** TypeScript, Astro, React 18, `@automattic/isolated-block-editor@2.30.0`, `@wordpress/rich-text@7.24.0`, `@wordpress/block-editor@14.19.0`, `@wordpress/hooks`, `@atproto/api`, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-12-editor-mentions-design.md`

---

## File Structure

**New files:**
- `src/lib/publish/grapheme.ts` — `graphemeLength()` util (Intl.Segmenter).
- `src/lib/publish/grapheme.test.ts`
- `src/lib/publish/mentions.ts` — `Mention` type + `collectMentions(blocks)`.
- `src/lib/publish/mentions.test.ts`
- `src/lib/publish/post-text.ts` — `assemblePostText()` (shared text+facet assembly).
- `src/lib/publish/post-text.test.ts`
- `src/lib/editor/mention-format.ts` — `registerMentionFormat()`.
- `src/lib/editor/mention-format.test.ts`
- `src/lib/editor/mention-autocompleter.ts` — completer + `registerMentionAutocompleter()`.
- `src/lib/editor/mention-autocompleter.test.ts`
- `docs/decisions/0019-editor-mentions.md` — decision record.

**Modified files:**
- `src/lib/publish/records.ts` — `buildBskyPost` (use `assemblePostText`, add `bodyLede`/`mentions`); `buildContentObject` + `buildDocumentRecord` (+ optional `mentions`); `GutenbergContent` type.
- `src/lib/publish/publisher.ts` — wire `collectMentions` + `bodyLede` into `publish()` and `updateDocument()`.
- `lexicons/blog.skypress.content.gutenberg.json` — document optional `mentions` field.
- `src/components/SkyEditor.tsx` — call `registerMentionFormat()` + `registerMentionAutocompleter()`.
- `src/components/PublishPanel.tsx` — grapheme counter + confirm-dialog mention disclosure.
- `src/lib/blocks/render.test.ts` — fidelity assertion for a mention-bearing block.
- `src/lib/reader/sanitize.test.ts` — assert `data-did` stripped, `class` + `href` kept.

**Note on test command:** `npm run test` runs `vitest run` (all tests). To run one file: `npx vitest run src/lib/publish/grapheme.test.ts`. To run by name: `npx vitest run -t "graphemeLength"`.

---

## Phase 1 — Publish-side core (pure, fully TDD)

This phase delivers the notification mechanism. Tests synthesize blocks containing mention anchors directly (the editor that produces them comes in Phase 2), so everything here is unit-testable now.

### Task 1: Grapheme length utility

**Files:**
- Create: `src/lib/publish/grapheme.ts`
- Test: `src/lib/publish/grapheme.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/publish/grapheme.test.ts
import { describe, expect, it } from 'vitest';
import { graphemeLength } from './grapheme';

describe( 'graphemeLength', () => {
	it( 'counts ASCII characters one-for-one', () => {
		expect( graphemeLength( 'hello' ) ).toBe( 5 );
	} );

	it( 'counts an emoji as a single grapheme', () => {
		// "👍" is 2 UTF-16 code units / 4 UTF-8 bytes but one grapheme.
		expect( graphemeLength( '👍' ) ).toBe( 1 );
	} );

	it( 'counts a multi-codepoint emoji cluster as one grapheme', () => {
		// Family emoji = several codepoints joined by ZWJ, still one grapheme.
		expect( graphemeLength( '👨‍👩‍👧' ) ).toBe( 1 );
	} );

	it( 'returns 0 for the empty string', () => {
		expect( graphemeLength( '' ) ).toBe( 0 );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/publish/grapheme.test.ts`
Expected: FAIL — "Failed to resolve import './grapheme'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/publish/grapheme.ts

/**
 * Count graphemes (user-perceived characters) the way Bluesky counts toward its
 * 300-character post limit — emoji and ZWJ clusters count as one, not as their
 * UTF-16 length or byte length.
 */
export function graphemeLength( text: string ): number {
	const segmenter = new Intl.Segmenter( undefined, { granularity: 'grapheme' } );
	let count = 0;
	for ( const _segment of segmenter.segment( text ) ) {
		count++;
	}
	return count;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/publish/grapheme.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/grapheme.ts src/lib/publish/grapheme.test.ts
git commit --no-gpg-sign -m "Add graphemeLength util for Bluesky post limit"
```

---

### Task 2: Collect mentions from the block tree

`collectMentions` scans every string attribute of every block (recursively) for `<a data-did="…">` anchors — the mention markers — using `DOMParser` (available in both jsdom tests and the browser publish path). Dedupes by DID, preserves first-appearance order.

**Files:**
- Create: `src/lib/publish/mentions.ts`
- Test: `src/lib/publish/mentions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/publish/mentions.test.ts
import { describe, expect, it } from 'vitest';
import { collectMentions } from './mentions';
import type { BlockNode } from '../blocks/render';

function para( content: string ): BlockNode {
	return { name: 'core/paragraph', attributes: { content }, innerBlocks: [] };
}

const MENTION = (
	handle: string,
	did: string
) => `<a class="skypress-mention" href="https://bsky.app/profile/${ handle }" data-did="${ did }">@${ handle }</a>`;

describe( 'collectMentions', () => {
	it( 'extracts did, handle, and display text from a mention anchor', () => {
		const blocks = [ para( `Thanks ${ MENTION( 'alice.bsky.social', 'did:plc:alice' ) }!` ) ];
		expect( collectMentions( blocks ) ).toEqual( [
			{ did: 'did:plc:alice', handle: 'alice.bsky.social', displayText: '@alice.bsky.social' },
		] );
	} );

	it( 'ignores ordinary links that are not mentions', () => {
		const blocks = [ para( 'See <a href="https://example.com">the docs</a>.' ) ];
		expect( collectMentions( blocks ) ).toEqual( [] );
	} );

	it( 'dedupes by DID, keeping first-appearance order', () => {
		const blocks = [
			para( `${ MENTION( 'bob.bsky.social', 'did:plc:bob' ) }` ),
			para( `${ MENTION( 'alice.bsky.social', 'did:plc:alice' ) }` ),
			para( `again ${ MENTION( 'bob.bsky.social', 'did:plc:bob' ) }` ),
		];
		expect( collectMentions( blocks ).map( ( m ) => m.handle ) ).toEqual( [
			'bob.bsky.social',
			'alice.bsky.social',
		] );
	} );

	it( 'recurses into innerBlocks', () => {
		const blocks: BlockNode[] = [
			{
				name: 'core/quote',
				attributes: {},
				innerBlocks: [ para( `${ MENTION( 'carol.bsky.social', 'did:plc:carol' ) }` ) ],
			},
		];
		expect( collectMentions( blocks ).map( ( m ) => m.did ) ).toEqual( [ 'did:plc:carol' ] );
	} );

	it( 'returns [] when there are no blocks', () => {
		expect( collectMentions( [] ) ).toEqual( [] );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/publish/mentions.test.ts`
Expected: FAIL — "Failed to resolve import './mentions'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/publish/mentions.ts
import type { BlockNode } from '../blocks/render';

export interface Mention {
	did: string;
	handle: string;
	/** The visible mention text in the article (defaults to `@{handle}`). */
	displayText: string;
}

const PROFILE_RE = /^https?:\/\/bsky\.app\/profile\/(.+)$/;

/**
 * Scan a block tree for `skypress/mention` anchors (`<a data-did="…">`) and return
 * the mentioned accounts, deduped by DID in first-appearance order. These anchors are
 * the single source of truth for who gets cc'd on the companion Bluesky post and for
 * the document's flat `mentions` list.
 */
export function collectMentions( blocks: BlockNode[] ): Mention[] {
	const out: Mention[] = [];
	const seen = new Set< string >();
	walk( blocks, out, seen );
	return out;
}

function walk( blocks: BlockNode[], out: Mention[], seen: Set< string > ): void {
	for ( const block of blocks ) {
		for ( const value of Object.values( block.attributes ?? {} ) ) {
			if ( typeof value === 'string' && value.includes( 'data-did' ) ) {
				extractFrom( value, out, seen );
			}
		}
		walk( block.innerBlocks ?? [], out, seen );
	}
}

function extractFrom( html: string, out: Mention[], seen: Set< string > ): void {
	const doc = new DOMParser().parseFromString( html, 'text/html' );
	for ( const anchor of Array.from( doc.querySelectorAll( 'a[data-did]' ) ) ) {
		const did = anchor.getAttribute( 'data-did' );
		if ( ! did || seen.has( did ) ) {
			continue;
		}
		const href = anchor.getAttribute( 'href' ) ?? '';
		const match = href.match( PROFILE_RE );
		const text = anchor.textContent ?? '';
		const handle = match ? match[ 1 ] : text.replace( /^@/, '' );
		seen.add( did );
		out.push( { did, handle, displayText: text || `@${ handle }` } );
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/publish/mentions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/mentions.ts src/lib/publish/mentions.test.ts
git commit --no-gpg-sign -m "Add collectMentions to scan blocks for mention anchors"
```

---

### Task 3: Assemble post text + facets (shared)

`assemblePostText` is the single source for the companion post's `text` and its `facets`. It is used by `buildBskyPost` (Task 4) and the grapheme counter (Task 9), so the on-screen count and the published post never drift. It computes UTF-8 byte offsets exactly during assembly (no fragile `indexOf`).

**Files:**
- Create: `src/lib/publish/post-text.ts`
- Test: `src/lib/publish/post-text.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/publish/post-text.test.ts
import { describe, expect, it } from 'vitest';
import { assemblePostText } from './post-text';

const URL = 'https://skypress.blog/@me/pub/3kabcde12345';

function bytes( s: string ): number {
	return new TextEncoder().encode( s ).length;
}

describe( 'assemblePostText', () => {
	it( 'with no lede or mentions, is title + URL (back-compat)', () => {
		const { text, facets } = assemblePostText( { title: 'Hello', articleUrl: URL } );
		expect( text ).toBe( `Hello\n\n${ URL }` );
		expect( facets ).toHaveLength( 1 );
		const link = facets[ 0 ];
		expect( link.features[ 0 ] ).toEqual( {
			$type: 'app.bsky.richtext.facet#link',
			uri: URL,
		} );
		expect( link.index.byteStart ).toBe( bytes( 'Hello\n\n' ) );
		expect( link.index.byteEnd ).toBe( bytes( 'Hello\n\n' ) + bytes( URL ) );
	} );

	it( 'includes the lede between title and URL when provided', () => {
		const { text } = assemblePostText( {
			title: 'Hello',
			articleUrl: URL,
			bodyLede: 'A short lede.',
		} );
		expect( text ).toBe( `Hello\n\nA short lede.\n\n${ URL }` );
	} );

	it( 'adds a cc line with a mention facet per handle', () => {
		const { text, facets } = assemblePostText( {
			title: 'Hi',
			articleUrl: URL,
			mentions: [
				{ did: 'did:plc:a', handle: 'alice.bsky.social', displayText: '@alice.bsky.social' },
				{ did: 'did:plc:b', handle: 'bob.bsky.social', displayText: '@bob.bsky.social' },
			],
		} );
		expect( text ).toBe( `Hi\n\ncc @alice.bsky.social @bob.bsky.social\n\n${ URL }` );

		const mentions = facets.filter(
			( f ) => f.features[ 0 ].$type === 'app.bsky.richtext.facet#mention'
		);
		expect( mentions ).toHaveLength( 2 );

		// @alice.bsky.social byte range must point exactly at that token.
		const ccPrefix = 'Hi\n\ncc ';
		const aliceStart = bytes( ccPrefix );
		expect( mentions[ 0 ].index ).toEqual( {
			byteStart: aliceStart,
			byteEnd: aliceStart + bytes( '@alice.bsky.social' ),
		} );
		expect( mentions[ 0 ].features[ 0 ] ).toEqual( {
			$type: 'app.bsky.richtext.facet#mention',
			did: 'did:plc:a',
		} );
	} );

	it( 'computes correct byte offsets with a multibyte title (emoji)', () => {
		const title = '🚀 Launch';
		const { text, facets } = assemblePostText( {
			title,
			articleUrl: URL,
			mentions: [
				{ did: 'did:plc:a', handle: 'alice.bsky.social', displayText: '@alice.bsky.social' },
			],
		} );
		const mention = facets.find(
			( f ) => f.features[ 0 ].$type === 'app.bsky.richtext.facet#mention'
		)!;
		const prefix = `${ title }\n\ncc `;
		expect( mention.index.byteStart ).toBe( bytes( prefix ) );
		// Sanity: slicing the UTF-8 buffer at the facet range yields the handle.
		const buf = new TextEncoder().encode( text );
		const slice = new TextDecoder().decode(
			buf.slice( mention.index.byteStart, mention.index.byteEnd )
		);
		expect( slice ).toBe( '@alice.bsky.social' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/publish/post-text.test.ts`
Expected: FAIL — "Failed to resolve import './post-text'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/publish/post-text.ts
import type { Mention } from './mentions';

/** A richtext facet over a UTF-8 byte range of the post text. */
export interface PostFacet {
	$type: 'app.bsky.richtext.facet';
	index: { byteStart: number; byteEnd: number };
	features: Array<
		| { $type: 'app.bsky.richtext.facet#link'; uri: string }
		| { $type: 'app.bsky.richtext.facet#mention'; did: string }
	>;
}

const SEP = '\n\n';

function utf8ByteLength( value: string ): number {
	return new TextEncoder().encode( value ).length;
}

/**
 * Build the companion Bluesky post's `text` and `facets`. The body is
 * `title \n\n {lede?} \n\n cc @a @b \n\n {url}`, with the lede omitted when blank and the
 * cc line omitted when there are no mentions. Byte offsets are computed during assembly so
 * the link and mention facets always line up with the final UTF-8 string.
 */
export function assemblePostText( input: {
	title: string;
	articleUrl: string;
	bodyLede?: string;
	mentions?: Mention[];
} ): { text: string; facets: PostFacet[] } {
	const mentions = input.mentions ?? [];
	const lede = input.bodyLede?.trim() ?? '';
	const ccLine = mentions.length
		? `cc ${ mentions.map( ( m ) => `@${ m.handle }` ).join( ' ' ) }`
		: '';

	const segments: string[] = [ input.title ];
	if ( lede ) {
		segments.push( lede );
	}
	if ( ccLine ) {
		segments.push( ccLine );
	}
	segments.push( input.articleUrl );

	const text = segments.join( SEP );

	// Byte start of each segment in the joined string.
	const segByteStart: number[] = [];
	let cursor = 0;
	segments.forEach( ( segment, i ) => {
		if ( i > 0 ) {
			cursor += utf8ByteLength( SEP );
		}
		segByteStart[ i ] = cursor;
		cursor += utf8ByteLength( segment );
	} );

	const facets: PostFacet[] = [];

	// Mention facets (each @handle inside the cc line).
	if ( ccLine ) {
		const ccIndex = segments.indexOf( ccLine );
		let local = utf8ByteLength( 'cc ' );
		mentions.forEach( ( mention, i ) => {
			if ( i > 0 ) {
				local += utf8ByteLength( ' ' );
			}
			const token = `@${ mention.handle }`;
			const byteStart = segByteStart[ ccIndex ] + local;
			facets.push( {
				$type: 'app.bsky.richtext.facet',
				index: { byteStart, byteEnd: byteStart + utf8ByteLength( token ) },
				features: [ { $type: 'app.bsky.richtext.facet#mention', did: mention.did } ],
			} );
			local += utf8ByteLength( token );
		} );
	}

	// Link facet (the article URL, always the last segment).
	const urlIndex = segments.length - 1;
	const urlStart = segByteStart[ urlIndex ];
	facets.push( {
		$type: 'app.bsky.richtext.facet',
		index: { byteStart: urlStart, byteEnd: urlStart + utf8ByteLength( input.articleUrl ) },
		features: [ { $type: 'app.bsky.richtext.facet#link', uri: input.articleUrl } ],
	} );

	return { text, facets };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/publish/post-text.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/post-text.ts src/lib/publish/post-text.test.ts
git commit --no-gpg-sign -m "Add assemblePostText: post body + link/mention facets"
```

---

### Task 4: Rewire `buildBskyPost` onto `assemblePostText`

Replace `buildBskyPost`'s inline text/facet construction with `assemblePostText`, and add optional `bodyLede` + `mentions`. The `description` parameter still feeds **only** the embed card. Existing callers/tests that pass neither `bodyLede` nor `mentions` get byte-identical output (title + URL + one link facet).

**Files:**
- Modify: `src/lib/publish/records.ts:256-310` (the `utf8ByteLength` helper + `buildBskyPost`)
- Test: `src/lib/publish/records.test.ts` (add cases)

- [ ] **Step 1: Write the failing test** (append to `src/lib/publish/records.test.ts`)

```typescript
// Append inside src/lib/publish/records.test.ts (it already imports buildBskyPost).
describe( 'buildBskyPost — lede + mentions', () => {
	const URL = 'https://skypress.blog/@me/pub/3kabcde12345';

	it( 'keeps the card description separate from the post body', () => {
		const post = buildBskyPost( {
			title: 'Title',
			articleUrl: URL,
			description: 'Card subtitle',
			createdAt: '2026-06-12T00:00:00.000Z',
			bodyLede: 'Body lede',
		} );
		expect( post.text ).toBe( `Title\n\nBody lede\n\n${ URL }` );
		expect( post.embed.external.description ).toBe( 'Card subtitle' );
	} );

	it( 'emits a mention facet for each cc-ed account', () => {
		const post = buildBskyPost( {
			title: 'Title',
			articleUrl: URL,
			description: 'd',
			createdAt: '2026-06-12T00:00:00.000Z',
			mentions: [
				{ did: 'did:plc:a', handle: 'alice.bsky.social', displayText: '@alice.bsky.social' },
			],
		} );
		expect( post.text ).toContain( 'cc @alice.bsky.social' );
		const hasMention = post.facets.some(
			( f ) => f.features[ 0 ].$type === 'app.bsky.richtext.facet#mention'
		);
		expect( hasMention ).toBe( true );
	} );

	it( 'throws when the assembled post exceeds 300 graphemes', () => {
		const longLede = 'x'.repeat( 320 );
		expect( () =>
			buildBskyPost( {
				title: 'Title',
				articleUrl: URL,
				description: 'd',
				createdAt: '2026-06-12T00:00:00.000Z',
				bodyLede: longLede,
			} )
		).toThrow( /300/ );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/publish/records.test.ts -t "lede + mentions"`
Expected: FAIL — `bodyLede`/`mentions` not accepted; no 300 guard.

- [ ] **Step 3: Edit `buildBskyPost` in `src/lib/publish/records.ts`**

Add imports near the top of the file (with the other imports):

```typescript
import { assemblePostText } from './post-text';
import { graphemeLength } from './grapheme';
import type { Mention } from './mentions';
```

Replace the existing `utf8ByteLength` helper and `buildBskyPost` function (the block currently at `records.ts:256-310`) with:

```typescript
/** UTF-8 byte length — facet offsets are byte-based, not JS string-index based. */
function utf8ByteLength( value: string ): number {
	return new TextEncoder().encode( value ).length;
}

/** Bluesky rejects posts longer than this many graphemes. */
const BSKY_POST_MAX_GRAPHEMES = 300;

/**
 * Build the companion Bluesky post (Decision 0005). Body text + link/mention facets come
 * from `assemblePostText` (shared with the editor's live counter). `description` populates
 * ONLY the embed card subtitle; the writer-typed lede goes in the body via `bodyLede`.
 * `associatedRefs` drive the standard.site rich card (Decision 0013).
 */
export function buildBskyPost( input: {
	title: string;
	articleUrl: string;
	createdAt: string;
	description?: string;
	/** The writer-typed lede, placed in the post body (omitted when blank). */
	bodyLede?: string;
	/** Accounts to cc + notify via #mention facets. */
	mentions?: Mention[];
	/** Optional image blob for the card's `thumb` (the og:image fallback, Decision 0014). */
	thumb?: BlobRefJson;
	/** Document + publication strongRefs, in that order, for the standard.site card. */
	associatedRefs?: StrongRef[];
} ): BskyPostRecord {
	const { text, facets } = assemblePostText( {
		title: input.title,
		articleUrl: input.articleUrl,
		bodyLede: input.bodyLede,
		mentions: input.mentions,
	} );

	const length = graphemeLength( text );
	if ( length > BSKY_POST_MAX_GRAPHEMES ) {
		throw new Error(
			`Bluesky post is ${ length } characters; the limit is ${ BSKY_POST_MAX_GRAPHEMES }. Shorten the subtitle or remove a mention.`
		);
	}

	return {
		$type: 'app.bsky.feed.post',
		text,
		createdAt: input.createdAt,
		facets,
		embed: {
			$type: 'app.bsky.embed.external',
			external: {
				uri: input.articleUrl,
				title: input.title,
				description: input.description ?? '',
				...( input.thumb ? { thumb: input.thumb } : {} ),
				...( input.associatedRefs && input.associatedRefs.length
					? {
							associatedRefs: input.associatedRefs.map( ( ref ) => ( {
								$type: 'com.atproto.repo.strongRef' as const,
								uri: ref.uri,
								cid: ref.cid,
							} ) ),
					  }
					: {} ),
			},
		},
	};
}
```

Then update the `BskyPostRecord.facets` type (around `records.ts:236-254`) so its `facets` accepts both feature kinds. Change the `facets` field type from `BskyLinkFacet[]` to `PostFacet[]`, importing the type:

```typescript
import type { PostFacet } from './post-text';
```

and in `interface BskyPostRecord` replace `facets: BskyLinkFacet[];` with `facets: PostFacet[];`. Leave the now-unused `BskyLinkFacet` interface in place only if other modules import it; otherwise delete it (grep first: `git grep -n BskyLinkFacet`).

- [ ] **Step 4: Run the records tests**

Run: `npx vitest run src/lib/publish/records.test.ts`
Expected: PASS — new cases pass and the pre-existing `buildBskyPost` tests (title + URL, link-facet offsets) still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/records.ts src/lib/publish/records.test.ts
git commit --no-gpg-sign -m "Rewire buildBskyPost onto assemblePostText; add lede + mentions + 300-grapheme guard"
```

---

### Task 5: Store the flat `mentions` list in the content object

**Files:**
- Modify: `src/lib/publish/records.ts` (`GutenbergContent` type, `buildContentObject`, `buildDocumentRecord`)
- Test: `src/lib/publish/records.test.ts`

- [ ] **Step 1: Write the failing test** (append to `records.test.ts`)

```typescript
describe( 'buildContentObject — mentions', () => {
	it( 'omits the mentions field when there are none', () => {
		const content = buildContentObject( BLOCKS );
		expect( 'mentions' in content ).toBe( false );
	} );

	it( 'stores a flat {did, handle} list when mentions are passed', () => {
		const content = buildContentObject( BLOCKS, [
			{ did: 'did:plc:a', handle: 'alice.bsky.social', displayText: '@alice.bsky.social' },
		] );
		expect( content.mentions ).toEqual( [ { did: 'did:plc:a', handle: 'alice.bsky.social' } ] );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/publish/records.test.ts -t "buildContentObject — mentions"`
Expected: FAIL — `buildContentObject` takes one arg; `mentions` not on the type.

- [ ] **Step 3: Edit `records.ts`**

Find the `GutenbergContent` interface and add an optional field:

```typescript
	mentions?: Array< { did: string; handle: string } >;
```

Replace `buildContentObject` (currently `records.ts:141-143`) with:

```typescript
export function buildContentObject(
	blocks: BlockNode[],
	mentions: Mention[] = []
): GutenbergContent {
	return {
		$type: CONTENT_TYPE,
		version: CONTENT_VERSION,
		blocks,
		...( mentions.length
			? { mentions: mentions.map( ( m ) => ( { did: m.did, handle: m.handle } ) ) }
			: {} ),
	};
}
```

In `buildDocumentRecord` (currently `records.ts:195-222`), add `mentions?: Mention[]` to its input type and pass it through:

```typescript
		content: buildContentObject( input.blocks, input.mentions ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/publish/records.test.ts`
Expected: PASS (all, including prior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publish/records.ts src/lib/publish/records.test.ts
git commit --no-gpg-sign -m "Store flat mentions list in blog.skypress.content.gutenberg"
```

---

### Task 6: Wire mentions + lede into `publish()` and `updateDocument()`

**Files:**
- Modify: `src/lib/publish/publisher.ts` (`publish()` at `:68-151`, `updateDocument()` below it)
- Test: `src/lib/publish/publisher.test.ts` (create if absent; otherwise append)

- [ ] **Step 1: Write the failing test**

First check for an existing test file: `ls src/lib/publish/publisher.test.ts`. If it exists, append the `describe` below; if not, create it with this content:

```typescript
// src/lib/publish/publisher.test.ts
import { describe, expect, it, vi } from 'vitest';
import { publish } from './publisher';
import type { BlockNode } from '../blocks/render';

function mentionPara( handle: string, did: string ): BlockNode {
	return {
		name: 'core/paragraph',
		attributes: {
			content: `Hi <a class="skypress-mention" href="https://bsky.app/profile/${ handle }" data-did="${ did }">@${ handle }</a>`,
		},
		innerBlocks: [],
	};
}

/** A fake atproto Agent that records the records it is asked to write. */
function fakeAgent() {
	const created: Array< { collection: string; record: any } > = [];
	let n = 0;
	const repo = {
		createRecord: vi.fn( async ( { collection, record }: any ) => {
			created.push( { collection, record } );
			n++;
			return { data: { uri: `at://did:plc:me/${ collection }/rkey${ n }`, cid: `cid${ n }` } };
		} ),
		putRecord: vi.fn( async ( { collection, record }: any ) => {
			created.push( { collection, record } );
			return { data: { uri: 'at://did:plc:me/doc/rkey', cid: 'cidX' } };
		} ),
	};
	return { agent: { com: { atproto: { repo } } } as any, created };
}

describe( 'publish — mentions', () => {
	it( 'cc's mentioned accounts on the post and stores the flat list on the document', async () => {
		const { agent, created } = fakeAgent();
		await publish(
			agent,
			{ did: 'did:plc:me', handle: 'me.bsky.social' },
			{
				title: 'Hello',
				description: 'My lede',
				blocks: [ mentionPara( 'alice.bsky.social', 'did:plc:alice' ) ],
				publicationUri: 'at://did:plc:me/site.standard.publication/pub',
				publicationCid: 'cidpub',
				publicationSlug: 'pub',
			}
		);

		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record;
		expect( post.text ).toContain( 'My lede' );
		expect( post.text ).toContain( 'cc @alice.bsky.social' );
		expect(
			post.facets.some(
				( f: any ) => f.features[ 0 ].$type === 'app.bsky.richtext.facet#mention'
			)
		).toBe( true );

		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record;
		expect( doc.content.mentions ).toEqual( [
			{ did: 'did:plc:alice', handle: 'alice.bsky.social' },
		] );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/publish/publisher.test.ts`
Expected: FAIL — post body lacks the lede + cc line; `doc.content.mentions` undefined.

- [ ] **Step 3: Edit `publisher.ts`**

Add the import near the top:

```typescript
import { collectMentions } from './mentions';
```

In `publish()`, just after `const description = input.description?.trim() || deriveExcerpt( textContent );`, add:

```typescript
	const mentions = collectMentions( input.blocks );
	// The post BODY uses the writer-typed lede only (never the derived excerpt).
	const bodyLede = input.description?.trim() || undefined;
```

In the **first** `buildDocumentRecord(...)` call (step 1, no `bskyPostRef`), add `mentions,` to the object. In the **third** `buildDocumentRecord(...)` call (step 3, with `bskyPostRef`), also add `mentions,`.

In the `buildBskyPost(...)` call (step 2), add `bodyLede,` and `mentions,`:

```typescript
			buildBskyPost( {
				title: input.title,
				articleUrl,
				description,
				bodyLede,
				mentions,
				createdAt: now,
				thumb: input.coverImage ?? firstImageBlobRef( input.blocks ),
				associatedRefs: [ documentRef, publicationRef ],
			} )
```

In `updateDocument()` (edits create no new post, so only the content list needs syncing): compute `const mentions = collectMentions( input.blocks );` and pass `mentions,` into its `buildDocumentRecord(...)` call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/publish/publisher.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full publish suite + typecheck**

Run: `npx vitest run src/lib/publish && npm run check`
Expected: PASS / no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/publish/publisher.ts src/lib/publish/publisher.test.ts
git commit --no-gpg-sign -m "Wire collectMentions + body lede into publish/updateDocument"
```

---

### Task 7: Document the optional `mentions` field in the lexicon

**Files:**
- Modify: `lexicons/blog.skypress.content.gutenberg.json`

- [ ] **Step 1: Edit the lexicon (additive — no version bump)**

Add a `mentions` property after `blocks` in the `properties` object:

```json
        "mentions": {
          "type": "array",
          "description": "Optional, additive. Accounts mentioned in the body, mirrored from the inline `<a data-did>` anchors in the block tree. A flat discovery list for other appviews; SkyPress's own reader renders mentions from the inline anchors, not this field. Each item is `{ did: string, handle: string }`.",
          "items": { "type": "unknown" }
        }
```

- [ ] **Step 2: Verify it is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('lexicons/blog.skypress.content.gutenberg.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add lexicons/blog.skypress.content.gutenberg.json
git commit --no-gpg-sign -m "Document optional mentions field in gutenberg content lexicon"
```

---

## Phase 2 — Editor (format + autocompleter)

This phase makes mentions creatable. Pure pieces (the format's serialization, the completer's `getOptionCompletion`/`options`) are unit-tested; the in-editor wiring is verified with a manual browser smoke test.

### Task 8: Register the `skypress/mention` rich-text format

**Files:**
- Create: `src/lib/editor/mention-format.ts`
- Test: `src/lib/editor/mention-format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/editor/mention-format.test.ts
import { describe, expect, it, beforeAll } from 'vitest';
import { create, toHTMLString, applyFormat } from '@wordpress/rich-text';
import { registerMentionFormat, MENTION_FORMAT } from './mention-format';

beforeAll( () => {
	registerMentionFormat();
} );

describe( 'skypress/mention format', () => {
	it( 'round-trips an anchor carrying href + data-did, keeping the text', () => {
		// Build a value "@alice.bsky.social" and apply the mention format across it.
		const value = create( { text: '@alice.bsky.social' } );
		const formatted = applyFormat(
			value,
			{
				type: MENTION_FORMAT,
				attributes: {
					url: 'https://bsky.app/profile/alice.bsky.social',
					did: 'did:plc:alice',
				},
			},
			0,
			value.text.length
		);
		const html = toHTMLString( { value: formatted } );
		expect( html ).toContain( 'href="https://bsky.app/profile/alice.bsky.social"' );
		expect( html ).toContain( 'data-did="did:plc:alice"' );
		expect( html ).toContain( '@alice.bsky.social' );
	} );

	it( 'is idempotent — calling register twice does not throw', () => {
		expect( () => registerMentionFormat() ).not.toThrow();
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/editor/mention-format.test.ts`
Expected: FAIL — "Failed to resolve import './mention-format'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/editor/mention-format.ts
import { registerFormatType, getFormatType } from '@wordpress/rich-text';

export const MENTION_FORMAT = 'skypress/mention';

/**
 * Register the `skypress/mention` rich-text format. It serializes to
 * `<a class="skypress-mention" href="{profile}" data-did="{did}">@{handle}</a>`.
 * The `class` survives the reader's sanitizer (so it can be styled and identified);
 * `data-did` is the publish-time marker (`collectMentions`) and is stripped from public
 * HTML by `sanitize.ts`. Inserted by the `@` autocompleter, not a toolbar button.
 */
export function registerMentionFormat(): void {
	if ( getFormatType( MENTION_FORMAT ) ) {
		return;
	}
	registerFormatType( MENTION_FORMAT, {
		title: 'Mention',
		tagName: 'a',
		className: 'skypress-mention',
		attributes: {
			url: 'href',
			did: 'data-did',
		},
		edit() {
			return null;
		},
	} );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/editor/mention-format.test.ts`
Expected: PASS (2 tests).

> If the format object requires non-null `edit`, the `edit() { return null; }` above satisfies the type. If `toHTMLString` drops `data-did`, confirm the `attributes` map uses `did: 'data-did'` exactly (a `data-*` target is allowed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/mention-format.ts src/lib/editor/mention-format.test.ts
git commit --no-gpg-sign -m "Register skypress/mention rich-text format"
```

---

### Task 9: Mention autocompleter (`@` trigger)

**Files:**
- Create: `src/lib/editor/mention-autocompleter.ts`
- Test: `src/lib/editor/mention-autocompleter.test.ts`

The completer is a plain object. `getOptionCompletion` is pure and fully testable; `options` is tested with an injected lookup. The actual hook registration is a thin `addFilter` verified by smoke test in Task 11.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/editor/mention-autocompleter.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createElement } from '@wordpress/element';
import { renderToString } from 'react-dom/server';
import { createMentionCompleter } from './mention-autocompleter';
import type { ActorPreview } from '../landing/actor-lookup';

const ALICE: ActorPreview = {
	did: 'did:plc:alice',
	handle: 'alice.bsky.social',
	displayName: 'Alice',
	avatar: null,
};

describe( 'mention autocompleter', () => {
	it( 'has an @ trigger prefix', () => {
		const completer = createMentionCompleter( async () => null );
		expect( completer.triggerPrefix ).toBe( '@' );
	} );

	it( 'returns the looked-up actor as the only option', async () => {
		const lookup = vi.fn( async () => ALICE );
		const completer = createMentionCompleter( lookup );
		const options = await completer.options( 'alice' );
		expect( options ).toEqual( [ ALICE ] );
		expect( lookup ).toHaveBeenCalledWith( 'alice' );
	} );

	it( 'returns no options for an empty query without calling lookup', async () => {
		const lookup = vi.fn( async () => ALICE );
		const completer = createMentionCompleter( lookup );
		expect( await completer.options( '' ) ).toEqual( [] );
		expect( lookup ).not.toHaveBeenCalled();
	} );

	it( 'inserts a mention anchor with href + data-did on completion', () => {
		const completer = createMentionCompleter( async () => null );
		const completion = completer.getOptionCompletion( ALICE );
		expect( completion.action ).toBe( 'replace' );
		const html = renderToString( completion.value );
		expect( html ).toContain( 'href="https://bsky.app/profile/alice.bsky.social"' );
		expect( html ).toContain( 'data-did="did:plc:alice"' );
		expect( html ).toContain( '@alice.bsky.social' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/editor/mention-autocompleter.test.ts`
Expected: FAIL — "Failed to resolve import './mention-autocompleter'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/editor/mention-autocompleter.ts
import { createElement } from '@wordpress/element';
import { addFilter } from '@wordpress/hooks';
import { lookupActor, type ActorPreview } from '../landing/actor-lookup';

type LookupFn = ( query: string ) => Promise< ActorPreview | null >;

export interface MentionCompletion {
	action: 'replace';
	value: ReturnType< typeof createElement >;
}

/**
 * A block-editor autocompleter for `@mentions`. `options` queries the public Bluesky
 * AppView (reusing `actor-lookup`); selecting an account inserts the `skypress/mention`
 * anchor (class + href + data-did), with the DID resolved once, here, at pick time.
 */
export function createMentionCompleter( lookup: LookupFn = lookupActor ) {
	return {
		name: 'skypress/mention',
		triggerPrefix: '@',
		async options( query: string ): Promise< ActorPreview[] > {
			const trimmed = query.trim();
			if ( ! trimmed ) {
				return [];
			}
			const found = await lookup( trimmed );
			return found ? [ found ] : [];
		},
		getOptionKeywords( option: ActorPreview ): string[] {
			return [ option.handle, option.displayName ?? '' ].filter( Boolean );
		},
		getOptionLabel( option: ActorPreview ) {
			return createElement(
				'span',
				{ className: 'skypress-mention-option' },
				option.avatar
					? createElement( 'img', {
							src: option.avatar,
							alt: '',
							width: 20,
							height: 20,
							className: 'skypress-mention-option__avatar',
					  } )
					: null,
				createElement(
					'span',
					{ className: 'skypress-mention-option__name' },
					option.displayName ?? option.handle
				),
				createElement(
					'span',
					{ className: 'skypress-mention-option__handle' },
					`@${ option.handle }`
				)
			);
		},
		getOptionCompletion( option: ActorPreview ): MentionCompletion {
			return {
				action: 'replace',
				value: createElement(
					'a',
					{
						href: `https://bsky.app/profile/${ option.handle }`,
						className: 'skypress-mention',
						'data-did': option.did,
					},
					`@${ option.handle }`
				),
			};
		},
	};
}

let registered = false;

/** Add the mention completer to every RichText instance in the editor. */
export function registerMentionAutocompleter(): void {
	if ( registered ) {
		return;
	}
	registered = true;
	const completer = createMentionCompleter();
	addFilter(
		'editor.Autocomplete.completers',
		'skypress/mention-autocompleter',
		( completers: unknown[] ) => [ ...completers, completer ]
	);
}
```

> The test imports `renderToString` from `react-dom/server` (already a dep via React 18). If it is not resolvable in jsdom, switch the completion assertions to inspect `completion.value.props` directly (`props.href`, `props[ 'data-did' ]`, `props.children`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/editor/mention-autocompleter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/mention-autocompleter.ts src/lib/editor/mention-autocompleter.test.ts
git commit --no-gpg-sign -m "Add @ mention autocompleter (actor-lookup backed)"
```

---

### Task 10: Wire format + autocompleter into the editor

**Files:**
- Modify: `src/components/SkyEditor.tsx`

- [ ] **Step 1: Locate the block-registration call**

Run: `git grep -n "registerSkyPressBlocks\|IsolatedBlockEditor" src/components/SkyEditor.tsx`
This shows where blocks are registered/the editor mounts.

- [ ] **Step 2: Add the registrations**

At the top of `SkyEditor.tsx`, add imports:

```typescript
import { registerMentionFormat } from '../lib/editor/mention-format';
import { registerMentionAutocompleter } from '../lib/editor/mention-autocompleter';
```

Wherever `registerSkyPressBlocks()` is invoked (module init or an effect), call both new registrars immediately after it:

```typescript
	registerSkyPressBlocks();
	registerMentionFormat();
	registerMentionAutocompleter();
```

If `registerSkyPressBlocks()` is called inside a `useEffect`/`useMemo`, place the two new calls in the same scope so they run once, client-side, with the editor.

- [ ] **Step 3: Typecheck + full test run**

Run: `npm run check && npm run test`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/SkyEditor.tsx
git commit --no-gpg-sign -m "Register mention format + autocompleter in SkyEditor"
```

---

### Task 11: Manual browser smoke test (editor)

No code. Verifies the in-editor wiring that unit tests can't reach. Use the Chrome DevTools MCP (project preference for smoke tests).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (serve on `http://127.0.0.1:<port>` — atproto loopback requirement). Sign in to the Studio (smoke-test account: `@jeherve.com`).

- [ ] **Step 2: Trigger the autocomplete**

In the article body, type `@jeherve` and wait. Expected: a dropdown lists the matching account (avatar + name + `@handle`).

- [ ] **Step 3: Insert and inspect**

Select the account. Expected: the text becomes `@jeherve.com` styled as a link. In DevTools, evaluate the editor's saved blocks (or inspect the DOM node) and confirm the anchor is `<a class="skypress-mention" href="https://bsky.app/profile/jeherve.com" data-did="did:…">`.

- [ ] **Step 4: Record the result**

Note pass/fail in the task. If the dropdown never appears, the `editor.Autocomplete.completers` filter name differs in this `@wordpress/block-editor` build — check `node_modules/@wordpress/block-editor` for the autocomplete hook name and adjust `registerMentionAutocompleter`. Re-run Task 9's tests (unaffected) and repeat this smoke test.

---

## Phase 3 — UI (counter + disclosure)

### Task 12: Grapheme counter + confirm-dialog disclosure in PublishPanel

PublishPanel already holds `title`, `description` (the lede), `blocks`, `identity`, and the selected target (slug). It is the right home for both the live post-length counter and the mention disclosure.

**Files:**
- Modify: `src/components/PublishPanel.tsx`
- Test: `src/components/PublishPanel.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/PublishPanel.test.tsx
import { describe, expect, it } from 'vitest';
import { computePostPreview } from './PublishPanel';
import type { BlockNode } from '../lib/blocks/render';

function mentionPara( handle: string, did: string ): BlockNode {
	return {
		name: 'core/paragraph',
		attributes: {
			content: `Hi <a class="skypress-mention" href="https://bsky.app/profile/${ handle }" data-did="${ did }">@${ handle }</a>`,
		},
		innerBlocks: [],
	};
}

describe( 'computePostPreview', () => {
	it( 'reports the mentioned handles and a grapheme count', () => {
		const preview = computePostPreview( {
			title: 'Hello',
			lede: 'A lede',
			blocks: [ mentionPara( 'alice.bsky.social', 'did:plc:alice' ) ],
			handle: 'me.bsky.social',
			slug: 'pub',
		} );
		expect( preview.handles ).toEqual( [ '@alice.bsky.social' ] );
		expect( preview.graphemes ).toBeGreaterThan( 0 );
		expect( preview.overLimit ).toBe( false );
	} );

	it( 'flags overLimit when the assembled post exceeds 300 graphemes', () => {
		const preview = computePostPreview( {
			title: 'Hello',
			lede: 'x'.repeat( 320 ),
			blocks: [],
			handle: 'me.bsky.social',
			slug: 'pub',
		} );
		expect( preview.overLimit ).toBe( true );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PublishPanel.test.tsx`
Expected: FAIL — `computePostPreview` not exported.

- [ ] **Step 3: Add `computePostPreview` + use it in `PublishPanel.tsx`**

Add imports at the top:

```typescript
import { collectMentions } from '../lib/publish/mentions';
import { assemblePostText } from '../lib/publish/post-text';
import { graphemeLength } from '../lib/publish/grapheme';
import { canonicalArticleUrl } from '../lib/publish/records';
```

Add this exported pure helper (near the top of the module, before the component). A TID rkey is a fixed 13 chars; using a placeholder of that length makes the counter match the real published URL length.

```typescript
const POST_GRAPHEME_LIMIT = 300;
const RKEY_PLACEHOLDER = 'aaaaaaaaaaaaa'; // 13 chars, TID length

export interface PostPreview {
	graphemes: number;
	overLimit: boolean;
	handles: string[];
}

/** Live preview of the companion Bluesky post: its grapheme count and who gets cc'd. */
export function computePostPreview( input: {
	title: string;
	lede: string;
	blocks: BlockNode[];
	handle: string;
	slug: string;
} ): PostPreview {
	const mentions = collectMentions( input.blocks );
	const articleUrl = canonicalArticleUrl( input.handle, input.slug, RKEY_PLACEHOLDER );
	const { text } = assemblePostText( {
		title: input.title,
		articleUrl,
		bodyLede: input.lede,
		mentions,
	} );
	return {
		graphemes: graphemeLength( text ),
		overLimit: graphemeLength( text ) > POST_GRAPHEME_LIMIT,
		handles: mentions.map( ( m ) => `@${ m.handle }` ),
	};
}
```

Inside the component, compute the preview from current props/target (use the resolved handle from `identity` and the selected target slug; guard for `null`/no target):

```typescript
	const previewHandle = identity.handle ?? identity.did;
	const preview = target
		? computePostPreview( {
				title,
				lede: description,
				blocks,
				handle: previewHandle,
				slug: target.slug,
		  } )
		: null;
```

Render a counter line near the publish button (e.g. just above it):

```tsx
	{ preview && (
		<p
			className={ `publish__count${ preview.overLimit ? ' publish__count--over' : '' }` }
			aria-live="polite"
		>
			Bluesky post: { preview.graphemes }/300
			{ preview.overLimit ? ' — shorten the subtitle to publish' : '' }
		</p>
	) }
```

Disable submit when over the limit — extend the existing `canSubmit`:

```typescript
	const canSubmit =
		title.trim().length > 0 && blocks.length > 0 && hasTarget && ! preview?.overLimit;
```

In the confirm dialog (`phase === 'confirm'`), add the disclosure sentence when there are mentions. Inside the existing `<p className="publish__warning">`, after the current text, add:

```tsx
			{ preview && preview.handles.length > 0 && (
				<>
					{ ' ' }
					It will notify{ ' ' }
					<strong>{ preview.handles.join( ', ' ) }</strong>.
				</>
			) }
```

Ensure `BlockNode` is imported in `PublishPanel.tsx` (it deals in `BlockInstance[]` today; the preview helper accepts `BlockNode[]`, which `normalizeBlocks` produces — pass `normalizeBlocks(blocks)` into `computePostPreview` if the live `blocks` prop is `BlockInstance[]`). Add at the call site:

```typescript
	import { normalizeBlocks } from '../lib/publish/records';
	// ...
	blocks: normalizeBlocks( blocks ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PublishPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/PublishPanel.tsx src/components/PublishPanel.test.tsx
git commit --no-gpg-sign -m "Add Bluesky post grapheme counter + mention disclosure to PublishPanel"
```

---

### Task 13: Style the counter and mention option (CSS)

**Files:**
- Modify: the stylesheet that defines `.publish__*` and `.studio__*` (run `git grep -ln "publish__button\|studio__lede" src/` to locate it — likely a global CSS or `.astro` `<style>`).

- [ ] **Step 1: Add minimal styles**

Add rules for the new classes, matching the existing token usage in that file:

```css
.publish__count {
	font-size: 0.8rem;
	opacity: 0.7;
}
.publish__count--over {
	color: #b00020;
	opacity: 1;
}
.skypress-mention-option {
	display: flex;
	align-items: center;
	gap: 0.4rem;
}
.skypress-mention-option__avatar {
	border-radius: 50%;
}
.skypress-mention-option__handle {
	opacity: 0.6;
}
.skypress-mention {
	/* Rendered mention link in the article — inherits link styling; hook for theming. */
	text-decoration: underline;
}
```

- [ ] **Step 2: Commit**

```bash
git add <the-stylesheet-path>
git commit --no-gpg-sign -m "Style post-length counter and mention autocomplete option"
```

---

## Phase 4 — Locks & docs

### Task 14: Lock render fidelity for a mention-bearing block

**Files:**
- Modify: `src/lib/blocks/render.test.ts`

- [ ] **Step 1: Add a fidelity assertion**

In the existing `describe( 'renderBlocks — fidelity vs @wordpress/blocks.serialize()', …)`, add a test. It registers the mention format so `serialize()` reproduces the anchor, then asserts `renderBlocks` matches `serialize` for a paragraph containing a mention.

```typescript
	it( 'reproduces a paragraph containing a skypress mention', async () => {
		const { registerMentionFormat } = await import( '../editor/mention-format' );
		registerMentionFormat();

		const tree = [
			createBlock( 'core/paragraph', {
				content:
					'Thanks <a class="skypress-mention" href="https://bsky.app/profile/alice.bsky.social" data-did="did:plc:alice">@alice.bsky.social</a>!',
			} ),
		];

		const expected = normalize( stripDelimiters( serializeBlocks( tree ) ) );
		const actual = normalize( renderBlocks( tree ) );
		expect( actual ).toBe( expected );
	} );
```

- [ ] **Step 2: Run the fidelity test**

Run: `npx vitest run src/lib/blocks/render.test.ts`
Expected: PASS. If it fails because `serialize()` drops `data-did` from the paragraph content, the mention must be modeled as a registered format for serialization to retain the attribute — confirm Task 8 ran and the format is registered before `serializeBlocks` here (the dynamic import + `registerMentionFormat()` above ensures that).

- [ ] **Step 3: Commit**

```bash
git add src/lib/blocks/render.test.ts
git commit --no-gpg-sign -m "Lock render fidelity for mention-bearing blocks"
```

---

### Task 15: Lock sanitizer behavior for mention anchors

**Files:**
- Modify: `src/lib/reader/sanitize.test.ts`

- [ ] **Step 1: Add the assertion**

```typescript
	it( 'keeps a mention link (class + href) but strips its data-did', () => {
		const dirty =
			'<p>Hi <a class="skypress-mention" href="https://bsky.app/profile/alice.bsky.social" data-did="did:plc:alice">@alice.bsky.social</a></p>';
		const clean = sanitizeArticleHtml( dirty );
		expect( clean ).toContain( 'class="skypress-mention"' );
		expect( clean ).toContain( 'href="https://bsky.app/profile/alice.bsky.social"' );
		expect( clean ).not.toContain( 'data-did' );
		expect( clean ).toContain( '@alice.bsky.social' );
	} );
```

- [ ] **Step 2: Run the sanitizer tests**

Run: `npx vitest run src/lib/reader/sanitize.test.ts`
Expected: PASS — the existing `allowedAttributes` (`a: [ 'href', 'title', 'rel', 'target' ]`, `'*': [ 'class' ]`) already produces this; this test locks it so a future allowlist change can't silently start leaking `data-did`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reader/sanitize.test.ts
git commit --no-gpg-sign -m "Lock sanitizer: mention link keeps class+href, drops data-did"
```

---

### Task 16: Decision record

**Files:**
- Create: `docs/decisions/0019-editor-mentions.md` (confirm the next free number first: `ls docs/decisions | tail`)

- [ ] **Step 1: Write the decision**

```markdown
# 0019 — Editor @mentions and Bluesky mention notifications

## Context

Writers want to mention atproto users in an article and have those users notified.
Bluesky only generates a mention notification when it indexes an `app.bsky.feed.post`
whose `facets` contain `app.bsky.richtext.facet#mention`; the AppView indexes per
collection and never scans custom records (`site.standard.document`) for facets.

## Decision

- **Notifications ride the companion post.** Publish appends a `cc @a @b` line (plus the
  writer's lede) to the `app.bsky.feed.post` body and attaches a `#mention` facet per
  handle. A facet on the document record would be inert.
- **Storage is inline.** Mentions are a registered `skypress/mention` rich-text format
  serializing to `<a class="skypress-mention" href="https://bsky.app/profile/{handle}"
  data-did="{did}">@{handle}</a>`. This is the single source of truth; `collectMentions`
  derives the cc list and the document's flat `mentions` list from it at publish.
- **Link target is Bluesky.** Correct for every mentionable user; no SkyPress-profile 404s.
- **Interop is the inline anchors + a flat `mentions` list** on
  `blog.skypress.content.gutenberg`, not a byte-offset facet (no flat-text host fits our
  block content model). The reader renders the mention from the inline anchor; the
  sanitizer keeps `class` + `href` and strips `data-did`.
- **Body only.** Lede-field mentions, edit-time notifications, and SkyPress-internal
  mention links are out of scope.

## Consequences

- The post body can approach Bluesky's 300-grapheme limit; PublishPanel shows a live count
  and blocks publish over the limit, with a backstop guard in `buildBskyPost`.
- Adding the format means a `render.ts` fidelity assertion and a sanitizer lock test.
- DIDs are resolved once, at pick time, and baked into the block — publish never
  re-resolves.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/0019-editor-mentions.md
git commit --no-gpg-sign -m "Record decision 0019: editor mentions + notifications"
```

---

### Task 17: Update contract comments + final verification

**Files:**
- Modify: `src/lib/publish/records.ts` (comment on `buildBskyPost`/`BskyPostRecord`), `src/components/PublishPanel.tsx` (the confirm-dialog comment).

- [ ] **Step 1: Refresh stale contract comments**

In `records.ts`, ensure the `BskyPostRecord` / `buildBskyPost` doc comments state the body is `title + lede + cc line + URL` (not just title + URL) and that `facets` may include `#mention` features. In `PublishPanel.tsx`, update the component doc comment to note the dialog discloses notified accounts and that publish is blocked over 300 graphemes.

- [ ] **Step 2: Full verification**

Run: `npm run test && npm run check && npm run build`
Expected: all tests pass, no type errors, build succeeds (verifies reading pages still don't import `@wordpress/*` — the editor-only modules stay in the island).

- [ ] **Step 3: Commit**

```bash
git add src/lib/publish/records.ts src/components/PublishPanel.tsx
git commit --no-gpg-sign -m "Refresh contract comments for mention-aware publish"
```

- [ ] **Step 4: Manual end-to-end smoke (Chrome DevTools MCP)**

With `npm run dev` on `http://127.0.0.1:<port>`, signed in as the smoke-test account: write a short article, `@`-mention a real account, observe the counter, open the publish confirm dialog (verify "It will notify @…"), publish, then check the published `app.bsky.feed.post` (via the record JSON viewer or `bsky.app`) shows the `cc` line and that the mentioned account received a notification. Record the outcome.

---

## Self-Review (completed during planning)

- **Spec coverage:** autocomplete (Tasks 8–11) · Bluesky-profile link target (Tasks 8–9) · body-only surface (editor wiring, Task 10) · explicit `skypress/mention` format w/ inline DID (Task 8) · inline-anchor interop + flat `mentions` list, no facet lexicon (Tasks 5, 7) · lede into post body, no derived excerpt (Tasks 3, 6) · `cc` line + `#mention` facets (Tasks 3–4, 6) · 300-grapheme guard + counter (Tasks 1, 4, 12) · confirm-dialog disclosure (Task 12) · render fidelity (Task 14) · sanitize strips `data-did` (Task 15) · decision + lexicon + comment docs (Tasks 7, 16, 17). All spec sections map to a task.
- **Placeholders:** none — every code step has full code; the one verification-dependent spot (autocomplete filter name) has a concrete fallback in Task 11.
- **Type consistency:** `Mention { did, handle, displayText }` (Task 2) is consumed unchanged by `assemblePostText` (Task 3), `buildBskyPost`/`buildContentObject` (Tasks 4–5), `publish` (Task 6), and `computePostPreview` (Task 12). `PostFacet` (Task 3) is the type used by `BskyPostRecord.facets` (Task 4). `MENTION_FORMAT`/`registerMentionFormat` (Task 8) and `createMentionCompleter`/`registerMentionAutocompleter` (Task 9) are referenced consistently in Tasks 10/14.
```
