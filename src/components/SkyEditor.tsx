import { useCallback, useState } from 'react';
import IsolatedBlockEditor from '@automattic/isolated-block-editor';
// Side-effect import: must run AFTER isolated-block-editor so our editor.MediaUpload
// filter registers last and replaces the bundled wp.media-based one (see the module).
import '../lib/media/registerMediaUpload';
import { createBlock, type BlockInstance } from '@wordpress/blocks';
import type { BlockNode } from '../lib/blocks/render';

/** Rebuild editor block instances from stored block nodes (for editing, SP5). */
function toEditorBlocks( nodes: BlockNode[] ): BlockInstance[] {
	return nodes.map( ( node ) =>
		createBlock(
			node.name,
			{ ...node.attributes },
			toEditorBlocks( node.innerBlocks ?? [] )
		)
	);
}

// Compiled editor-chrome styles (prebuilt — no Sass needed for these).
import '@automattic/isolated-block-editor/build-browser/core.css';
import '@automattic/isolated-block-editor/build-browser/isolated-block-editor.css';

import { ALLOWED_BLOCKS } from '../lib/blocks/allowlist';
import type { MediaUploadHandler } from '../lib/media/mediaUpload';
import { registerMentionFormat } from '../lib/editor/mention-format';
import { registerMentionAutocompleter } from '../lib/editor/mention-autocompleter';

export const SPIKE_BLOCKS_KEY = 'skypress:spike:blocks';

interface SkyEditorProps {
	/** Receives the live block tree on every change (for the publish flow, SP2). */
	onChange?: ( blocks: BlockInstance[] ) => void;
	/** Custom Gutenberg media handler — uploads to the PDS as a blob (SP3). */
	mediaUpload?: MediaUploadHandler;
	/** Existing article content to load when editing (SP5). */
	initialBlocks?: BlockNode[];
}

/**
 * Standalone Gutenberg editor restricted to the curated SkyPress block set.
 * `onSaveBlocks` fires on every change with the live block tree (the structured
 * array — not HTML); we persist a local draft and forward it via `onChange` so the
 * Studio can publish it (SP2).
 *
 * Rendered with `client:only="react"` so its (heavy) bundle never reaches
 * reading pages (Decision 0001).
 */
export default function SkyEditor( { onChange, mediaUpload, initialBlocks }: SkyEditorProps ) {
	// Empty until the first autosave. The in-editor placeholder already prompts
	// the writer; this line is reserved for save feedback ("Draft saved · …").
	// Kept in the DOM as an `aria-live` region so updates are announced; the
	// `:empty` rule clips it out of view (not `display: none`, which would drop
	// it from the accessibility tree and suppress the announcement) while idle.
	const [ status, setStatus ] = useState< string >( '' );

	// Runs once per editor mount, after the isolated editor has registered its
	// `@wordpress` stores and core blocks globally. We use it to activate the
	// `@`-mention format + autocompleter (both idempotent) and, when editing, to
	// rebuild block instances from the stored tree.
	const onLoad = useCallback( (): BlockInstance[] => {
		registerMentionFormat();
		registerMentionAutocompleter();
		return initialBlocks && initialBlocks.length > 0
			? toEditorBlocks( initialBlocks )
			: [];
	}, [ initialBlocks ] );

	const onSaveBlocks = useCallback(
		( blocks: BlockInstance[] ) => {
			window.localStorage.setItem( SPIKE_BLOCKS_KEY, JSON.stringify( blocks ) );
			setStatus( `Draft saved · ${ blocks.length } block(s)` );
			onChange?.( blocks );
		},
		[ onChange ]
	);

	const settings = {
		// Core block-editor settings: a custom mediaUpload routes uploads to the PDS (SP3).
		editor: {
			...( mediaUpload ? { mediaUpload } : {} ),
			// isolated-block-editor defaults to a fixed top toolbar (the block tools
			// dock into the header). Turn that off so the contextual block toolbar
			// floats with — and follows — the selected block as you write.
			hasFixedToolbar: false,
		},
		iso: {
			moreMenu: false,
			footer: true,
			// Adds a settings (gear) button to the toolbar that opens the block
			// inspector as a popover (e.g. an image block's Alt text field).
			toolbar: {
				inspector: true,
			},
			blocks: {
				allowBlocks: [ ...ALLOWED_BLOCKS ],
			},
		},
	};

	return (
		<div className="skypress-editor">
			<IsolatedBlockEditor
				settings={ settings }
				onSaveBlocks={ onSaveBlocks }
				onLoad={ onLoad }
				onError={ () => (
					<p role="alert">The editor hit an error. Reload to try again.</p>
				) }
			/>
			<p className="skypress-editor__status" aria-live="polite">
				{ status }
			</p>
		</div>
	);
}
