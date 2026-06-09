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
 * transient `data:` URL; `attachBlobRefs` looks that key up at publish and persists the
 * portable `url` (a `getBlob` URL) plus the typed `ref` (`skypressBlob`).
 */
export interface BlobUpload {
	ref: BlobRefJson;
	url: string;
}

/** Block names whose `url` attribute may reference an uploaded blob. */
const IMAGE_BLOCKS = new Set( [ 'core/image' ] );

/**
 * The `app.bsky.embed.external` thumb blob constraint: `image/*`, ≤ 1,000,000 bytes. A blob
 * larger than this is rejected by the post lexicon, so we skip it rather than fail the publish.
 */
export const BSKY_THUMB_MAX_BYTES = 1_000_000;

/**
 * The blob ref to use as a companion Bluesky post's `embed.external.thumb` (Decision 0014):
 * the first uploaded `core/image` block's `skypressBlob` (depth-first, `innerBlocks` included)
 * that the post lexicon will accept — `image/*` and `0 < size ≤ BSKY_THUMB_MAX_BYTES`.
 *
 * Returns undefined when the document has no usable uploaded image; the caller then omits
 * `thumb` (the standard.site card still renders via `associatedRefs`). External images (no
 * `skypressBlob`) are skipped — turning a remote URL into a thumb would need a byte-fetch +
 * the SSRF guard, deferred. Reuses the in-repo blob ref (no re-upload): atproto blobs are
 * content-addressed and repo-scoped, and the publish flow commits the document (which
 * references this blob) before the post, so the post can reference the same CID.
 */
export function firstImageBlobRef( blocks: BlockNode[] ): BlobRefJson | undefined {
	for ( const block of blocks ) {
		if ( IMAGE_BLOCKS.has( block.name ) ) {
			const ref = normalizeBlobRefJson( block.attributes?.skypressBlob );
			if (
				ref &&
				ref.mimeType.startsWith( 'image/' ) &&
				ref.size > 0 &&
				ref.size <= BSKY_THUMB_MAX_BYTES
			) {
				return ref;
			}
		}
		const nested = firstImageBlobRef( block.innerBlocks ?? [] );
		if ( nested ) {
			return nested;
		}
	}
	return undefined;
}

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

/**
 * Coerce a blob ref into the portable JSON (`{ ref: { $link } }`) shape, whatever form the
 * source handed us. Records read through the `@atproto/api` agent are run through `jsonToLex`,
 * which turns blob fields into `BlobRef` instances whose `ref` is a CID OBJECT (no `$link`) —
 * reading `icon.ref.$link` off one yields `undefined` (→ `cid=undefined` in a getBlob URL).
 * Records fetched as raw JSON (the reader's `safeFetch` path) already carry `{ $link }`. This
 * accepts either and always returns `BlobRefJson`, or `undefined` if there's no usable CID.
 */
export function normalizeBlobRefJson( value: unknown ): BlobRefJson | undefined {
	if ( ! value || typeof value !== 'object' ) {
		return undefined;
	}
	const raw = value as { ref?: unknown; mimeType?: unknown; size?: unknown };
	const ref = raw.ref;
	// JSON shape: ref.$link. BlobRef shape: ref is a CID whose toString() is the CID string.
	const cid =
		ref && typeof ref === 'object' && typeof ( ref as { $link?: unknown } ).$link === 'string'
			? ( ref as { $link: string } ).$link
			: ref != null
				? String( ref )
				: undefined;
	if ( ! cid ) {
		return undefined;
	}
	return {
		$type: 'blob',
		ref: { $link: cid },
		mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : '',
		size: typeof raw.size === 'number' ? raw.size : 0,
	};
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
