/**
 * Pure, dependency-free OAuth configuration helpers (Decision 0004).
 *
 * Kept free of `@atproto/*` imports so it's unit-testable in Node and importable
 * from anywhere. The browser-only client construction lives in `oauth.ts`.
 */

/** Scope for SP1 — establishes a session. Granular write scopes are added in SP2. */
export const OAUTH_SCOPE = 'atproto transition:generic';

/** Handle resolver service (a `com.atproto.identity.resolveHandle` XRPC endpoint). */
export const HANDLE_RESOLVER = 'https://bsky.social';

const LOOPBACK_HOSTS = new Set( [ 'localhost', '127.0.0.1', '[::1]', '::1' ] );

/**
 * Loopback hosts use atproto's development client (auto-generated metadata);
 * everything else uses a hosted `client-metadata.json`.
 */
export function getClientMode( hostname: string ): 'loopback' | 'hosted' {
	return LOOPBACK_HOSTS.has( hostname ) ? 'loopback' : 'hosted';
}

/** The hosted client metadata URL — the `client_id` for production. */
export function clientMetadataUrl( origin: string ): string {
	return `${ origin.replace( /\/$/, '' ) }/client-metadata.json`;
}

/**
 * The routes that mount the OAuth island and may therefore be the page sign-in starts from
 * (and returns to). Every entry MUST appear in `client-metadata.json`'s `redirect_uris`
 * (it's generated from this list) — atproto only redirects back to a registered URI, and
 * the browser client matches the callback page against the same list to exchange the code.
 *
 * `/editor/` stays first: it's the historical default and the safe fallback for any other
 * page that ever reaches sign-in. (Decision 0020 — the writing-first `/write` flow shares
 * the editor island, so signing in from there must come back to `/write/`, not `/editor/`.)
 */
export const OAUTH_REDIRECT_PATHS = [ '/editor/', '/write/' ] as const;

/**
 * The single static route the OAuth round-trip returns to when sign-in starts from an
 * OFF-ISLAND page — i.e. one that can't be a registered redirect URI. The publication page
 * lives at a dynamic route (`/[author]/[slug]/`), of which there are unboundedly many, so it
 * can never appear in `redirect_uris`. Instead such pages redirect here (a real page that
 * mounts the OAuth-callback island); the island completes the token exchange, then bounces to
 * the return path the initiating page stashed (`oauth-return.ts`). It is registered in
 * `client-metadata.json` alongside `OAUTH_REDIRECT_PATHS` but is return-only: no one signs in
 * *from* it. (Decision 0020 — subscribe from the public publication page.)
 */
export const OAUTH_CALLBACK_PATH = '/oauth/callback/';

/** The registered callback redirect URI on `origin` (see `OAUTH_CALLBACK_PATH`). */
export function oauthCallbackUri( origin: string ): string {
	return `${ origin.replace( /\/$/, '' ) }${ OAUTH_CALLBACK_PATH }`;
}

/**
 * The registered redirect URI for the page sign-in is starting on, so the full-page
 * OAuth round-trip returns the writer to where they were (carrying the draft + publish
 * intent that `draft-store` persisted). Unknown paths fall back to `/editor/` — passing
 * an unregistered URI to `signIn()` would make atproto throw.
 */
export function redirectUriForLocation( origin: string, pathname: string ): string {
	const base = origin.replace( /\/$/, '' );
	const normalized = pathname.endsWith( '/' ) ? pathname : `${ pathname }/`;
	const match = OAUTH_REDIRECT_PATHS.find( ( path ) => path === normalized );
	return `${ base }${ match ?? OAUTH_REDIRECT_PATHS[ 0 ] }`;
}

/** Normalise a handle: trim, drop a leading `@`, lowercase. */
export function normalizeHandle( input: string ): string {
	return input.trim().replace( /^@/, '' ).toLowerCase();
}

const HANDLE_RE = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const DID_RE = /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/;

/**
 * Accept the three things `signIn()` can resolve from: a handle (`alice.bsky.social`),
 * a DID (`did:plc:…`), or a PDS/entryway URL (`https://…`). Rejects empty input and
 * bare words with no domain.
 */
export function isValidAccountInput( input: string ): boolean {
	const value = input.trim();
	if ( ! value ) {
		return false;
	}
	if ( DID_RE.test( value ) ) {
		return true;
	}
	if ( /^https?:\/\//.test( value ) ) {
		try {
			return Boolean( new URL( value ).hostname );
		} catch {
			return false;
		}
	}
	return HANDLE_RE.test( normalizeHandle( value ) );
}

/**
 * Stricter sibling of `isValidAccountInput` for the public READ path. Accepts only a
 * syntactic handle (`alice.bsky.social`) or DID (`did:plc:…`) — and, unlike
 * `isValidAccountInput`, rejects `https://…` URLs and anything carrying a path, port,
 * query or scheme. The renderer takes the author straight from the URL and uses it as a
 * resolver fetch host, so this stops a value like `evil.com/x?y=` from smuggling into the
 * outbound request (`safeFetch` still blocks internal hosts; this gates the syntax).
 */
export function isValidHandleOrDid( input: string ): boolean {
	const value = input.trim();
	if ( ! value ) {
		return false;
	}
	if ( DID_RE.test( value ) ) {
		return true;
	}
	return HANDLE_RE.test( normalizeHandle( value ) );
}
