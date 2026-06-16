// src/components/WritePublishFlow.tsx
import { useMemo, useState } from 'react';
import type { Agent } from '@atproto/api';
import { publish, type Identity } from '../lib/publish/publisher';
import type { Publication } from '../lib/publish/publications';
import { computePostPreview } from './PublishPanel';
import PublicationForm from './PublicationForm';
import { uploadHeldAssets } from '../lib/write/upload-held';
import type { BlockNode } from '../lib/blocks/render';

interface Props {
	agent: Agent;
	identity: Identity;
	pdsUrl: string;
	blocks: BlockNode[];
	coverDataUrl: string | null;
	title: string;
	description: string;
	/** `null` while still loading; `[]` when the writer has none yet. */
	publications: Publication[] | null;
	/** Ask the parent to re-list publications (after an inline create). */
	onReloadPublications: () => void;
	onPublished: ( result: { articleUrl: string } ) => void;
	onCancel: () => void;
}

type Phase = 'pick' | 'working' | 'error';

/**
 * The writing-first publish stepper (design 2026-06-17). Branches on how many publications the
 * writer owns: zero → inline create; one → confirm; many → pick then confirm. The confirm step
 * always discloses the public Bluesky post (brief §10) and blocks an over-limit post. On confirm
 * it uploads the held images/cover, then reuses `publish()` (document + Bluesky post).
 */
export default function WritePublishFlow( {
	agent,
	identity,
	pdsUrl,
	blocks,
	coverDataUrl,
	title,
	description,
	publications,
	onReloadPublications,
	onPublished,
	onCancel,
}: Props ) {
	const pubs = publications ?? [];
	const [ targetUri, setTargetUri ] = useState( () => pubs[ 0 ]?.uri ?? '' );
	const [ phase, setPhase ] = useState< Phase >( 'pick' );
	const [ error, setError ] = useState< string | null >( null );

	const target = pubs.find( ( p ) => p.uri === targetUri ) ?? pubs[ 0 ];

	const preview = useMemo(
		() =>
			target
				? computePostPreview( {
						title,
						lede: description,
						blocks,
						handle: identity.handle ?? identity.did,
						slug: target.slug,
				  } )
				: null,
		[ target, title, description, blocks, identity ]
	);

	if ( publications === null ) {
		return (
			<section className="writeflow" aria-label="Publish">
				<p className="writeflow__status">Loading your publications…</p>
			</section>
		);
	}

	// Zero publications → inline "create your first publication".
	if ( pubs.length === 0 ) {
		return (
			<section className="writeflow" aria-label="Create your first publication">
				<p className="writeflow__lede">
					You don't have a publication yet — create one to publish into.
				</p>
				<PublicationForm
					agent={ agent }
					did={ identity.did }
					pdsUrl={ pdsUrl }
					handle={ identity.handle ?? identity.did }
					onSaved={ ( pub ) => {
						setTargetUri( pub.uri );
						onReloadPublications();
					} }
					onCancel={ onCancel }
				/>
			</section>
		);
	}

	async function run() {
		if ( ! target ) {
			return;
		}
		setPhase( 'working' );
		setError( null );
		try {
			const prepared = await uploadHeldAssets( agent, {
				blocks,
				coverDataUrl,
				did: identity.did,
				pdsUrl,
			} );
			const res = await publish( agent, identity, {
				title: title.trim(),
				description,
				blocks: prepared.blocks,
				publicationUri: target.uri,
				publicationCid: target.cid,
				publicationSlug: target.slug,
				coverImage: prepared.coverImage,
			} );
			onPublished( { articleUrl: res.articleUrl } );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
			setPhase( 'error' );
		}
	}

	const overLimit = Boolean( preview?.overLimit );

	return (
		<section className="writeflow" aria-label="Publish">
			{ pubs.length > 1 && (
				<label className="writeflow__target">
					<span>Publish to</span>
					<select
						value={ target?.uri ?? '' }
						onChange={ ( e ) => setTargetUri( e.target.value ) }
						disabled={ phase === 'working' }
					>
						{ pubs.map( ( p ) => (
							<option key={ p.uri } value={ p.uri }>
								{ p.name }
							</option>
						) ) }
					</select>
				</label>
			) }

			<p className="writeflow__warning">
				Publishing saves this article to <strong>your PDS</strong> and also creates a{ ' ' }
				<strong>public Bluesky post</strong> linking to it
				{ target ? <> in <strong>{ target.name }</strong></> : null }. Everyone following you
				will see it.
				{ preview && preview.handles.length > 0 && (
					<> It will notify <strong>{ preview.handles.join( ', ' ) }</strong>.</>
				) }
			</p>

			{ overLimit && (
				<p className="writeflow__count" aria-live="polite">
					Bluesky post: { preview!.graphemes }/300 — too long to publish; shorten the
					subtitle or remove a mention.
				</p>
			) }

			{ phase === 'working' ? (
				<p className="writeflow__status">Publishing…</p>
			) : (
				<div className="writeflow__actions">
					<button
						type="button"
						className="writeflow__publish"
						disabled={ overLimit || ! target }
						onClick={ () => void run() }
					>
						Publish &amp; post to Bluesky
					</button>
					<button type="button" className="writeflow__cancel" onClick={ onCancel }>
						Keep editing
					</button>
				</div>
			) }

			{ phase === 'error' && error && (
				<p className="writeflow__error" role="alert">
					Publish failed: { error }
				</p>
			) }
		</section>
	);
}
