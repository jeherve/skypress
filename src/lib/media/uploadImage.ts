/**
 * Upload a single image (the publication logo) to the writer's PDS and return its stored blob
 * ref (SP10, step C). Reuses the same `agent.uploadBlob` path as the editor's media pipeline
 * (Decision 0006); the returned `BlobRefJson` is what gets baked into the publication record's
 * `icon` field. Enforces the lexicon's icon limits (≤1MB, `image/*`) client-side, before upload.
 */
import type { Agent } from '@atproto/api';
import type { BlobRefJson } from './blob';

/** The `site.standard.publication.icon` lexicon limit. */
export const PUBLICATION_ICON_MAX_BYTES = 1_000_000;

/** Thrown for client-side validation failures (wrong type / too large) — shown to the user. */
export class ImageValidationError extends Error {
	constructor( message: string ) {
		super( message );
		this.name = 'ImageValidationError';
	}
}

export async function uploadImageBlob(
	agent: Agent,
	file: File,
	options: { maxBytes?: number } = {}
): Promise< BlobRefJson > {
	const maxBytes = options.maxBytes ?? PUBLICATION_ICON_MAX_BYTES;
	if ( ! file.type.startsWith( 'image/' ) ) {
		throw new ImageValidationError( 'Choose an image file (PNG, JPG, GIF, WebP, …).' );
	}
	if ( file.size > maxBytes ) {
		const limitMb = Math.round( ( maxBytes / 1_000_000 ) * 100 ) / 100;
		throw new ImageValidationError( `Image must be ${ limitMb }MB or smaller.` );
	}
	const res = await agent.uploadBlob( file, { encoding: file.type } );
	const { blob } = res.data;
	return {
		$type: 'blob',
		ref: { $link: blob.ref.toString() },
		mimeType: blob.mimeType,
		size: blob.size,
	};
}
