import { useState } from 'react';
import type { Agent } from '@atproto/api';
import type { BlockInstance } from '@wordpress/blocks';
import {
	publish,
	updateDocument,
	type Identity,
} from '../lib/publish/publisher';
import { normalizeBlocks, type StrongRef } from '../lib/publish/records';
import { attachBlobRefs } from '../lib/media/blob';
import type { BlobRegistry } from '../lib/media/mediaUpload';

type Phase = 'idle' | 'confirm' | 'working' | 'done' | 'error';

export interface EditingTarget {
	rkey: string;
	siteUri: string;
	publishedAt: string;
	bskyPostRef?: StrongRef;
}

interface Props {
	agent: Agent;
	identity: Identity;
	blocks: BlockInstance[];
	blobRegistry: BlobRegistry;
	/** When set, the panel updates an existing article instead of publishing a new one. */
	editing?: EditingTarget;
	initialTitle?: string;
	/** Called after a successful publish/update so the parent can refresh. */
	onComplete?: () => void;
}

/**
 * Title + publish/update control. Publishing a NEW article creates a public Bluesky
 * post, so it requires an explicit confirmation (brief §10). Editing updates the
 * existing record in place and does NOT create a new post (Decision 0008).
 */
export default function PublishPanel( {
	agent,
	identity,
	blocks,
	blobRegistry,
	editing,
	initialTitle,
	onComplete,
}: Props ) {
	const [ title, setTitle ] = useState( initialTitle ?? '' );
	const [ phase, setPhase ] = useState< Phase >( 'idle' );
	const [ resultUrl, setResultUrl ] = useState< string | null >( null );
	const [ error, setError ] = useState< string | null >( null );

	const isEditing = Boolean( editing );
	const canSubmit = title.trim().length > 0 && blocks.length > 0;

	async function run() {
		setPhase( 'working' );
		setError( null );
		try {
			const prepared = attachBlobRefs( normalizeBlocks( blocks ), ( url ) =>
				blobRegistry.get( url )
			);
			if ( editing ) {
				const res = await updateDocument( agent, identity, {
					rkey: editing.rkey,
					siteUri: editing.siteUri,
					publishedAt: editing.publishedAt,
					bskyPostRef: editing.bskyPostRef,
					title: title.trim(),
					blocks: prepared,
				} );
				setResultUrl( res.articleUrl );
			} else {
				const res = await publish( agent, identity, {
					title: title.trim(),
					blocks: prepared,
				} );
				setResultUrl( res.articleUrl );
			}
			setPhase( 'done' );
			onComplete?.();
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
			setPhase( 'error' );
		}
	}

	return (
		<section className="publish" aria-label={ isEditing ? 'Update article' : 'Publish' }>
			<input
				className="publish__title"
				type="text"
				placeholder="Article title"
				value={ title }
				onChange={ ( event ) => setTitle( event.target.value ) }
				disabled={ phase === 'working' }
			/>

			{ ( phase === 'idle' || phase === 'error' || phase === 'done' ) && (
				<button
					className="publish__button"
					type="button"
					disabled={ ! canSubmit }
					onClick={ () => ( isEditing ? void run() : setPhase( 'confirm' ) ) }
				>
					{ isEditing ? 'Update' : 'Publish…' }
				</button>
			) }

			{ phase === 'confirm' && (
				<div className="publish__confirm" role="alertdialog" aria-label="Confirm publish">
					<p className="publish__warning">
						⚠️ Publishing saves this article to <strong>your PDS</strong> and also
						creates a <strong>public Bluesky post</strong> linking to it. Everyone
						following you will see it.
					</p>
					<div className="publish__actions">
						<button className="publish__button" type="button" onClick={ run }>
							Publish &amp; post to Bluesky
						</button>
						<button
							className="publish__cancel"
							type="button"
							onClick={ () => setPhase( 'idle' ) }
						>
							Cancel
						</button>
					</div>
				</div>
			) }

			{ phase === 'working' && (
				<p className="publish__status">{ isEditing ? 'Updating…' : 'Publishing…' }</p>
			) }

			{ phase === 'done' && resultUrl && (
				<div className="publish__result">
					<p>
						{ isEditing
							? 'Updated ✓ (same URL; the original Bluesky post stays — its preview may not refresh)'
							: 'Published ✓ (the reading page goes live once SkyPress is deployed)' }
					</p>
					<p>
						Article URL: <code>{ resultUrl }</code>
					</p>
				</div>
			) }

			{ phase === 'error' && error && (
				<p className="publish__error" role="alert">
					{ isEditing ? 'Update' : 'Publish' } failed: { error }
				</p>
			) }
		</section>
	);
}
