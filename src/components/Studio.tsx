import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BlockInstance } from '@wordpress/blocks';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import LoginForm from '../lib/auth/LoginForm';
import SkyEditor from './SkyEditor';
import PublishPanel from './PublishPanel';
import CoverImagePicker from './CoverImagePicker';
import AppBar from './AppBar';
import { createMediaUpload, revokeBlobRegistry, type BlobRegistry } from '../lib/media/mediaUpload';
import {
	coverPreviewUrl,
	uploadCoverViaMedia,
	type CoverUpload,
} from '../lib/media/cover';
import { getMyArticle, type MyArticle } from '../lib/publish/publisher';
import { editRkeyFromSearch } from '../lib/editor/edit-link';
import { listPublications, type Publication } from '../lib/publish/publications';

/**
 * The authenticated writing surface. Gates the editor behind atproto OAuth:
 * loading → (signed-out: login form) | (signed-in: editor).
 */
function StudioGate() {
	const { status, agent, handle, did, pdsUrl, error } = useAuth();
	const [ blocks, setBlocks ] = useState< BlockInstance[] >( [] );
	const [ title, setTitle ] = useState( '' );
	const [ excerpt, setExcerpt ] = useState( '' );
	const [ editing, setEditing ] = useState< MyArticle | null >( null );
	const [ cover, setCover ] = useState< CoverUpload | null >( null );
	// Set when an `?edit=<rkey>` load fails to fetch (vs. simply not found).
	const [ editLoadError, setEditLoadError ] = useState< string | null >( null );
	const [ refreshKey, setRefreshKey ] = useState( 0 );
	// `null` = still loading; `[]` = loaded, none exist. PublishPanel needs the distinction.
	const [ publications, setPublications ] = useState< Publication[] | null >( null );
	// Shared between mediaUpload (writes blob refs) and publish (reads them).
	const registry = useRef< BlobRegistry >( new Map() ).current;
	const ledeRef = useRef< HTMLTextAreaElement >( null );

	// Load the writer's SkyPress publications (the publish targets / selector).
	useEffect( () => {
		if ( ! agent || ! did ) {
			return;
		}
		let cancelled = false;
		listPublications( agent, did )
			.then( ( list ) => ! cancelled && setPublications( list ) )
			.catch( () => ! cancelled && setPublications( [] ) );
		return () => {
			cancelled = true;
		};
	}, [ agent, did, refreshKey ] );

	// One-shot: if the page was opened as /editor?edit=<rkey>, load that article.
	const editLoadedRef = useRef( false );
	useEffect( () => {
		if ( editLoadedRef.current || ! agent || ! did ) {
			return;
		}
		const rkey = editRkeyFromSearch( window.location.search );
		if ( ! rkey ) {
			editLoadedRef.current = true;
			return;
		}
		editLoadedRef.current = true;
		let cancelled = false;
		getMyArticle( agent, did, rkey )
			.then( ( article ) => {
				if ( cancelled ) {
					return;
				}
				if ( article ) {
					setEditing( article );
					setBlocks( article.blocks as unknown as BlockInstance[] );
					setTitle( article.title );
					setExcerpt( article.description ?? '' );
					if ( article.coverImage && pdsUrl ) {
						setCover( {
							ref: article.coverImage,
							previewUrl: coverPreviewUrl( article.coverImage, { pdsUrl, did } ),
						} );
					}
				}
				// `article === null` → no owned document has this rkey (stale/bad edit
				// link). Silently start a new article, as before.
			} )
			.catch( ( err ) => {
				// The fetch itself failed (network/auth) — distinct from a stale link.
				// Surface it so the blank "New article" editor isn't mistaken for the
				// requested article having loaded.
				if ( ! cancelled ) {
					setEditLoadError(
						err instanceof Error ? err.message : String( err )
					);
				}
			} );
		return () => {
			cancelled = true;
		};
	}, [ agent, did, pdsUrl ] );

	// Release the preview object URLs this session minted when the Studio unmounts.
	useEffect( () => () => revokeBlobRegistry( registry ), [ registry ] );

	// Grow the lede textarea to fit its content (and on hydrate from an edit-load).
	// Layout effect so it sizes before paint — avoids a one-row collapse flash when
	// opening an existing article with a multi-line lede.
	useLayoutEffect( () => {
		const el = ledeRef.current;
		if ( ! el ) {
			return;
		}
		el.style.height = 'auto';
		el.style.height = `${ el.scrollHeight }px`;
	}, [ excerpt ] );

	const mediaUpload = useMemo( () => {
		if ( ! agent || ! did || ! pdsUrl ) {
			return undefined;
		}
		return createMediaUpload( { agent, did, pdsUrl, registry } );
	}, [ agent, did, pdsUrl, registry ] );

	const uploadCover = useMemo( () => {
		if ( ! mediaUpload ) {
			return undefined;
		}
		return ( file: File ) => uploadCoverViaMedia( file, mediaUpload, registry );
	}, [ mediaUpload, registry ] );

	if ( status === 'loading' ) {
		return (
			<>
				<AppBar current="editor" />
				<p className="studio__loading">Connecting to your identity…</p>
			</>
		);
	}

	if ( status === 'signed-in' && agent && did ) {
		// Re-mount the editor when switching article (or after a new publish) so the
		// SkyEditor canvas resets via onLoad/initialBlocks. The title is Studio-owned
		// state now, so it doesn't reset on remount — the title/blocks reset for a new
		// publish happens in PublishPanel's `onComplete` below.
		const editorKey = editing ? `edit-${ editing.rkey }` : `new-${ refreshKey }`;

		const startNew = () => {
			revokeBlobRegistry( registry );
			setEditing( null );
			setBlocks( [] );
			setCover( null );
			setTitle( '' );
			setExcerpt( '' );
			setEditLoadError( null );
		};

		return (
			<>
				<AppBar current="editor" />

				<div className="studio__mode">
					<span>{ editing ? `Editing: ${ editing.title }` : 'New article' }</span>
					{ editing && (
						<button type="button" onClick={ startNew }>
							+ New article
						</button>
					) }
				</div>

				{ editLoadError && (
					<p className="studio__error studio__error--banner" role="alert">
						Couldn't open that article for editing: { editLoadError }. You can
						retry from your dashboard, or start a new article below.
					</p>
				) }

				<div key={ editorKey }>
					<PublishPanel
						agent={ agent }
						identity={ { did, handle } }
						blocks={ blocks }
						blobRegistry={ registry }
						publications={ publications }
						editing={
							editing
								? {
										rkey: editing.rkey,
										siteUri: editing.siteUri,
										siteSlug: editing.siteSlug,
										publishedAt: editing.publishedAt ?? new Date().toISOString(),
										bskyPostRef: editing.bskyPostRef,
								  }
								: undefined
						}
						title={ title }
						description={ excerpt }
						coverImage={ cover?.ref }
						onComplete={ () => {
							setRefreshKey( ( k ) => k + 1 );
							// A new publish leaves the editor on a fresh "new article": clear the
							// title + blocks (the editorKey bump remounts SkyEditor empty). On an
							// update we stay on the same article, so keep its content in place.
							if ( ! editing ) {
								setTitle( '' );
								setExcerpt( '' );
								setBlocks( [] );
								setCover( null );
							}
						} }
					/>
					<input
						className="studio__title"
						type="text"
						placeholder="Add title"
						aria-label="Article title"
						value={ title }
						onChange={ ( event ) => setTitle( event.target.value ) }
					/>
					<textarea
						ref={ ledeRef }
						className="studio__lede"
						rows={ 1 }
						maxLength={ 3000 }
						placeholder="Add a lede… (defaults to the opening of your post)"
						aria-label="Lede"
						value={ excerpt }
						onChange={ ( event ) => setExcerpt( event.target.value ) }
					/>
					{ excerpt.length > 200 && (
						<p className="studio__lede-hint">
							Long ledes get truncated on the Bluesky card.
						</p>
					) }
					<SkyEditor
						onChange={ setBlocks }
						mediaUpload={ mediaUpload }
						initialBlocks={ editing?.blocks }
					/>
					{ uploadCover && (
						<CoverImagePicker
							cover={ cover }
							onUpload={ uploadCover }
							onChange={ setCover }
						/>
					) }
				</div>
			</>
		);
	}

	// signed-out or error
	return (
		<>
			<AppBar current="editor" />
			<div className="studio__login">
				<LoginForm />
				{ status === 'error' && error && (
					<p className="studio__error" role="alert">
						Couldn't start the auth client: { error }
					</p>
				) }
			</div>
		</>
	);
}

export default function Studio() {
	return (
		<AuthProvider>
			<StudioGate />
		</AuthProvider>
	);
}
