import { useCallback, useState } from 'react';
import IsolatedBlockEditor from '@automattic/isolated-block-editor';
import type { BlockInstance } from '@wordpress/blocks';

// Compiled editor-chrome styles (prebuilt — no Sass needed for these).
import '@automattic/isolated-block-editor/build-browser/core.css';
import '@automattic/isolated-block-editor/build-browser/isolated-block-editor.css';

import { ALLOWED_BLOCKS } from '../lib/blocks/allowlist';

export const SPIKE_BLOCKS_KEY = 'skypress:spike:blocks';

/**
 * SP0 spike island: a standalone Gutenberg editor restricted to the curated
 * SkyPress block set. `onSaveBlocks` fires on every change with the live block
 * tree (the structured array — not HTML); the spike persists it to localStorage
 * to prove the canonical content path. PDS persistence arrives in SP2.
 *
 * Rendered with `client:only="react"` so its (heavy) bundle never reaches
 * reading pages (Decision 0001).
 */
export default function SkyEditor() {
	const [ status, setStatus ] = useState< string >( 'Start writing…' );

	const onSaveBlocks = useCallback( ( blocks: BlockInstance[] ) => {
		window.localStorage.setItem(
			SPIKE_BLOCKS_KEY,
			JSON.stringify( blocks )
		);
		setStatus( `Captured ${ blocks.length } top-level block(s) → localStorage` );
	}, [] );

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
