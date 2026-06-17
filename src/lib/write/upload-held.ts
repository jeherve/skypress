import type { Agent } from '@atproto/api';
import type { BlockNode } from '../blocks/render';
import {
	attachBlobRefs,
	buildGetBlobUrl,
	type BlobRefJson,
	type BlobUpload,
} from '../media/blob';
import { isDataUrl, dataUrlToBlob } from './held-assets';

export interface PreparedPublishContent {
	blocks: BlockNode[];
	coverImage?: BlobRefJson;
}

/** Upload one held `data:` URL to the PDS and return its portable blob ref + getBlob URL. */
async function uploadOne(
	agent: Agent,
	dataUrl: string,
	did: string,
	pdsUrl: string
): Promise< BlobUpload > {
	const blob = dataUrlToBlob( dataUrl );
	const res = await agent.uploadBlob( blob, { encoding: blob.type } );
	const out = res.data.blob;
	const cid = out.ref.toString();
	return {
		ref: { $type: 'blob', ref: { $link: cid }, mimeType: out.mimeType, size: out.size },
		url: buildGetBlobUrl( pdsUrl, did, cid ),
	};
}

/**
 * Publish-time bridge for the writing-first flow: walk the block tree, upload every held
 * (`data:`) image to the writer's PDS, and rewrite those blocks via `attachBlobRefs` so they
 * carry `skypressBlob` + a portable getBlob URL (byte-identical to the eager path). External
 * image URLs are left untouched. A held cover is uploaded into a `BlobRefJson` for the document
 * record. Each distinct data URL uploads once.
 */
export async function uploadHeldAssets(
	agent: Agent,
	input: { blocks: BlockNode[]; coverDataUrl: string | null; did: string; pdsUrl: string }
): Promise< PreparedPublishContent > {
	const { blocks, coverDataUrl, did, pdsUrl } = input;

	// Collect every distinct held image URL in the tree (depth-first), upload once each.
	const registry = new Map< string, BlobUpload >();
	const collect = ( nodes: BlockNode[] ): string[] =>
		nodes.flatMap( ( node ) => {
			const url = node.attributes?.url;
			const here = node.name === 'core/image' && isDataUrl( url ) ? [ url as string ] : [];
			return [ ...here, ...collect( node.innerBlocks ?? [] ) ];
		} );

	for ( const url of new Set( collect( blocks ) ) ) {
		registry.set( url, await uploadOne( agent, url, did, pdsUrl ) );
	}

	const prepared = attachBlobRefs( blocks, ( url ) => registry.get( url ) );

	let coverImage: BlobRefJson | undefined;
	if ( isDataUrl( coverDataUrl ) ) {
		coverImage = ( await uploadOne( agent, coverDataUrl, did, pdsUrl ) ).ref;
	}

	return { blocks: prepared, coverImage };
}
