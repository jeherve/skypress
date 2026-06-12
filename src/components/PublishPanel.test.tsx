import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Agent } from '@atproto/api';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

// Hoist the mock fns so vi.mock (which is hoisted) can reference them safely.
const { updateDocument, publish } = vi.hoisted( () => {
	return {
		updateDocument: vi.fn(
			async ( _agent: unknown, _identity: unknown, _input: unknown ) => ( {
				documentUri: 'at://x',
				articleUrl: 'https://x',
			} )
		),
		publish: vi.fn( async () => ( {
			publicationUri: 'at://p',
			documentUri: 'at://d',
			postUri: 'at://post',
			articleUrl: 'https://x',
		} ) ),
	};
} );

// Mock the publish layer so we can assert what PublishPanel forwards.
vi.mock( '../lib/publish/publisher', () => ( { publish, updateDocument } ) );

import PublishPanel, { computePostPreview } from './PublishPanel';
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

const EDITING = {
	rkey: '3kdoc',
	siteUri: 'at://did:plc:me/site.standard.publication/pub1',
	siteSlug: 'my-blog',
	publishedAt: '2026-06-08T00:00:00.000Z',
};

beforeEach( () => {
	updateDocument.mockClear();
	publish.mockClear();
} );

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
	// The submit handler is async, so a state update can still be settling at
	// teardown; unmount inside act() so it isn't flagged "not wrapped in act".
	await act( async () => {
		root.unmount();
	} );
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
	// The publish handler is async, so a state update can still be settling at
	// teardown; unmount inside act() so it isn't flagged "not wrapped in act".
	await act( async () => {
		root.unmount();
	} );
	container.remove();
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
