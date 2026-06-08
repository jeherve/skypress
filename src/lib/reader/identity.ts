/**
 * Resolve a writer's identity for the read-through renderer (SP4).
 * Runs server-side (Node/edge): handle → DID → PDS.
 */
import { resolvePdsUrl } from '../media/pds';
import { safeFetch } from '../net/safe-fetch';

/** Default handle resolver — a `com.atproto.identity.resolveHandle` XRPC endpoint. */
const FALLBACK_RESOLVER = 'https://bsky.social';

async function resolveViaWellKnown( handle: string ): Promise< string | null > {
	try {
		// safeFetch rejects non-public hosts, so an attacker-supplied handle like
		// `169.254.169.254` or `internal-svc` can't trigger an internal request (SSRF).
		const res = await safeFetch( `https://${ handle }/.well-known/atproto-did` );
		if ( ! res.ok ) {
			return null;
		}
		const did = ( await res.text() ).trim();
		return did.startsWith( 'did:' ) ? did : null;
	} catch {
		return null;
	}
}

async function resolveViaXrpc( handle: string ): Promise< string | null > {
	try {
		const res = await safeFetch(
			`${ FALLBACK_RESOLVER }/xrpc/com.atproto.identity.resolveHandle?handle=${ encodeURIComponent(
				handle
			) }`
		);
		if ( ! res.ok ) {
			return null;
		}
		const data: { did?: string } = await res.json();
		return data.did ?? null;
	} catch {
		return null;
	}
}

/**
 * Resolve a handle (or DID) to a DID. Prefers the handle's own `.well-known`
 * (no third party), falling back to a public resolver XRPC.
 */
export async function resolveHandleToDid( handleOrDid: string ): Promise< string | null > {
	if ( handleOrDid.startsWith( 'did:' ) ) {
		return handleOrDid;
	}
	return ( await resolveViaWellKnown( handleOrDid ) ) ?? ( await resolveViaXrpc( handleOrDid ) );
}

export interface Author {
	did: string;
	pdsUrl: string;
}

/** Resolve a handle/DID to `{ did, pdsUrl }`, or null if it can't be resolved. */
export async function resolveAuthor( handleOrDid: string ): Promise< Author | null > {
	const did = await resolveHandleToDid( handleOrDid );
	if ( ! did ) {
		return null;
	}
	try {
		return { did, pdsUrl: await resolvePdsUrl( did ) };
	} catch {
		return null;
	}
}
