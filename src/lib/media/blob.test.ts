import { describe, expect, it } from 'vitest';
import {
	buildGetBlobUrl,
	attachBlobRefs,
	resolveBlobImageUrls,
	normalizeBlobRefJson,
	firstImageBlobRef,
	BSKY_THUMB_MAX_BYTES,
	type BlobRefJson,
} from './blob';
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

describe( 'normalizeBlobRefJson', () => {
	it( 'passes through the JSON ($link) shape from raw-fetched records', () => {
		expect( normalizeBlobRefJson( REF ) ).toEqual( REF );
	} );

	it( 'extracts the CID from a BlobRef instance (ref is a CID object, no $link)', () => {
		// `@atproto/api` runs jsonToLex on responses, turning the icon into a BlobRef whose
		// `ref` is a multiformats CID — its toString() is the CID string.
		const blobRef = {
			$type: 'blob',
			ref: { toString: () => 'bafyfromcid' },
			mimeType: 'image/jpeg',
			size: 99,
		};
		expect( normalizeBlobRefJson( blobRef ) ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafyfromcid' },
			mimeType: 'image/jpeg',
			size: 99,
		} );
	} );

	it( 'returns undefined for a missing or refless value', () => {
		expect( normalizeBlobRefJson( undefined ) ).toBeUndefined();
		expect( normalizeBlobRefJson( {} ) ).toBeUndefined();
		expect( normalizeBlobRefJson( { mimeType: 'image/png' } ) ).toBeUndefined();
	} );
} );

describe( 'attachBlobRefs', () => {
	// The editor previews via a transient object URL (`blob:…`); publish looks that key
	// up and persists the canonical, portable getBlob URL instead.
	const CANONICAL =
		'https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc&cid=bafycid123';
	const lookup = ( url: string ) =>
		url === 'blob:preview-1' ? { ref: REF, url: CANONICAL } : undefined;

	it( 'attaches skypressBlob and rewrites the url to the canonical getBlob URL, recursing inner blocks', () => {
		const blocks: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'blob:preview-1', alt: 'x' }, innerBlocks: [] },
			{
				name: 'core/gallery',
				attributes: {},
				innerBlocks: [
					{ name: 'core/image', attributes: { url: 'blob:preview-1' }, innerBlocks: [] },
				],
			},
		];
		const out = attachBlobRefs( blocks, lookup );
		expect( out[ 0 ].attributes?.skypressBlob ).toEqual( REF );
		expect( out[ 0 ].attributes?.url ).toBe( CANONICAL );
		expect( out[ 0 ].attributes?.alt ).toBe( 'x' );
		expect( out[ 1 ].innerBlocks?.[ 0 ].attributes?.skypressBlob ).toEqual( REF );
		expect( out[ 1 ].innerBlocks?.[ 0 ].attributes?.url ).toBe( CANONICAL );
	} );

	it( 'leaves external images (no matching upload) untouched', () => {
		const blocks: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'https://example.com/cat.jpg' }, innerBlocks: [] },
		];
		const out = attachBlobRefs( blocks, lookup );
		expect( 'skypressBlob' in ( out[ 0 ].attributes ?? {} ) ).toBe( false );
		expect( out[ 0 ].attributes?.url ).toBe( 'https://example.com/cat.jpg' );
	} );

	it( 'does not mutate the input blocks', () => {
		const blocks: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'blob:preview-1' }, innerBlocks: [] },
		];
		attachBlobRefs( blocks, lookup );
		expect( 'skypressBlob' in ( blocks[ 0 ].attributes ?? {} ) ).toBe( false );
		expect( blocks[ 0 ].attributes?.url ).toBe( 'blob:preview-1' );
	} );
} );

describe( 'firstImageBlobRef', () => {
	const img = ( skypressBlob?: unknown, extra: Record< string, unknown > = {} ): BlockNode => ( {
		name: 'core/image',
		attributes: { ...( skypressBlob ? { skypressBlob } : {} ), ...extra },
		innerBlocks: [],
	} );

	it( 'returns the first uploaded core/image ref (depth-first, into innerBlocks)', () => {
		const blocks: BlockNode[] = [
			{ name: 'core/paragraph', attributes: { content: 'Intro' }, innerBlocks: [] },
			{
				name: 'core/gallery',
				attributes: {},
				innerBlocks: [ img( REF ) ],
			},
		];
		expect( firstImageBlobRef( blocks ) ).toEqual( REF );
	} );

	it( 'picks the first usable image when several are present', () => {
		const second: BlobRefJson = {
			$type: 'blob',
			ref: { $link: 'bafysecond' },
			mimeType: 'image/jpeg',
			size: 100,
		};
		expect( firstImageBlobRef( [ img( REF ), img( second ) ] ) ).toEqual( REF );
	} );

	it( 'skips external images (no skypressBlob) and non-image blocks', () => {
		const blocks: BlockNode[] = [
			{ name: 'core/heading', attributes: { content: 'Title' }, innerBlocks: [] },
			img( undefined, { url: 'https://example.com/cat.jpg' } ),
		];
		expect( firstImageBlobRef( blocks ) ).toBeUndefined();
	} );

	it( 'skips images whose blob exceeds the bsky thumb size limit', () => {
		const tooBig: BlobRefJson = {
			$type: 'blob',
			ref: { $link: 'bafytoobig' },
			mimeType: 'image/png',
			size: BSKY_THUMB_MAX_BYTES + 1,
		};
		const ok: BlobRefJson = {
			$type: 'blob',
			ref: { $link: 'bafyok' },
			mimeType: 'image/png',
			size: BSKY_THUMB_MAX_BYTES,
		};
		expect( firstImageBlobRef( [ img( tooBig ) ] ) ).toBeUndefined();
		// The oversized one is skipped, the in-limit one after it is picked.
		expect( firstImageBlobRef( [ img( tooBig ), img( ok ) ] ) ).toEqual( ok );
	} );

	it( 'skips non-image mime types', () => {
		const pdf: BlobRefJson = {
			$type: 'blob',
			ref: { $link: 'bafypdf' },
			mimeType: 'application/pdf',
			size: 10,
		};
		expect( firstImageBlobRef( [ img( pdf ) ] ) ).toBeUndefined();
	} );

	it( 'returns undefined when there are no usable images', () => {
		expect( firstImageBlobRef( [] ) ).toBeUndefined();
		expect(
			firstImageBlobRef( [ { name: 'core/paragraph', attributes: {}, innerBlocks: [] } ] )
		).toBeUndefined();
	} );
} );

describe( 'resolveBlobImageUrls', () => {
	it( 'reconstructs the image url from skypressBlob against the author PDS + DID', () => {
		const blocks: BlockNode[] = [
			{
				name: 'core/image',
				attributes: { url: 'https://old-host.example/stale', skypressBlob: REF },
				innerBlocks: [],
			},
		];
		const out = resolveBlobImageUrls( blocks, {
			pdsUrl: 'https://pds.example.com',
			did: 'did:plc:abc',
		} );
		expect( out[ 0 ].attributes?.url ).toBe(
			'https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc&cid=bafycid123'
		);
	} );

	it( 'leaves external images (no skypressBlob) untouched', () => {
		const blocks: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'https://example.com/cat.jpg' }, innerBlocks: [] },
		];
		const out = resolveBlobImageUrls( blocks, { pdsUrl: 'https://pds.example.com', did: 'did:plc:abc' } );
		expect( out[ 0 ].attributes?.url ).toBe( 'https://example.com/cat.jpg' );
	} );
} );
