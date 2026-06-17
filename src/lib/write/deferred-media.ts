import type { MediaUploadHandler } from '../media/mediaUpload';

/** Read a file into a `data:` URL (base64) for inline preview. */
function readAsDataUrl( file: File ): Promise< string > {
	return new Promise( ( resolve, reject ) => {
		const reader = new FileReader();
		reader.onload = () => resolve( reader.result as string );
		reader.onerror = () =>
			reject( reader.error ?? new Error( `Could not read "${ file.name }".` ) );
		reader.readAsDataURL( file );
	} );
}

/**
 * A Gutenberg `mediaUpload` handler for the writing-first flow (design 2026-06-17): it
 * previews each file from a `data:` URL and uploads NOTHING to a PDS. The real upload is
 * deferred to publish (see `upload-held.ts`), so the editor works while signed out.
 *
 * Like the eager handler it must preview from a `data:` URL, never a `blob:` URL — the Image
 * block treats a `blob:` URL as still-uploading and re-runs its upload hook forever.
 */
export function createDeferredMediaUpload(): MediaUploadHandler {
	return async function deferredMediaUpload( {
		filesList,
		onFileChange,
		onError,
		maxUploadFileSize,
	} ): Promise< void > {
		for ( const file of Array.from( filesList ) ) {
			try {
				if ( maxUploadFileSize && file.size > maxUploadFileSize ) {
					const mb = Math.round( maxUploadFileSize / 1024 / 1024 );
					throw new Error( `"${ file.name }" exceeds the ${ mb }MB limit.` );
				}
				const previewUrl = await readAsDataUrl( file );
				// No `id`: PDS blobs aren't WP attachments (mirrors the eager handler).
				onFileChange( [ { url: previewUrl, alt: '' } ] );
			} catch ( error ) {
				onError?.( error instanceof Error ? error : new Error( String( error ) ) );
			}
		}
	};
}
