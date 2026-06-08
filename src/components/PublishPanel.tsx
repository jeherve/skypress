import { useState } from 'react';
import type { Agent } from '@atproto/api';
import type { BlockInstance } from '@wordpress/blocks';
import { publish, type Identity, type PublishResult } from '../lib/publish/publisher';
import { normalizeBlocks } from '../lib/publish/records';
import { attachBlobRefs } from '../lib/media/blob';
import type { BlobRegistry } from '../lib/media/mediaUpload';

type Phase = 'idle' | 'confirm' | 'publishing' | 'done' | 'error';

interface Props {
	agent: Agent;
	identity: Identity;
	blocks: BlockInstance[];
	blobRegistry: BlobRegistry;
}

/**
 * Title + publish control. Publishing creates a PUBLIC Bluesky post in addition to
 * the PDS document, so it requires an explicit, unmistakable confirmation (brief §10).
 */
export default function PublishPanel( { agent, identity, blocks, blobRegistry }: Props ) {
	const [ title, setTitle ] = useState( '' );
	const [ phase, setPhase ] = useState< Phase >( 'idle' );
	const [ result, setResult ] = useState< PublishResult | null >( null );
	const [ error, setError ] = useState< string | null >( null );

	const canPublish = title.trim().length > 0 && blocks.length > 0;

	async function doPublish() {
		setPhase( 'publishing' );
		setError( null );
		try {
			// Normalise (strip clientId), then persist blob refs for uploaded images.
			const prepared = attachBlobRefs( normalizeBlocks( blocks ), ( url ) =>
				blobRegistry.get( url )
			);
			const res = await publish( agent, identity, {
				title: title.trim(),
				blocks: prepared,
			} );
			setResult( res );
			setPhase( 'done' );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
			setPhase( 'error' );
		}
	}

	return (
		<section className="publish" aria-label="Publish">
			<input
				className="publish__title"
				type="text"
				placeholder="Article title"
				value={ title }
				onChange={ ( event ) => setTitle( event.target.value ) }
				disabled={ phase === 'publishing' }
			/>

			{ ( phase === 'idle' || phase === 'error' || phase === 'done' ) && (
				<button
					className="publish__button"
					type="button"
					disabled={ ! canPublish }
					onClick={ () => setPhase( 'confirm' ) }
				>
					Publish…
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
						<button className="publish__button" type="button" onClick={ doPublish }>
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

			{ phase === 'publishing' && <p className="publish__status">Publishing…</p> }

			{ phase === 'done' && result && (
				<div className="publish__result">
					<p>Published ✓ (the reading page goes live once SkyPress is deployed)</p>
					<ul>
						<li>
							Article URL: <code>{ result.articleUrl }</code>
						</li>
						<li>
							Bluesky post:{ ' ' }
							<code>{ result.postUri }</code>
						</li>
						<li>
							Document: <code>{ result.documentUri }</code>
						</li>
					</ul>
				</div>
			) }

			{ phase === 'error' && error && (
				<p className="publish__error" role="alert">
					Publish failed: { error }
				</p>
			) }
		</section>
	);
}
