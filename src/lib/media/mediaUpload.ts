import type { Agent } from '@atproto/api';
import { buildGetBlobUrl, type BlobUpload } from './blob';

/** Maps a preview (data) URL → its blob ref + canonical getBlob URL for this session. */
export type BlobRegistry = Map< string, BlobUpload >;

/**
 * Forget the previews held by `registry` and empty it. Previews are `data:` URLs (plain
 * strings, no `File` pinned), so there is nothing to revoke — but the map must still be
 * cleared so a later article can't accidentally resolve a stale preview at publish. Call
 * this only when those previews are no longer on screen (the editor is being torn down for
 * a new/other article, or unmounted), never mid-edit.
 */
export function revokeBlobRegistry( registry: BlobRegistry ): void {
	registry.clear();
}

/** Read a file into a `data:` URL (base64) for inline preview. */
function readAsDataUrl( file: File ): Promise< string > {
	return new Promise( ( resolve, reject ) => {
		const reader = new FileReader();
		reader.onload = () => resolve( reader.result as string );
		reader.onerror = () => reject( reader.error ?? new Error( `Could not read "${ file.name }".` ) );
		reader.readAsDataURL( file );
	} );
}

interface MediaFile {
	url: string;
	alt: string;
}

interface MediaUploadArgs {
	filesList: ArrayLike< File >;
	onFileChange: ( files: MediaFile[] ) => void;
	onError?: ( error: unknown ) => void;
	allowedTypes?: string[];
	maxUploadFileSize?: number;
}

/**
 * A Gutenberg `mediaUpload` handler backed by atproto blobs (Decision 0006):
 * upload each file to the writer's PDS, hand back a `data:` URL for preview, and record
 * the blob ref + canonical `getBlob` URL in `registry` so publish can persist them.
 *
 * Preview uses a `data:` URL rather than the live `getBlob` URL because a just-uploaded
 * blob is unreferenced (temporary on the PDS) until a record commits it —
 * `com.atproto.sync.getBlob` fails for it, so an inline `getBlob` preview would 500.
 *
 * Crucially the preview must NOT be a `blob:` object URL: the Image block treats any
 * `blob:` URL as a still-uploading image (`is-transient` + a Spinner) and re-runs its own
 * upload hook expecting a non-`blob:` URL back — so a `blob:` preview spins forever and
 * never commits. A `data:` URL reads as an ordinary inline image and renders immediately.
 */
export type MediaUploadHandler = ( args: MediaUploadArgs ) => Promise< void >;

export function createMediaUpload( config: {
	agent: Agent;
	did: string;
	pdsUrl: string;
	registry: BlobRegistry;
} ): MediaUploadHandler {
	const { agent, did, pdsUrl, registry } = config;

	return async function mediaUpload( {
		filesList,
		onFileChange,
		onError,
		maxUploadFileSize,
	}: MediaUploadArgs ): Promise< void > {
		for ( const file of Array.from( filesList ) ) {
			try {
				if ( maxUploadFileSize && file.size > maxUploadFileSize ) {
					const mb = Math.round( maxUploadFileSize / 1024 / 1024 );
					throw new Error( `"${ file.name }" exceeds the ${ mb }MB limit.` );
				}
				const res = await agent.uploadBlob( file, { encoding: file.type } );
				const { blob } = res.data;
				const cid = blob.ref.toString();
				// Preview from a data: URL; persist the portable getBlob URL on publish.
				const previewUrl = await readAsDataUrl( file );
				registry.set( previewUrl, {
					ref: {
						$type: 'blob',
						ref: { $link: cid },
						mimeType: blob.mimeType,
						size: blob.size,
					},
					url: buildGetBlobUrl( pdsUrl, did, cid ),
				} );
				// No `id`: PDS blobs aren't WP attachments, so the image block must not try
				// to resolve one via /wp/v2/media/<id> (that 404s).
				onFileChange( [ { url: previewUrl, alt: '' } ] );
			} catch ( error ) {
				onError?.( error instanceof Error ? error : new Error( String( error ) ) );
			}
		}
	};
}
