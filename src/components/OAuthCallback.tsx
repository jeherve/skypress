import { useEffect } from 'react';
import { AuthProvider } from '../lib/auth/AuthProvider';
import { useAuth } from '../lib/auth/useAuth';
import { takeOAuthReturn, safeOAuthReturnPath } from '../lib/auth/oauth-return';

/**
 * The return-only OAuth callback island (`/oauth/callback/`, `OAUTH_CALLBACK_PATH`).
 *
 * Pages that can't be a registered redirect URI — the dynamic publication page — send the
 * OAuth round-trip here. Mounting `<AuthProvider>` runs `client.init()`, which completes the
 * code exchange and persists the session; once auth settles we bounce to wherever sign-in
 * started (stashed in `oauth-return`, guarded against an off-origin redirect). The originating
 * page then restores the session and finishes its own intent (e.g. auto-subscribe).
 */
function CallbackRedirect() {
	const { status, error } = useAuth();

	useEffect( () => {
		// Wait for init() to resolve (signed-in, or the rare signed-out/error), then leave.
		// Read-and-clear so a manual revisit to this URL doesn't bounce anywhere surprising.
		if ( status === 'loading' ) {
			return;
		}
		window.location.replace( safeOAuthReturnPath( takeOAuthReturn() ) );
	}, [ status ] );

	if ( status === 'error' && error ) {
		return (
			<p className="subscribe subscribe--loading" role="alert">
				Could not finish signing in. { error }
			</p>
		);
	}
	return <p className="subscribe subscribe--loading">Finishing sign-in…</p>;
}

export default function OAuthCallback() {
	return (
		<AuthProvider>
			<CallbackRedirect />
		</AuthProvider>
	);
}
