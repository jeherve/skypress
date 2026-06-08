import { describe, expect, it } from 'vitest';
import { buildGetBlobUrl, attachBlobRefs, type BlobRefJson } from './blob';
import type { BlockNode } from '../blocks/render';

const REF: BlobRefJson = {
	$type: 'blob',
	ref: { $link: 'bafycid123' },
	mimeType: 'image/png',
	size: 4242,
};

describe( 'buildGetBlobUrl', () => {
	it( 'builds the com.atproto.sync.getBlob URL for a did + cid', () => {
		expect(
			buildGetBlobUrl( 'https://pds.example.com', 'did:plc:abc', 'bafycid123' )
		).toBe(
			'https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc&cid=bafycid123'
		);
	} );
	it( 'tolerates a trailing slash on the PDS URL', () => {
		expect( buildGetBlobUrl( 'https://pds.example.com/', 'did:plc:abc', 'c' ) ).toContain(
			'https://pds.example.com/xrpc/'
		);
	} );
} );

describe( 'attachBlobRefs', () => {
	const lookup = ( url: string ) => ( url === 'blob://uploaded' ? REF : undefined );

	it( 'attaches skypressBlob to an uploaded image, recursing inner blocks', () => {
		const blocks: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'blob://uploaded', alt: 'x' }, innerBlocks: [] },
			{
				name: 'core/gallery',
				attributes: {},
				innerBlocks: [
					{ name: 'core/image', attributes: { url: 'blob://uploaded' }, innerBlocks: [] },
				],
			},
		];
		const out = attachBlobRefs( blocks, lookup );
		expect( out[ 0 ].attributes?.skypressBlob ).toEqual( REF );
		expect( out[ 1 ].innerBlocks?.[ 0 ].attributes?.skypressBlob ).toEqual( REF );
	} );

	it( 'leaves external images (no matching upload) untouched', () => {
		const blocks: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'https://example.com/cat.jpg' }, innerBlocks: [] },
		];
		const out = attachBlobRefs( blocks, lookup );
		expect( 'skypressBlob' in ( out[ 0 ].attributes ?? {} ) ).toBe( false );
	} );

	it( 'does not mutate the input blocks', () => {
		const blocks: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'blob://uploaded' }, innerBlocks: [] },
		];
		attachBlobRefs( blocks, lookup );
		expect( 'skypressBlob' in ( blocks[ 0 ].attributes ?? {} ) ).toBe( false );
	} );
} );
