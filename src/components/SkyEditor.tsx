import {
	useCallback,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createBlock, type BlockInstance } from '@wordpress/blocks';
import {
	BlockEditorProvider,
	BlockList,
	BlockTools,
	BlockToolbar,
	BlockInspector,
	Inserter,
	WritingFlow,
	ObserveTyping,
	BlockEditorKeyboardShortcuts,
} from '@wordpress/block-editor';
import { Button, Popover, SlotFillProvider } from '@wordpress/components';
import { ShortcutProvider } from '@wordpress/keyboard-shortcuts';
import { useStateWithHistory } from '@wordpress/compose';
import { cog, undo as undoIcon, redo as redoIcon } from '@wordpress/icons';

// Default rich-text formats (bold, italic, link, inline code, …) register as a
// side effect of importing the package.
import '@wordpress/format-library';

// Side-effect import: must run AFTER @wordpress/block-editor so our
// editor.MediaUpload filter registers last and replaces the bundled
// wp.media-based one (see the module).
import '../lib/media/registerMediaUpload';

// The editor island owns the editor + component + block styles. Reading pages
// import only the *frontend* block styles (Decision 0003) — never these.
import '@wordpress/components/build-style/style.css';
import '@wordpress/block-editor/build-style/style.css';
import '@wordpress/block-editor/build-style/content.css';
// (@wordpress/format-library ships no `build-style` export subpath; the inline
// format UI is styled by the components + block-editor stylesheets above.)
import '@wordpress/block-library/build-style/common.css';
import '@wordpress/block-library/build-style/style.css';
import '@wordpress/block-library/build-style/editor.css';
import '@wordpress/block-library/build-style/theme.css';

import { registerSkyPressBlocks } from '../lib/blocks/serialize';
import { ALLOWED_BLOCKS } from '../lib/blocks/allowlist';
import type { MediaUploadHandler } from '../lib/media/mediaUpload';
import { registerMentionFormat } from '../lib/editor/mention-format';
import { registerMentionAutocompleter } from '../lib/editor/mention-autocompleter';
import { registerEmbedPreviewMiddleware } from '../lib/editor/embed-preview';
import type { BlockNode } from '../lib/blocks/render';

export const SPIKE_BLOCKS_KEY = 'skypress:spike:blocks';

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

interface SkyEditorProps {
	/** Receives the live block tree on every change (for the publish flow, SP2). */
	onChange?: ( blocks: BlockInstance[] ) => void;
	/** Custom Gutenberg media handler — uploads to the PDS as a blob (SP3). */
	mediaUpload?: MediaUploadHandler;
	/** Existing article content to load when editing (SP5). */
	initialBlocks?: BlockNode[];
}

/**
 * Standalone Gutenberg editor, composed directly from `@wordpress/block-editor`
 * (Decision 0021 — we no longer wrap `@automattic/isolated-block-editor`). The
 * `BlockEditorProvider` holds the block tree; `BlockTools` + `WritingFlow` +
 * `ObserveTyping` + `BlockList` are the canvas; undo/redo is app-level via
 * `useStateWithHistory`. Restricted to the curated block set (Decision 0002).
 *
 * The live block tree is forwarded on every change via `onChange` (the structured
 * array — not HTML) so the Studio can publish it, and persisted as a local draft.
 *
 * Rendered with `client:only="react"` so its (heavy) bundle never reaches reading
 * pages (Decision 0001 / 0003).
 */
