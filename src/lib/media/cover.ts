/**
 * Per-article cover image helpers (design 2026-06-10). Pure functions + a thin bridge over
 * the existing media upload path — no `@atproto/*` or network here beyond the injected handler.
 */
import {
	BSKY_THUMB_MAX_BYTES,
	buildGetBlobUrl,
	type BlobRefJson,
} from './blob';
import type { BlobRegistry, MediaUploadHandler } from './mediaUpload';

/**
 * The cover image blob constraint — `image/*`, ≤ 1,000,000 bytes. Shared with the Bluesky
 * card thumb (`BSKY_THUMB_MAX_BYTES`) and equal to the `site.standard.document.coverImage`
 * lexicon `maxSize`, so a valid cover is always a valid thumb.
 */
export const COVER_MAX_BYTES = BSKY_THUMB_MAX_BYTES;

/** A chosen cover: the persistable blob ref + a URL to preview it in the picker. */
export interface CoverUpload {
	ref: BlobRefJson;
	previewUrl: string;
}

/**
 * Validate a candidate cover file before upload. Returns a human-readable error string, or
 * `null` when the file is an acceptable cover (`image/*` and ≤ `COVER_MAX_BYTES`).
 */
export function validateCoverFile( file: File ): string | null {
	if ( ! file.type.startsWith( 'image/' ) ) {
		return 'Choose an image file (PNG, JPG, or GIF).';
	}
	if ( file.size > COVER_MAX_BYTES ) {
		const mb = COVER_MAX_BYTES / 1_000_000;
		return `That image is too large — cover images must be ${ mb } MB or smaller.`;
	}
	return null;
}

/**
 * Build a `getBlob` preview URL for an already-committed cover (the edit-load case), from its
 * stored blob ref. A committed cover blob is referenced by the document, so `getBlob` works
 * directly — no `data:` URL needed.
 */
export function coverPreviewUrl(
	ref: BlobRefJson,
	author: { pdsUrl: string; did: string }
): string {
	return buildGetBlobUrl( author.pdsUrl, author.did, ref.ref.$link );
}

/**
 * Build the cover state for an edit-loaded article from its stored ref. Returns `null` until
 * both the PDS URL and DID are known — `pdsUrl` resolves *after* `agent`/`did` (the auth
 * provider awaits the profile + PDS lookup), so the edit-load fetch can land before it. The
 * caller must run this in an effect keyed on `pdsUrl` so the cover hydrates once it arrives;
 * returning `null` (rather than an unusable `getBlob` URL) keeps a premature call harmless.
 */
export function coverFromStoredRef(
	ref: BlobRefJson | undefined,
	author: { pdsUrl: string | null; did: string | null }
): CoverUpload | null {
	if ( ! ref || ! author.pdsUrl || ! author.did ) {
		return null;
	}
	return {
		ref,
		previewUrl: coverPreviewUrl( ref, { pdsUrl: author.pdsUrl, did: author.did } ),
	};
}

/**
 * Upload a cover file through the existing Gutenberg `mediaUpload` handler (same PDS path as
 * content images) and resolve with the persistable ref + preview URL. The handler records the
 * upload in `registry` keyed by the preview `data:` URL it returns via `onFileChange`; we read
 * the ref back out of `registry`. Rejects if the handler errors or returns nothing usable.
 */
export function uploadCoverViaMedia(
	file: File,
	mediaUpload: MediaUploadHandler,
	registry: BlobRegistry
): Promise< CoverUpload > {
	return new Promise( ( resolve, reject ) => {
		void mediaUpload( {
			filesList: [ file ],
			maxUploadFileSize: COVER_MAX_BYTES,
			onFileChange: ( files ) => {
				const previewUrl = files[ 0 ]?.url;
				const upload = previewUrl ? registry.get( previewUrl ) : undefined;
				if ( ! upload ) {
					reject( new Error( 'The upload did not return a usable image.' ) );
					return;
				}
				resolve( { ref: upload.ref, previewUrl } );
			},
			onError: ( err ) =>
				reject( err instanceof Error ? err : new Error( String( err ) ) ),
		} );
	} );
}
