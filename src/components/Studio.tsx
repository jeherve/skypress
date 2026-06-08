import { useMemo, useRef, useState } from 'react';
import type { BlockInstance } from '@wordpress/blocks';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import LoginForm from '../lib/auth/LoginForm';
import SkyEditor from './SkyEditor';
import PublishPanel from './PublishPanel';
import { createMediaUpload, type BlobRegistry } from '../lib/media/mediaUpload';

/**
 * The authenticated writing surface. Gates the editor behind atproto OAuth:
 * loading → (signed-out: login form) | (signed-in: account bar + editor).
 */
function StudioGate() {
	const { status, agent, handle, did, pdsUrl, error, signOut } = useAuth();
	const [ blocks, setBlocks ] = useState< BlockInstance[] >( [] );
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
				<PublishPanel
					agent={ agent }
					identity={ { did, handle } }
					blocks={ blocks }
					blobRegistry={ registry }
				/>
				<SkyEditor onChange={ setBlocks } mediaUpload={ mediaUpload } />
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
