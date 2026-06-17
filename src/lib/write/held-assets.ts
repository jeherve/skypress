import type { BlockNode } from '../blocks/render';

/** Block names whose `url` attribute may hold a held (data:) image. Mirrors blob.ts. */
const IMAGE_BLOCKS = new Set( [ 'core/image' ] );

/** True when `value` is a `data:` URL string. */
export function isDataUrl( value: unknown ): value is string {
	return typeof value === 'string' && value.startsWith( 'data:' );
}

/** Rebuild a `Blob` (bytes + mime type) from a base64 `data:` URL. */
export function dataUrlToBlob( dataUrl: string ): Blob {
	const comma = dataUrl.indexOf( ',' );
	const header = dataUrl.slice( 5, comma ); // after "data:"
	const mimeType = header.split( ';' )[ 0 ] || 'application/octet-stream';
	const base64 = dataUrl.slice( comma + 1 );
	const binary = atob( base64 );
	const bytes = new Uint8Array( binary.length );
	for ( let i = 0; i < binary.length; i++ ) {
		bytes[ i ] = binary.charCodeAt( i );
	}
	return new Blob( [ bytes ], { type: mimeType } );
}

export interface AssetSkeleton {
	blocks: BlockNode[];
	/** `'cover'` when a held cover exists, else `null`. */
	cover: string | null;
}

/**
 * Replace every held (`data:`) image URL in the tree — and the cover — with a short token,
 * returning the lightweight skeleton plus a `token → dataUrl` map. Body tokens are `a0`,
 * `a1`, … allocated depth-first; the cover token is the literal `'cover'`. External image
 * URLs and non-image blocks are left untouched. Pure; returns new objects.
 */
export function splitAssets(
	blocks: BlockNode[],
	coverDataUrl: string | null
): { skeleton: AssetSkeleton; assets: Record< string, string > } {
	const assets: Record< string, string > = {};
	let n = 0;

	const walk = ( nodes: BlockNode[] ): BlockNode[] =>
		nodes.map( ( node ) => {
			const url = node.attributes?.url;
			const held = IMAGE_BLOCKS.has( node.name ) && isDataUrl( url );
			let attributes = node.attributes ? { ...node.attributes } : {};
			if ( held ) {
				const token = `a${ n++ }`;
				assets[ token ] = url as string;
				attributes = { ...attributes, url: token };
			}
			return {
				name: node.name,
				attributes,
				innerBlocks: walk( node.innerBlocks ?? [] ),
			};
		} );

	const skeletonBlocks = walk( blocks );
	let cover: string | null = null;
	if ( isDataUrl( coverDataUrl ) ) {
		assets.cover = coverDataUrl;
		cover = 'cover';
	}
	return { skeleton: { blocks: skeletonBlocks, cover }, assets };
}

/** A body asset token allocated by `splitAssets` (`a0`, `a1`, …). */
function isAssetToken( value: string ): boolean {
	return /^a\d+$/.test( value );
}

/** Inverse of `splitAssets`: swap each token back to its `data:` URL. Pure. */
export function mergeAssets(
	skeleton: AssetSkeleton,
	assets: Record< string, string >
): { blocks: BlockNode[]; coverDataUrl: string | null } {
	const walk = ( nodes: BlockNode[] ): BlockNode[] =>
		nodes.map( ( node ) => {
			const url = node.attributes?.url;
			const isImage = IMAGE_BLOCKS.has( node.name ) && typeof url === 'string';
			let attributes: Record< string, unknown >;
			if ( isImage && ( url as string ) in assets ) {
				attributes = { ...node.attributes, url: assets[ url as string ] };
			} else if ( isImage && isAssetToken( url as string ) ) {
				// Held bytes missing (e.g. IndexedDB evicted while the localStorage skeleton
				// survived): drop the dangling token rather than emit a broken `a0` src that
				// would also be published verbatim. External image URLs are not tokens, so
				// they fall through and are preserved.
				const { url: _dropped, ...rest } = node.attributes ?? {};
				attributes = { ...rest };
			} else {
				attributes = { ...( node.attributes ?? {} ) };
			}
			return {
				name: node.name,
				attributes,
				innerBlocks: walk( node.innerBlocks ?? [] ),
			};
		} );

	return {
		blocks: walk( skeleton.blocks ),
		coverDataUrl: skeleton.cover ? assets[ skeleton.cover ] ?? null : null,
	};
}
