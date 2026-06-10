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

import PublishPanel from './PublishPanel';

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
} );
