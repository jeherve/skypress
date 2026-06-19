/**
 * Recognise which embed provider a URL belongs to (the embed content model).
 *
 * Dependency-free (no `@wordpress/*`) so both the reader path and the editor can
 * import it. Hosts are matched at a dot boundary — `host === domain ||
 * host.endsWith( '.' + domain )` — so look-alikes (`notbsky.app`,
 * `bsky.app.evil.com`) do NOT match. Mirrors the `detectProvider` pattern
 * (Decision 0017). A URL we don't recognise returns null → it stays a plain link.
 */
export type EmbedKind = 'atproto' | 'youtube' | 'vimeo';

export interface EmbedMatch {
	kind: EmbedKind;
	/** atproto: "<authority>/<rkey>" (authority = handle or did). video: the id. */
	id: string;
}

/** AppView web hosts that use the standard `/profile/<id>/post/<rkey>` scheme. */
const ATPROTO_HOSTS = [ 'bsky.app', 'mu.social' ];

function hostMatches( host: string, domain: string ): boolean {
	const h = host.toLowerCase();
	return h === domain || h.endsWith( '.' + domain );
}

/**
 * Detect whether a URL points at a supported embed provider.
 *
 * @param url - The candidate URL (an `https://` AppView/video link or a raw `at://` URI).
 * @returns The matched embed (`kind` + `id`), or `null` when the URL is unrelated or malformed.
 */
export function detectEmbed( url: string ): EmbedMatch | null {
	// Raw at:// post URI.
	const at = url.match( /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)/ );
	if ( at ) {
		return { kind: 'atproto', id: `${ at[ 1 ] }/${ at[ 2 ] }` };
	}

	let parsed: URL;
	try {
		parsed = new URL( url );
	} catch {
		return null;
	}
	const host = parsed.hostname;

	if ( ATPROTO_HOSTS.some( ( d ) => hostMatches( host, d ) ) ) {
		const m = parsed.pathname.match( /^\/profile\/([^/]+)\/post\/([^/?#]+)/ );
		return m ? { kind: 'atproto', id: `${ m[ 1 ] }/${ m[ 2 ] }` } : null;
	}

	if ( hostMatches( host, 'youtube.com' ) ) {
		const v = parsed.searchParams.get( 'v' );
		return v ? { kind: 'youtube', id: v } : null;
	}
	if ( hostMatches( host, 'youtu.be' ) ) {
		const id = parsed.pathname.slice( 1 ).split( '/' )[ 0 ];
		return id ? { kind: 'youtube', id } : null;
	}
	if ( hostMatches( host, 'vimeo.com' ) ) {
		const id = parsed.pathname.split( '/' ).filter( Boolean )[ 0 ];
		return id && /^\d+$/.test( id ) ? { kind: 'vimeo', id } : null;
	}

	return null;
}
