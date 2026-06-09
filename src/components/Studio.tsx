import { useEffect, useMemo, useRef, useState } from 'react';
import type { BlockInstance } from '@wordpress/blocks';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import LoginForm from '../lib/auth/LoginForm';
import SkyEditor from './SkyEditor';
import PublishPanel from './PublishPanel';
import AppBar from './AppBar';
import { createMediaUpload, revokeBlobRegistry, type BlobRegistry } from '../lib/media/mediaUpload';
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
	const [ editing, setEditing ] = useState< MyArticle | null >( null );
	const [ refreshKey, setRefreshKey ] = useState( 0 );
	// `null` = still loading; `[]` = loaded, none exist. PublishPanel needs the distinction.
	const [ publications, setPublications ] = useState< Publication[] | null >( null );
	// Shared between mediaUpload (writes blob refs) and publish (reads them).
	const registry = useRef< BlobRegistry >( new Map() ).current;

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
				if ( ! cancelled && article ) {
					setEditing( article );
					setBlocks( article.blocks as unknown as BlockInstance[] );
					setTitle( article.title );
				}
			} )
			.catch( () => {
				/* stale/bad edit link → start a new article */
			} );
		return () => {
			cancelled = true;
		};
	}, [ agent, did ] );

	// Release the preview object URLs this session minted when the Studio unmounts.
	useEffect( () => () => revokeBlobRegistry( registry ), [ registry ] );

	const mediaUpload = useMemo( () => {
		if ( ! agent || ! did || ! pdsUrl ) {
			return undefined;
		}
		return createMediaUpload( { agent, did, pdsUrl, registry } );
	}, [ agent, did, pdsUrl, registry ] );

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
			setTitle( '' );
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
						onComplete={ () => {
							setRefreshKey( ( k ) => k + 1 );
							// A new publish leaves the editor on a fresh "new article": clear the
							// title + blocks (the editorKey bump remounts SkyEditor empty). On an
							// update we stay on the same article, so keep its content in place.
							if ( ! editing ) {
								setTitle( '' );
								setBlocks( [] );
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
					<SkyEditor
						onChange={ setBlocks }
						mediaUpload={ mediaUpload }
						initialBlocks={ editing?.blocks }
					/>
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
