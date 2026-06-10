import { useRef, useState } from 'react';
import { validateCoverFile, type CoverUpload } from '../lib/media/cover';

interface Props {
	/** The currently chosen cover, or `null` when none is set. */
	cover: CoverUpload | null;
	/** Upload a chosen file to the PDS; resolves with the persistable ref + a preview URL. */
	onUpload: ( file: File ) => Promise< CoverUpload >;
	/** Report the new cover (or `null` when removed) to the parent. */
	onChange: ( cover: CoverUpload | null ) => void;
}

/**
 * The per-article cover image picker, shown below the editor (outside the block canvas).
 * Reuses the same PDS upload path as content images via `onUpload`. Surfaces the 1 MB cap as
 * helper text AND as the rejection message, and — when no cover is set — makes the
 * "first body image" fallback visible (design 2026-06-10).
 */
export default function CoverImagePicker( { cover, onUpload, onChange }: Props ) {
	const inputRef = useRef< HTMLInputElement >( null );
	const [ uploading, setUploading ] = useState( false );
	const [ error, setError ] = useState< string | null >( null );

	async function handleFiles( files: FileList | null ) {
		const file = files?.[ 0 ];
		if ( ! file ) {
			return;
		}
		const validationError = validateCoverFile( file );
		if ( validationError ) {
			setError( validationError );
			return;
		}
		setError( null );
		setUploading( true );
		try {
			const next = await onUpload( file );
			onChange( next );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
		} finally {
			setUploading( false );
			// Let the writer re-select the same file after a remove/replace.
			if ( inputRef.current ) {
				inputRef.current.value = '';
			}
		}
	}

	return (
		<section className="studio__cover" aria-label="Cover image">
			<span className="studio__cover-label">Cover image</span>

			{ cover ? (
				<div className="studio__cover-preview">
					<img className="studio__cover-image" src={ cover.previewUrl } alt="" />
					<div className="studio__cover-actions">
						<button
							type="button"
							onClick={ () => inputRef.current?.click() }
							disabled={ uploading }
						>
							{ uploading ? 'Uploading…' : 'Replace' }
						</button>
						<button
							type="button"
							onClick={ () => {
								setError( null );
								onChange( null );
							} }
							disabled={ uploading }
						>
							Remove
						</button>
					</div>
				</div>
			) : (
				<div className="studio__cover-empty">
					<button
						type="button"
						onClick={ () => inputRef.current?.click() }
						disabled={ uploading }
					>
						{ uploading ? 'Uploading…' : 'Upload cover image' }
					</button>
					<p className="studio__cover-hint">
						No cover set — the first image in your article will be used. PNG, JPG,
						or GIF, max 1 MB.
					</p>
				</div>
			) }

			<input
				ref={ inputRef }
				className="studio__cover-input"
				type="file"
				accept="image/*"
				hidden
				onChange={ ( event ) => void handleFiles( event.target.files ) }
			/>

			{ error && (
				<p className="studio__cover-error" role="alert">
					{ error }
				</p>
			) }
		</section>
	);
}
