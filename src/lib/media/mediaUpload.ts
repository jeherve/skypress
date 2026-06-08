import type { Agent } from '@atproto/api';
import { buildGetBlobUrl, type BlobUpload } from './blob';

/** Maps a preview (object) URL → its blob ref + canonical getBlob URL for this session. */
export type BlobRegistry = Map< string, BlobUpload >;

/**
 * Release the preview object URLs held by `registry` and empty it. Each preview URL was
 * minted with `URL.createObjectURL`, which pins its `File` in memory until revoked — so
 * an editing session that uploads many images would otherwise leak them all until the
 * page unloads. Call this only when those previews are no longer on screen (the editor is
 * being torn down for a new/other article, or unmounted), never mid-edit.
 */
export function revokeBlobRegistry( registry: BlobRegistry ): void {
	for ( const previewUrl of registry.keys() ) {
		URL.revokeObjectURL( previewUrl );
	}
	registry.clear();
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
 * upload each file to the writer's PDS, hand back a local object URL for preview, and
 * record the blob ref + canonical `getBlob` URL in `registry` so publish can persist them.
 *
 * Preview uses a local object URL rather than the live `getBlob` URL because a
 * just-uploaded blob is unreferenced (temporary on the PDS) until a record commits it —
 * `com.atproto.sync.getBlob` fails for it, so an inline `getBlob` preview would 500.
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
				// Preview from a local object URL; persist the portable getBlob URL on publish.
				const previewUrl = URL.createObjectURL( file );
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
