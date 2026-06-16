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
