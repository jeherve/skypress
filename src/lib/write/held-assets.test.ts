// @vitest-environment node
// Pure module — no DOM needed. Node's global Blob exposes `.text()`, which the
// repo's pinned jsdom Blob does not, so run this file under the node environment.
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
		expect( isDataUrl( 'https://x/y.png' ) ).toBe( false );
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
