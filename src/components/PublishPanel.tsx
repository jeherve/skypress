import { useEffect, useState } from 'react';
import type { Agent } from '@atproto/api';
import type { BlockInstance } from '@wordpress/blocks';
import {
	publish,
	updateDocument,
	type Identity,
} from '../lib/publish/publisher';
import type { Publication } from '../lib/publish/publications';
import {
	canonicalArticleUrl,
	normalizeBlocks,
	type StrongRef,
} from '../lib/publish/records';
import { collectMentions } from '../lib/publish/mentions';
import { assemblePostText } from '../lib/publish/post-text';
import { graphemeLength } from '../lib/publish/grapheme';
import type { BlockNode } from '../lib/blocks/render';
import { attachBlobRefs } from '../lib/media/blob';
import type { BlobRegistry } from '../lib/media/mediaUpload';
import type { BlobRefJson } from '../lib/media/blob';

type Phase = 'idle' | 'confirm' | 'working' | 'done' | 'error';

export interface EditingTarget {
	rkey: string;
	siteUri: string;
	/** The owning publication's frozen slug (for the article URL on update). */
	siteSlug: string;
	publishedAt: string;
	bskyPostRef?: StrongRef;
}

interface Props {
	agent: Agent;
	identity: Identity;
	blocks: BlockInstance[];
	blobRegistry: BlobRegistry;
	/**
	 * The writer's SkyPress publications — the publish target is chosen from these.
	 * `null` means they're still loading (distinct from `[]`, which means none exist yet).
	 */
	publications: Publication[] | null;
	/** When set, the panel updates an existing article instead of publishing a new one. */
	editing?: EditingTarget;
	/** Controlled title (lifted to the editor so it can render as a heading above the canvas). */
	title: string;
	/** The lede / excerpt for the document + Bluesky-card description (blank → auto-derived). */
	description: string;
	/** Optional explicit per-article cover blob ref to persist + use as the card thumb. */
	coverImage?: BlobRefJson;
	/**
	 * Called after a successful publish/update with the live article URL so the
	 * parent (Studio) can show the success pill. `isEditing` distinguishes an
	 * update from a brand-new publish.
	 */
	onComplete?: ( result: { articleUrl: string; isEditing: boolean } ) => void;
}

const POST_GRAPHEME_LIMIT = 300;
const RKEY_PLACEHOLDER = 'aaaaaaaaaaaaa'; // 13 chars, TID length

export interface PostPreview {
	graphemes: number;
	overLimit: boolean;
	handles: string[];
}

/** Live preview of the companion Bluesky post: its grapheme count and who gets cc'd. */
export function computePostPreview( input: {
	title: string;
	lede: string;
	blocks: BlockNode[];
	handle: string;
	slug: string;
} ): PostPreview {
	const mentions = collectMentions( input.blocks );
	const articleUrl = canonicalArticleUrl( input.handle, input.slug, RKEY_PLACEHOLDER );
	const { text } = assemblePostText( {
		title: input.title,
		articleUrl,
		bodyLede: input.lede,
		mentions,
	} );
	const graphemes = graphemeLength( text );
	return {
		graphemes,
		overLimit: graphemes > POST_GRAPHEME_LIMIT,
		handles: mentions.map( ( m ) => `@${ m.handle }` ),
	};
}

/**
 * Title + publish/update control. Publishing a NEW article targets a CHOSEN publication
 * (Decision 0010) and creates a public Bluesky post, so it requires an explicit confirmation
 * (brief §10). Editing updates the existing record in place, in its own publication, and does
 * NOT create a new post (Decision 0008).
 */
