import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import LoginForm from '../lib/auth/LoginForm';
import SkyEditor from './SkyEditor';

/**
 * The authenticated writing surface. Gates the editor behind atproto OAuth:
 * loading → (signed-out: login form) | (signed-in: account bar + editor).
 */
function StudioGate() {
	const { status, handle, did, error, signOut } = useAuth();

	if ( status === 'loading' ) {
		return <p className="studio__loading">Connecting to your identity…</p>;
	}

	if ( status === 'signed-in' ) {
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
				<SkyEditor />
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
