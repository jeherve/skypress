/**
 * Pure blob helpers (Decision 0006). No `@atproto/*` or network — unit-testable.
 */
import type { BlockNode } from '../blocks/render';

/** The JSON (IPLD) form of an atproto blob ref, as stored in records. */
export interface BlobRefJson {
	$type: 'blob';
	ref: { $link: string };
	mimeType: string;
	size: number;
}

/** Block names whose `url` attribute may reference an uploaded blob. */
const IMAGE_BLOCKS = new Set( [ 'core/image' ] );

/** Build the `com.atproto.sync.getBlob` URL for a writer's DID + blob CID. */
export function buildGetBlobUrl( pdsUrl: string, did: string, cid: string ): string {
	const base = pdsUrl.replace( /\/$/, '' );
	return `${ base }/xrpc/com.atproto.sync.getBlob?did=${ encodeURIComponent(
		did
	) }&cid=${ encodeURIComponent( cid ) }`;
}

/**
 * Attach the stored blob ref (`skypressBlob`) to every image block whose `url` was
 * uploaded this session (resolved via `lookup`). Returns a new tree; does not mutate
 * the input. Images without a matching upload (e.g. external URLs) are left as-is, so
 * the reader keeps their `url`.
 */
export function attachBlobRefs(
	blocks: BlockNode[],
	lookup: ( url: string ) => BlobRefJson | undefined
): BlockNode[] {
	return blocks.map( ( block ) => {
		const url = block.attributes?.url;
		const ref = IMAGE_BLOCKS.has( block.name ) && typeof url === 'string'
			? lookup( url )
			: undefined;
		return {
			name: block.name,
			attributes: ref
				? { ...block.attributes, skypressBlob: ref }
				: { ...block.attributes },
			innerBlocks: attachBlobRefs( block.innerBlocks ?? [], lookup ),
		};
	} );
}
