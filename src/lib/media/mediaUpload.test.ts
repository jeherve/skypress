import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import { createMediaUpload, revokeBlobRegistry, type BlobRegistry } from './mediaUpload';

/** A fake `uploadBlob` response shaped like the atproto BlobRef the agent returns. */
function fakeUploadResult( cid: string, mimeType: string, size: number ) {
	return { data: { blob: { ref: { toString: () => cid }, mimeType, size } } };
}

describe( 'createMediaUpload', () => {
	beforeEach( () => {
		// jsdom doesn't implement object URLs; stub a deterministic one per call.
		let n = 0;
		vi.stubGlobal( 'URL', {
			...URL,
			createObjectURL: vi.fn( () => `blob:preview-${ ++n }` ),
		} );
	} );
	afterEach( () => vi.unstubAllGlobals() );

	function setup() {
		const registry: BlobRegistry = new Map();
		const uploadBlob = vi
			.fn()
			.mockResolvedValue( fakeUploadResult( 'bafycid123', 'image/png', 70 ) );
		const agent = { uploadBlob } as unknown as Agent;
		const handler = createMediaUpload( {
			agent,
			did: 'did:plc:abc',
			pdsUrl: 'https://pds.example.com',
			registry,
		} );
		return { registry, uploadBlob, handler };
	}

	it( 'uploads to the PDS, previews via an object URL, and omits any attachment id', async () => {
		const { uploadBlob, handler } = setup();
		const file = new File( [ 'x' ], 'cat.png', { type: 'image/png' } );
		const onFileChange = vi.fn();

		await handler( { filesList: [ file ], onFileChange } );

		expect( uploadBlob ).toHaveBeenCalledWith( file, { encoding: 'image/png' } );
		expect( onFileChange ).toHaveBeenCalledTimes( 1 );
		const [ media ] = onFileChange.mock.calls[ 0 ][ 0 ];
		// Preview src is the local object URL — never the live getBlob URL (unreferenced
		// blobs 500 on com.atproto.sync.getBlob until a record commits them).
		expect( media.url ).toBe( 'blob:preview-1' );
		// No `id`: PDS blobs are not WP attachments, so the image block must not try to
		// fetch /wp/v2/media/<id> (that 404s).
		expect( 'id' in media ).toBe( false );
	} );

	it( 'registers the blob ref + canonical getBlob URL keyed by the preview URL', async () => {
		const { registry, handler } = setup();
		const file = new File( [ 'x' ], 'cat.png', { type: 'image/png' } );

		await handler( { filesList: [ file ], onFileChange: vi.fn() } );

		expect( registry.get( 'blob:preview-1' ) ).toEqual( {
			ref: {
				$type: 'blob',
				ref: { $link: 'bafycid123' },
				mimeType: 'image/png',
				size: 70,
			},
			url: 'https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aabc&cid=bafycid123',
		} );
	} );

	it( 'surfaces oversize files via onError and does not upload them', async () => {
		const { uploadBlob, handler } = setup();
		const big = new File( [ 'x' ], 'big.png', { type: 'image/png' } );
		Object.defineProperty( big, 'size', { value: 5_000_000 } );
		const onError = vi.fn();

		await handler( {
			filesList: [ big ],
			onFileChange: vi.fn(),
			onError,
			maxUploadFileSize: 1_000_000,
		} );

		expect( uploadBlob ).not.toHaveBeenCalled();
		expect( onError ).toHaveBeenCalledTimes( 1 );
		expect( onError.mock.calls[ 0 ][ 0 ] ).toBeInstanceOf( Error );
	} );
} );

describe( 'revokeBlobRegistry', () => {
	it( 'revokes every preview object URL and empties the registry', () => {
		const revoke = vi.fn();
		vi.stubGlobal( 'URL', { ...URL, revokeObjectURL: revoke } );
		const ref = { $type: 'blob' as const, ref: { $link: 'cid' }, mimeType: 'image/png', size: 1 };
		const registry: BlobRegistry = new Map( [
			[ 'blob:preview-1', { ref, url: 'https://pds.example.com/a' } ],
			[ 'blob:preview-2', { ref, url: 'https://pds.example.com/b' } ],
		] );

		revokeBlobRegistry( registry );

		expect( revoke ).toHaveBeenCalledTimes( 2 );
		expect( revoke ).toHaveBeenCalledWith( 'blob:preview-1' );
		expect( revoke ).toHaveBeenCalledWith( 'blob:preview-2' );
		expect( registry.size ).toBe( 0 );

		vi.unstubAllGlobals();
	} );
} );
