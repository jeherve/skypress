/**
 * SSRF-guarded fetch for the read-through renderer.
 *
 * The renderer fetches hostnames derived from UNTRUSTED input — the `@handle` in the
 * URL, a `did:web` host, and the PDS `serviceEndpoint` from a DID document. Without
 * guarding, a request like `/@169.254.169.254/x` or a `did:web` pointing at an internal
 * host would make the server fetch loopback / cloud-metadata / private addresses (SSRF).
 *
 * `assertSafeUrl` allows only `https://` to syntactically-valid **public** domains —
 * rejecting IP literals, single-label/`localhost`, and reserved/internal TLDs — and
 * `safeFetch` additionally refuses to follow redirects (which could pivot to an internal
 * host).
 *
 * Residual risk: a public domain whose DNS resolves to a private IP (DNS rebinding).
 * That can't be closed portably without resolving DNS and inspecting the address; it is
 * best handled at the network/egress layer of the deploy host (tracked for SP7).
 */

const RESERVED_TLDS = new Set( [
	'localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'corp',
	'test', 'example', 'invalid', 'arpa', 'onion', 'localdomain',
] );

/** True only for a syntactically valid, public, non-IP domain name. */
export function isPublicHostname( hostname: string ): boolean {
	if ( ! hostname ) {
		return false;
	}
	const host = hostname.toLowerCase().replace( /\.$/, '' );
	if ( host.includes( ':' ) || host.includes( '[' ) ) {
		return false; // IPv6 literal or embedded port
	}
	if ( /^\d{1,3}(\.\d{1,3}){3}$/.test( host ) ) {
		return false; // IPv4 literal
	}
	const labels = host.split( '.' );
	if ( labels.length < 2 ) {
		return false; // single-label (localhost, etc.)
	}
	for ( const label of labels ) {
		if ( ! /^[a-z0-9-]{1,63}$/.test( label ) || label.startsWith( '-' ) || label.endsWith( '-' ) ) {
			return false;
		}
	}
	const tld = labels[ labels.length - 1 ];
	if ( /^\d+$/.test( tld ) || RESERVED_TLDS.has( tld ) ) {
		return false;
	}
	return true;
}

/** Parse + validate a URL for outbound fetching; throws if it isn't a safe public https target. */
export function assertSafeUrl( rawUrl: string ): URL {
	let url: URL;
	try {
		url = new URL( rawUrl );
	} catch {
		throw new Error( `Invalid URL: ${ rawUrl }` );
	}
	if ( url.protocol !== 'https:' ) {
		throw new Error( `Refusing non-https URL (${ url.protocol })` );
	}
	if ( ! isPublicHostname( url.hostname ) ) {
		throw new Error( `Refusing non-public host: ${ url.hostname }` );
	}
	return url;
}

/** `fetch` restricted to safe public https targets, without following redirects. */
export function safeFetch( rawUrl: string, init: RequestInit = {} ): Promise< Response > {
	const url = assertSafeUrl( rawUrl );
	return fetch( url, { ...init, redirect: 'manual' } );
}
