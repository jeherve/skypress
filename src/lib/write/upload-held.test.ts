import { describe, it, expect, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import { uploadHeldAssets } from './upload-held';
import type { BlockNode } from '../blocks/render';

const DATA = 'data:image/png;base64,QUFB'; // "AAA"

function fakeAgent() {
	const uploadBlob = vi.fn( async ( _file: Blob ) => ( {
		data: { blob: { ref: { toString: () => 'bafyCID' }, mimeType: 'image/png', size: 3 } },
	} ) );
	return { agent: { uploadBlob } as unknown as Agent, uploadBlob };
}

describe( 'uploadHeldAssets', () => {
	it( 'uploads each held image, attaches skypressBlob + a getBlob url, leaves externals alone', async () => {
		const { agent, uploadBlob } = fakeAgent();
		const blocks: BlockNode[] = [
			{ name: 'core/image', attributes: { url: DATA }, innerBlocks: [] },
			{ name: 'core/image', attributes: { url: 'https://ext/x.png' }, innerBlocks: [] },
		];

		const out = await uploadHeldAssets( agent, {
			blocks,
			coverDataUrl: null,
			did: 'did:plc:me',
			pdsUrl: 'https://pds.example.com',
		} );

		expect( uploadBlob ).toHaveBeenCalledTimes( 1 );
		expect( out.blocks[ 0 ].attributes!.skypressBlob ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafyCID' },
			mimeType: 'image/png',
			size: 3,
		} );
		expect( out.blocks[ 0 ].attributes!.url ).toBe(
			'https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Ame&cid=bafyCID'
		);
		expect( out.blocks[ 1 ].attributes!.url ).toBe( 'https://ext/x.png' );
		expect( out.coverImage ).toBeUndefined();
	} );

	it( 'uploads a held cover into a BlobRefJson', async () => {
		const { agent } = fakeAgent();
		const out = await uploadHeldAssets( agent, {
			blocks: [],
			coverDataUrl: DATA,
			did: 'did:plc:me',
			pdsUrl: 'https://pds.example.com',
		} );
		expect( out.coverImage ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafyCID' },
			mimeType: 'image/png',
			size: 3,
		} );
	} );
} );
