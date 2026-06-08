import type { Agent } from '@atproto/api';
import { buildGetBlobUrl, type BlobRefJson } from './blob';

/** Maps a returned `getBlob` URL → its stored blob ref (filled during this session). */
export type BlobRegistry = Map< string, BlobRefJson >;

interface MediaFile {
	id: string;
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
 * upload each file to the writer's PDS, hand back a `getBlob` URL for preview, and
 * record the full blob ref in `registry` so the publish step can persist it.
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
				const url = buildGetBlobUrl( pdsUrl, did, cid );
				registry.set( url, {
					$type: 'blob',
					ref: { $link: cid },
					mimeType: blob.mimeType,
					size: blob.size,
				} );
				onFileChange( [ { id: cid, url, alt: '' } ] );
			} catch ( error ) {
				onError?.( error instanceof Error ? error : new Error( String( error ) ) );
			}
		}
	};
}
