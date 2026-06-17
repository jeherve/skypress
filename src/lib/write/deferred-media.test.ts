import { describe, it, expect, vi } from 'vitest';
import { createDeferredMediaUpload } from './deferred-media';

describe( 'createDeferredMediaUpload', () => {
	it( 'previews each file as a data: URL and uploads nothing', async () => {
		const handler = createDeferredMediaUpload();
		const file = new File( [ 'x' ], 'cat.png', { type: 'image/png' } );
		const onFileChange = vi.fn();

		await handler( { filesList: [ file ], onFileChange } );

		expect( onFileChange ).toHaveBeenCalledTimes( 1 );
		const [ media ] = onFileChange.mock.calls[ 0 ][ 0 ];
		expect( media.url.startsWith( 'data:image/png;base64,' ) ).toBe( true );
		expect( media.url.startsWith( 'blob:' ) ).toBe( false );
		expect( 'id' in media ).toBe( false );
	} );

	it( 'rejects oversize files via onError without previewing them', async () => {
		const handler = createDeferredMediaUpload();
		const big = new File( [ 'x' ], 'big.png', { type: 'image/png' } );
		Object.defineProperty( big, 'size', { value: 5_000_000 } );
		const onFileChange = vi.fn();
		const onError = vi.fn();

		await handler( {
			filesList: [ big ],
			onFileChange,
			onError,
			maxUploadFileSize: 1_000_000,
		} );

		expect( onFileChange ).not.toHaveBeenCalled();
		expect( onError ).toHaveBeenCalledTimes( 1 );
		expect( onError.mock.calls[ 0 ][ 0 ] ).toBeInstanceOf( Error );
	} );
} );