export default function SkyEditor( { onChange, mediaUpload, initialBlocks }: SkyEditorProps ) {
	// Register the curated block set + the `@`-mention format/autocompleter, and
	// build the initial editor blocks — once per mount, before `BlockList` first
	// renders (all idempotent). Studio remounts SkyEditor (keyed) when switching
	// articles, so reading `initialBlocks` at mount is sufficient.
	const initialValue = useMemo( () => {
		registerSkyPressBlocks();
		registerMentionFormat();
		registerMentionAutocompleter();
		registerEmbedPreviewMiddleware();
		return initialBlocks && initialBlocks.length > 0 ? toEditorBlocks( initialBlocks ) : [];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const {
		value,
		setValue: setBlocks,
		undo,
		redo,
		hasUndo,
		hasRedo,
	} = useStateWithHistory< BlockInstance[] >( initialValue );
	// `@wordpress/compose` types `value` as `unknown` (its generic isn't propagated
	// to the return) even though it round-trips exactly what `setValue` was given.
	const blocks = value as BlockInstance[];

	// Empty until the first change. Kept in the DOM as an `aria-live` region so
	// "Draft saved" updates are announced; the `:empty` rule clips it out of view
	// (not `display: none`, which would drop it from the a11y tree) while idle.
	const [ status, setStatus ] = useState< string >( '' );
	const [ showInspector, setShowInspector ] = useState( false );
	const inspectorToggleRef = useRef< HTMLButtonElement >( null );

	// Persist a local draft and forward the live tree to the publish flow.
	const forward = useCallback(
		( next: BlockInstance[] ) => {
			window.localStorage.setItem( SPIKE_BLOCKS_KEY, JSON.stringify( next ) );
			setStatus( `Draft saved · ${ next.length } block(s)` );
			onChange?.( next );
		},
		[ onChange ]
	);

	// `onInput` = transient edits (typing) → staged into the pending history record;
	// `onChange` = persistent edits (insert/remove/move) → a new undo step. Both keep
	// the publish state current.
	const onInput = useCallback(
		( next: BlockInstance[] ) => {
			setBlocks( next, true );
			forward( next );
		},
		[ setBlocks, forward ]
	);
	const onChangeBlocks = useCallback(
		( next: BlockInstance[] ) => {
			setBlocks( next, false );
			forward( next );
		},
		[ setBlocks, forward ]
	);

	const settings = useMemo(
		() => ( {
			// A custom mediaUpload routes uploads to the PDS as a blob (SP3).
			...( mediaUpload ? { mediaUpload } : {} ),
			// Restrict the inserter/transforms to the curated set. The registry is
			// already pruned to it (registerSkyPressBlocks); this scopes the UI too.
			allowedBlockTypes: [ ...ALLOWED_BLOCKS ],
			// Render the selected block's tools in a fixed `<BlockToolbar>` we place in
			// the header (vs. a popover that floats by the block). The framework
			// recommends this for a custom-composed editor — the floating toolbar needs
			// iframe/content-ref plumbing that a bespoke inline canvas doesn't provide.
			hasFixedToolbar: true,
		} ),
		[ mediaUpload ]
	);

	// Undo/redo from the keyboard. Capture phase so we win over contentEditable's
	// native history before rich-text handles the key.
	const onKeyDownCapture = useCallback(
		( event: ReactKeyboardEvent ) => {
			const mod = event.metaKey || event.ctrlKey;
			if ( ! mod || event.key.toLowerCase() !== 'z' ) {
				return;
			}
			event.preventDefault();
			if ( event.shiftKey ) {
				redo();
			} else {
				undo();
			}
		},
		[ undo, redo ]
	);

	return (
		<ShortcutProvider>
			<SlotFillProvider>
				<BlockEditorProvider
					value={ blocks }
					onInput={ onInput }
					onChange={ onChangeBlocks }
					settings={ settings }
				>
					{ /* eslint-disable-next-line jsx-a11y/no-static-element-interactions */ }
					<div className="skypress-editor" onKeyDownCapture={ onKeyDownCapture }>
						<div className="skypress-editor__toolbar">
							<Inserter rootClientId={ undefined } />
							{ /* The selected block's formatting/transform tools (bold,
							     italic, link, the @-mention format, …). Empty when no
							     block is selected. */ }
							<BlockToolbar hideDragHandle />
							<div className="skypress-editor__toolbar-spacer" />
							<Button
								icon={ undoIcon }
								label="Undo"
								onClick={ undo }
								disabled={ ! hasUndo }
							/>
							<Button
								icon={ redoIcon }
								label="Redo"
								onClick={ redo }
								disabled={ ! hasRedo }
							/>
							<Button
								ref={ inspectorToggleRef }
								icon={ cog }
								label="Block settings"
								isPressed={ showInspector }
								aria-expanded={ showInspector }
								onClick={ () => setShowInspector( ( open ) => ! open ) }
							/>
							{ showInspector && (
								<Popover
									anchor={ inspectorToggleRef.current }
									placement="bottom-end"
									onClose={ () => setShowInspector( false ) }
									className="skypress-editor__inspector"
								>
									<BlockInspector />
								</Popover>
							) }
						</div>

						<div className="skypress-editor__body editor-styles-wrapper">
							<BlockTools>
								<BlockEditorKeyboardShortcuts.Register />
								<WritingFlow>
									<ObserveTyping>
										<BlockList />
									</ObserveTyping>
								</WritingFlow>
							</BlockTools>
						</div>

						<Popover.Slot />

						<p className="skypress-editor__status" aria-live="polite">
							{ status }
						</p>
					</div>
				</BlockEditorProvider>
			</SlotFillProvider>
		</ShortcutProvider>
	);
}
