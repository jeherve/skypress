/**
 * Where to send the browser after the OAuth-callback island completes sign-in for a page that
 * couldn't itself be a registered redirect URI (the dynamic publication page — see
 * `OAUTH_CALLBACK_PATH`). The initiating page stashes its own path here just before the
 * full-page redirect; the callback island reads it once and bounces there.
 *
 * `localStorage` (not `sessionStorage`) mirrors the writing-first `draft-store`: it reliably
 * survives the off-origin OAuth excursion to the authorization server and back. The value is
 * always a same-origin path produced from `window.location.pathname`; the callback still
 * guards it before navigating (defence in depth against an open redirect).
 */
const RETURN_KEY = 'skypress:oauth:return';

export function setOAuthReturn( path: string, storage: Storage = window.localStorage ): void {
	storage.setItem( RETURN_KEY, path );
}

/** Read the stashed return path and clear it — non-null at most once per `setOAuthReturn`. */
export function takeOAuthReturn( storage: Storage = window.localStorage ): string | null {
	const path = storage.getItem( RETURN_KEY );
	storage.removeItem( RETURN_KEY );
	return path;
}

/**
 * Guard a stashed return path before handing it to `location.replace`: accept only a
 * same-origin absolute path (a single leading slash). Anything else — an absolute URL, a
 * protocol-relative `//evil.com`, or empty — collapses to `/`, so a tampered value can never
 * turn the callback into an open redirect off-origin.
 */
export function safeOAuthReturnPath( path: string | null ): string {
	if ( ! path || ! path.startsWith( '/' ) || path.startsWith( '//' ) ) {
		return '/';
	}
	return path;
}
