import {
	BrowserOAuthClient,
	atprotoLoopbackClientMetadata,
} from '@atproto/oauth-client-browser';
import { getClientMode, clientMetadataUrl, HANDLE_RESOLVER, OAUTH_SCOPE } from './config';

/**
 * Create the browser OAuth client (Decision 0004). BROWSER-ONLY — reads
 * `window.location` and uses WebCrypto/IndexedDB, so call it from an effect in a
 * client-only island, never during SSR.
 *
 * - Loopback (dev): an atproto loopback `client_id` must be **path-less**
 *   (`http://localhost?…`), but its `redirect_uri` may carry a path. The library's
 *   auto-builder derives both from `window.location`, which breaks when the app isn't
 *   at `/` (e.g. `/editor`). So we build it explicitly: a root client_id with the
 *   current page as the redirect target. Loopback origins must be `127.0.0.1`/`[::1]`.
 * - Hosted (prod): loads `client-metadata.json` from the app origin (full scope).
 */
export async function createOAuthClient(): Promise< BrowserOAuthClient > {
	if ( getClientMode( window.location.hostname ) === 'loopback' ) {
		const redirectUri = `${ window.location.origin }${ window.location.pathname }`;
		// Request the write scope in dev too (the default loopback scope is read-only
		// `atproto`), so createRecord works without a hosted metadata file (Decision 0005).
		const clientId =
			`http://localhost?redirect_uri=${ encodeURIComponent( redirectUri ) }` +
			`&scope=${ encodeURIComponent( OAUTH_SCOPE ) }`;
		return new BrowserOAuthClient( {
			clientMetadata: atprotoLoopbackClientMetadata( clientId ),
			handleResolver: HANDLE_RESOLVER,
		} );
	}
	return BrowserOAuthClient.load( {
		clientId: clientMetadataUrl( window.location.origin ),
		handleResolver: HANDLE_RESOLVER,
	} );
}
