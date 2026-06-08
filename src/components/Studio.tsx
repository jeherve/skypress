import { useMemo, useRef, useState } from 'react';
import type { BlockInstance } from '@wordpress/blocks';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import LoginForm from '../lib/auth/LoginForm';
import SkyEditor from './SkyEditor';
import PublishPanel from './PublishPanel';
import MyArticles from './MyArticles';
import { createMediaUpload, type BlobRegistry } from '../lib/media/mediaUpload';
import type { MyArticle } from '../lib/publish/publisher';

/**
 * The authenticated writing surface. Gates the editor behind atproto OAuth:
 * loading → (signed-out: login form) | (signed-in: account bar + editor).
 */
function StudioGate() {
	const { status, agent, handle, did, pdsUrl, error, signOut } = useAuth();
	const [ blocks, setBlocks ] = useState< BlockInstance[] >( [] );
	const [ editing, setEditing ] = useState< MyArticle | null >( null );
	const [ refreshKey, setRefreshKey ] = useState( 0 );
	// Shared between mediaUpload (writes blob refs) and publish (reads them).
	const registry = useRef< BlobRegistry >( new Map() ).current;

	const mediaUpload = useMemo( () => {
		if ( ! agent || ! did || ! pdsUrl ) {
			return undefined;
		}
		return createMediaUpload( { agent, did, pdsUrl, registry } );
	}, [ agent, did, pdsUrl, registry ] );

	if ( status === 'loading' ) {
		return <p className="studio__loading">Connecting to your identity…</p>;
	}

	if ( status === 'signed-in' && agent && did ) {
		// Re-mount the editor + panel when switching article so onLoad + the title reset.
		const editorKey = editing ? `edit-${ editing.rkey }` : `new-${ refreshKey }`;

		const startEdit = ( article: MyArticle ) => {
			setEditing( article );
			setBlocks( article.blocks as unknown as BlockInstance[] );
		};
		const startNew = () => {
			setEditing( null );
			setBlocks( [] );
		};

		return (
			<>
				<div className="studio__account">
					<span>
						Signed in as <strong>{ handle ?? did }</strong>
					</span>
					<button type="button" className="studio__signout" onClick={ () => void signOut() }>
						Sign out
					</button>
				</div>

				<MyArticles
					agent={ agent }
					did={ did }
					handle={ handle ?? did }
					refreshKey={ refreshKey }
					onEdit={ startEdit }
				/>

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
						editing={
							editing
								? {
										rkey: editing.rkey,
										siteUri: editing.siteUri,
										publishedAt: editing.publishedAt ?? new Date().toISOString(),
										bskyPostRef: editing.bskyPostRef,
								  }
								: undefined
						}
						initialTitle={ editing?.title }
						onComplete={ () => setRefreshKey( ( k ) => k + 1 ) }
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
		<div className="studio__login">
			<LoginForm />
			{ status === 'error' && error && (
				<p className="studio__error" role="alert">
					Couldn't start the auth client: { error }
				</p>
			) }
		</div>
	);
}

export default function Studio() {
	return (
		<AuthProvider>
			<StudioGate />
		</AuthProvider>
	);
}
