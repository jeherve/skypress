import { describe, it, expect } from 'vitest';
import {
	validateCoverFile,
	coverPreviewUrl,
	uploadCoverViaMedia,
	COVER_MAX_BYTES,
	type CoverUpload,
} from './cover';
import type { BlobRegistry, MediaUploadHandler } from './mediaUpload';

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