export default function PublishPanel( {
	agent,
	identity,
	blocks,
	blobRegistry,
	publications,
	editing,
	title,
	description,
	coverImage,
	onComplete,
}: Props ) {
	const pubs = publications ?? [];
	const [ targetUri, setTargetUri ] = useState(
		() => editing?.siteUri ?? pubs[ 0 ]?.uri ?? ''
	);
	const [ phase, setPhase ] = useState< Phase >( 'idle' );
	const [ error, setError ] = useState< string | null >( null );

	const isEditing = Boolean( editing );
	const target = isEditing
		? { uri: editing!.siteUri, slug: editing!.siteSlug }
		: pubs.find( ( pub ) => pub.uri === targetUri );
	const editingPubName =
		isEditing && pubs.find( ( pub ) => pub.uri === editing!.siteUri )?.name;
	const hasTarget = Boolean( target );

	const previewHandle = identity.handle ?? identity.did;
	const preview = target
		? computePostPreview( {
				title,
				lede: description,
				blocks: normalizeBlocks( blocks ),
				handle: previewHandle,
				slug: target.slug,
		  } )
		: null;

	const canSubmit =
		title.trim().length > 0 && blocks.length > 0 && hasTarget && ! preview?.overLimit;

	// `publications` arrives asynchronously after mount, so the initial selection may not match
	// any loaded publication. Lock onto the first one once they load (and recover if the current
	// pick disappears) — otherwise `targetUri` stays '' and the Publish button never enables.
	useEffect( () => {
		if ( ! isEditing && pubs.length > 0 && ! hasTarget ) {
			setTargetUri( pubs[ 0 ].uri );
		}
	}, [ isEditing, publications, hasTarget ] );

	// New article, but the writer's publications are still loading — don't flash the
	// "no publication" call-to-action below at someone who actually has one.
	if ( ! isEditing && publications === null ) {
		return (
			<section className="publish" aria-label="Publish">
				<p className="publish__status">Loading your publications…</p>
			</section>
		);
	}

	// New article, but the writer has no publication to publish into yet.
	if ( ! isEditing && pubs.length === 0 ) {
		return (
			<section className="publish" aria-label="Publish">
				<p className="publish__status">
					You don't have a publication yet.{ ' ' }
					<a href="/dashboard">Create one in your dashboard</a> to start publishing.
				</p>
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
			const prepared = attachBlobRefs( normalizeBlocks( blocks ), ( url ) =>
				blobRegistry.get( url )
			);
			let articleUrl: string;
			if ( editing ) {
				const res = await updateDocument( agent, identity, {
					rkey: editing.rkey,
					siteUri: editing.siteUri,
					publicationSlug: editing.siteSlug,
					publishedAt: editing.publishedAt,
					bskyPostRef: editing.bskyPostRef,
					title: title.trim(),
					description,
					blocks: prepared,
					coverImage,
				} );
				articleUrl = res.articleUrl;
			} else {
				// Non-editing: the target is always a full Publication picked from `pubs`.
				const pub = pubs.find( ( candidate ) => candidate.uri === targetUri );
				if ( ! pub ) {
					return;
				}
				const res = await publish( agent, identity, {
					title: title.trim(),
					description,
					blocks: prepared,
					publicationUri: pub.uri,
					publicationCid: pub.cid,
					publicationSlug: pub.slug,
					coverImage,
				} );
				articleUrl = res.articleUrl;
			}
			setPhase( 'done' );
			onComplete?.( { articleUrl, isEditing } );
		} catch ( err ) {
			setError( err instanceof Error ? err.message : String( err ) );
			setPhase( 'error' );
		}
	}

	return (
		<section className="publish" aria-label={ isEditing ? 'Update article' : 'Publish' }>
			{ isEditing ? (
				<span className="publish__target publish__target--fixed">
					In <strong>{ editingPubName ?? 'this publication' }</strong>
				</span>
			) : (
				<label className="publish__target">
					<span className="publish__target-label">Publish to</span>
					<select
						className="publish__select"
						value={ targetUri }
						onChange={ ( event ) => setTargetUri( event.target.value ) }
						disabled={ phase === 'working' }
					>
						{ pubs.map( ( pub ) => (
							<option key={ pub.uri } value={ pub.uri }>
								{ pub.name }
							</option>
						) ) }
					</select>
				</label>
			) }

			{ preview && (
				<p
					className={ `publish__count${ preview.overLimit ? ' publish__count--over' : '' }` }
					aria-live="polite"
				>
					Bluesky post: { preview.graphemes }/300
					{ preview.overLimit ? ' — shorten the subtitle to publish' : '' }
				</p>
			) }

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
						{ preview && preview.handles.length > 0 && (
							<>
								{ ' ' }
								It will notify{ ' ' }
								<strong>{ preview.handles.join( ', ' ) }</strong>.
							</>
						) }
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

			{ phase === 'error' && error && (
				<p className="publish__error" role="alert">
					{ isEditing ? 'Update' : 'Publish' } failed: { error }
				</p>
			) }
		</section>
	);
}
