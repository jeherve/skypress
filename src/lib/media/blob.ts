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

/**
 * What a session upload records for each previewed image. The editor previews from a
 * transient object URL (`blob:…`); `attachBlobRefs` looks that key up at publish and
 * persists the portable `url` (a `getBlob` URL) plus the typed `ref` (`skypressBlob`).
 */
export interface BlobUpload {
	ref: BlobRefJson;
	url: string;
}

/** Block names whose `url` attribute may reference an uploaded blob. */
const IMAGE_BLOCKS = new Set( [ 'core/image' ] );

/**
 * Reader-side (SP4): rewrite each blob-backed image's `url` to a fresh `getBlob` URL
 * built from the article author's current PDS + DID and the stored CID. This is what
 * makes images portable — the stored `url` host may be stale after a PDS migration, but
 * the `skypressBlob` CID is not. External images (no `skypressBlob`) are left as-is.
 * Returns a new tree.
 */
export function resolveBlobImageUrls(
	blocks: BlockNode[],
	author: { pdsUrl: string; did: string }
): BlockNode[] {
	return blocks.map( ( block ) => {
		const ref = block.attributes?.skypressBlob as BlobRefJson | undefined;
		const cid = ref?.ref?.$link;
		return {
			name: block.name,
			attributes:
				IMAGE_BLOCKS.has( block.name ) && cid
					? { ...block.attributes, url: buildGetBlobUrl( author.pdsUrl, author.did, cid ) }
					: { ...block.attributes },
			innerBlocks: resolveBlobImageUrls( block.innerBlocks ?? [], author ),
		};
	} );
}

/** Build the `com.atproto.sync.getBlob` URL for a writer's DID + blob CID. */
export function buildGetBlobUrl( pdsUrl: string, did: string, cid: string ): string {
	const base = pdsUrl.replace( /\/$/, '' );
	return `${ base }/xrpc/com.atproto.sync.getBlob?did=${ encodeURIComponent(
		did
	) }&cid=${ encodeURIComponent( cid ) }`;
}

/**
 * Attach the stored blob ref (`skypressBlob`) to every image block whose `url` was
 * uploaded this session (resolved via `lookup`), and rewrite that `url` to the canonical,
 * portable `getBlob` URL — the editor previewed from a transient object URL which would
 * otherwise be persisted as a dead `blob:` string. Returns a new tree; does not mutate
 * the input. Images without a matching upload (e.g. external URLs) are left as-is, so
 * the reader keeps their `url`.
 */
export function attachBlobRefs(
	blocks: BlockNode[],
	lookup: ( url: string ) => BlobUpload | undefined
): BlockNode[] {
	return blocks.map( ( block ) => {
		const url = block.attributes?.url;
		const upload = IMAGE_BLOCKS.has( block.name ) && typeof url === 'string'
			? lookup( url )
			: undefined;
		return {
			name: block.name,
			attributes: upload
				? { ...block.attributes, skypressBlob: upload.ref, url: upload.url }
				: { ...block.attributes },
			innerBlocks: attachBlobRefs( block.innerBlocks ?? [], lookup ),
		};
	} );
}
