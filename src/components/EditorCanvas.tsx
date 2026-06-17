import { useLayoutEffect, useRef } from 'react';
import type { BlockInstance } from '@wordpress/blocks';
import SkyEditor from './SkyEditor';
import CoverImagePicker from './CoverImagePicker';
import type { MediaUploadHandler } from '../lib/media/mediaUpload';
import type { CoverUpload } from '../lib/media/cover';
import type { BlockNode } from '../lib/blocks/render';

interface Props {
	title: string;
	onTitleChange: ( value: string ) => void;
	lede: string;
	onLedeChange: ( value: string ) => void;
	/** Live block instances on every editor change — the parent normalises/stores as it needs. */
	onBlocksChange: ( blocks: BlockInstance[] ) => void;
	mediaUpload?: MediaUploadHandler;
	initialBlocks?: BlockNode[];
	cover: CoverUpload | null;
	/** When provided, the cover picker renders and uploads through this handler (eager or deferred). */
	onCoverUpload?: ( file: File ) => Promise< CoverUpload >;
	onCoverChange: ( cover: CoverUpload | null ) => void;
}

/**
 * The shared writing surface for both the editor (`/editor`) and the writing-first page
 * (`/write`): the borderless title + lede headings above the framed block canvas, plus the
 * optional per-article cover picker. Presentational — it owns no document state, only the
 * textareas' auto-grow. Each island wires the content state, the media-upload handler, and
 * (for the cover) the upload path that fits its flow: eager PDS upload in the editor, deferred
 * `data:`-URL hold in the writing-first flow. Lives only in `client:only` islands — it pulls in
 * `SkyEditor`, which is browser-only (Decision 0003).
 */
export default function EditorCanvas( {
	title,
	onTitleChange,
	lede,
	onLedeChange,
	onBlocksChange,
	mediaUpload,
	initialBlocks,
	cover,
	onCoverUpload,
	onCoverChange,
}: Props ) {
	const titleRef = useRef< HTMLTextAreaElement >( null );
	const ledeRef = useRef< HTMLTextAreaElement >( null );

	// Grow the title textarea to fit its content so long titles wrap into view instead of
	// clipping on one line. Layout effect so it sizes before paint.
	useLayoutEffect( () => {
		const el = titleRef.current;
		if ( ! el ) {
			return;
		}
		el.style.height = 'auto';
		el.style.height = `${ el.scrollHeight }px`;
	}, [ title ] );

	// Same auto-grow for the lede (and on hydrate from an edit-load / restored draft).
	useLayoutEffect( () => {
		const el = ledeRef.current;
		if ( ! el ) {
			return;
		}
		el.style.height = 'auto';
		el.style.height = `${ el.scrollHeight }px`;
	}, [ lede ] );

	return (
		<>
			<textarea
				ref={ titleRef }
				className="studio__title"
				rows={ 1 }
				placeholder="Add title"
				aria-label="Article title"
				value={ title }
				// Single-line semantically: let it wrap visually, but don't let Enter insert a
				// literal newline into the stored value.
				onKeyDown={ ( event ) => {
					if ( event.key === 'Enter' ) {
						event.preventDefault();
					}
				} }
				onChange={ ( event ) => onTitleChange( event.target.value ) }
			/>
			<textarea
				ref={ ledeRef }
				className="studio__lede"
				rows={ 1 }
				maxLength={ 3000 }
				placeholder="Add a subtitle…"
				aria-label="Subtitle"
				value={ lede }
				onChange={ ( event ) => onLedeChange( event.target.value ) }
			/>
			{ lede.length > 200 && (
				<p className="studio__lede-hint">
					Long subtitles get truncated on the Bluesky card.
				</p>
			) }
			<SkyEditor
				onChange={ onBlocksChange }
				mediaUpload={ mediaUpload }
				initialBlocks={ initialBlocks }
			/>
			{ onCoverUpload && (
				<CoverImagePicker cover={ cover } onUpload={ onCoverUpload } onChange={ onCoverChange } />
			) }
		</>
	);
}
