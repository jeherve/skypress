import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import {
	uploadImageBlob,
	ImageValidationError,
	PUBLICATION_ICON_MAX_BYTES,
} from './uploadImage';

function fileOf( type: string, size: number, name = 'logo.png' ): File {
	const file = new File( [ 'x' ], name, { type } );
	Object.defineProperty( file, 'size', { value: size } );
	return file;
}

function agentUploading( blob: Record< string, unknown > ): Agent {
	return { uploadBlob: vi.fn().mockResolvedValue( { data: { blob } } ) } as unknown as Agent;
}

describe( 'uploadImageBlob', () => {
	it( 'rejects non-image files without uploading', async () => {
		const agent = agentUploading( {} );
		await expect(
			uploadImageBlob( agent, fileOf( 'application/pdf', 10 ) )
		).rejects.toBeInstanceOf( ImageValidationError );
		expect( ( agent.uploadBlob as ReturnType< typeof vi.fn > ) ).not.toHaveBeenCalled();
	} );

	it( 'rejects files over the 1MB icon limit without uploading', async () => {
		const agent = agentUploading( {} );
		await expect(
			uploadImageBlob( agent, fileOf( 'image/png', PUBLICATION_ICON_MAX_BYTES + 1 ) )
		).rejects.toBeInstanceOf( ImageValidationError );
		expect( ( agent.uploadBlob as ReturnType< typeof vi.fn > ) ).not.toHaveBeenCalled();
	} );

	it( 'uploads a valid image and returns its blob ref json', async () => {
		const agent = agentUploading( {
			ref: { toString: () => 'bafyicon' },
			mimeType: 'image/png',
			size: 500,
		} );
		const ref = await uploadImageBlob( agent, fileOf( 'image/png', 500 ) );
		expect( ref ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafyicon' },
			mimeType: 'image/png',
			size: 500,
		} );
	} );
} );
