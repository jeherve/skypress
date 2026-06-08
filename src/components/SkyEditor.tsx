import { useCallback, useState } from 'react';
import IsolatedBlockEditor from '@automattic/isolated-block-editor';
import type { BlockInstance } from '@wordpress/blocks';

// Compiled editor-chrome styles (prebuilt — no Sass needed for these).
import '@automattic/isolated-block-editor/build-browser/core.css';
import '@automattic/isolated-block-editor/build-browser/isolated-block-editor.css';

import { ALLOWED_BLOCKS } from '../lib/blocks/allowlist';

export const SPIKE_BLOCKS_KEY = 'skypress:spike:blocks';

interface SkyEditorProps {
	/** Receives the live block tree on every change (for the publish flow, SP2). */
	onChange?: ( blocks: BlockInstance[] ) => void;
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
export default function SkyEditor( { onChange }: SkyEditorProps ) {
	const [ status, setStatus ] = useState< string >( 'Start writing…' );

	const onSaveBlocks = useCallback(
		( blocks: BlockInstance[] ) => {
			window.localStorage.setItem( SPIKE_BLOCKS_KEY, JSON.stringify( blocks ) );
			setStatus( `Draft saved · ${ blocks.length } block(s)` );
			onChange?.( blocks );
		},
		[ onChange ]
	);

	const settings = {
		iso: {
			moreMenu: false,
			footer: true,
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
