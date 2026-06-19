/**
 * Web URLs for *viewing* AT Protocol records in an AppView client.
 *
 * SkyPress publishes to the Bluesky/atproto network, but links readers to mu.social
 * (a Bluesky AppView) to view profiles, posts, and hashtags. mu.social uses the same
 * path scheme as bsky.app. Keeping the host here means changing it again is a one-line
 * edit. This module is dependency-free so the reader path can import it (Decision 0003).
 */
export const ATMOSPHERE_WEB_BASE = 'https://mu.social';

/** Profile page for a handle (e.g. `alice.bsky.social`). */
export function atmosphereProfileUrl( handle: string ): string {
	return `${ ATMOSPHERE_WEB_BASE }/profile/${ encodeURIComponent( handle ) }`;
}

/** Hashtag page for a bare tag (no leading `#`). */
export function atmosphereHashtagUrl( tag: string ): string {
	return `${ ATMOSPHERE_WEB_BASE }/hashtag/${ encodeURIComponent( tag ) }`;
}

/**
 * Web URL for a post AT-URI, for "view on the ATmosphere" links.
 * `at://<did>/app.bsky.feed.post/<rkey>` → `<base>/profile/<did>/post/<rkey>`.
 * The DID is kept raw (not encoded) so the path matches the AppView's canonical form.
 * Falls back to the AppView home for an unparseable URI.
 */
export function atmospherePostWebUrl( postUri: string ): string {
	const match = postUri.match( /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/ );
	return match
		? `${ ATMOSPHERE_WEB_BASE }/profile/${ match[ 1 ] }/post/${ match[ 2 ] }`
		: ATMOSPHERE_WEB_BASE;
}
