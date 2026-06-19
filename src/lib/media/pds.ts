import { safeFetch, assertSafeUrl } from '../net/safe-fetch';

/**
 * PLC directory hosts for `did:plc` resolution, tried in order. Eurosky's European mirror
 * is primary (data sovereignty — keep DID lookups on EU infrastructure); the canonical
 * Bluesky-run `plc.directory` is the fallback so a mirror miss, lag, or outage never breaks
 * resolution. Both are public hosts, so each request still passes the `safeFetch` SSRF guard.
 * See docs/decisions/0022-eurosky-plc-primary.md.
 */
const PLC_HOSTS = [ 'https://plc.eurosky.network', 'https://plc.directory' ];

interface DidDocument {
	service?: Array< { id: string; type: string; serviceEndpoint: string } >;
}

/** Fetch and parse a DID document. Throws on a non-ok response. */
async function fetchDidDoc( docUrl: string ): Promise< DidDocument > {
	const res = await safeFetch( docUrl );
	if ( ! res.ok ) {
		throw new Error( `Failed to resolve DID document (${ res.status })` );
	}
	return ( await res.json() ) as DidDocument;
}

/** Pull the atproto PDS `serviceEndpoint` out of a DID document. */
function extractPdsEndpoint( doc: DidDocument ): string {
	const pds = ( doc.service ?? [] ).find(
		( service ) =>
			service.id === '#atproto_pds' ||
			service.type === 'AtprotoPersonalDataServer'
	);
	if ( ! pds?.serviceEndpoint ) {
		throw new Error( 'No atproto PDS endpoint in DID document' );
	}
	// The endpoint comes from the DID doc — validate before anyone fetches it.
	return assertSafeUrl( pds.serviceEndpoint ).toString().replace( /\/$/, '' );
}

/** Resolve a `did:plc` via the PLC hosts in order, falling back on any failure. */
async function resolveViaPlcHosts( did: string ): Promise< string > {
	const path = encodeURIComponent( did );
	let lastError: unknown;
	for ( const host of PLC_HOSTS ) {
		try {
			return extractPdsEndpoint( await fetchDidDoc( `${ host }/${ path }` ) );
		} catch ( error ) {
			lastError = error;
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error( `Failed to resolve ${ did } from any PLC directory` );
}

/**
 * Resolve a writer's PDS endpoint from their DID document. Handles `did:plc` (via the PLC
 * directory hosts, Eurosky mirror first) and `did:web` (from the domain's own `did.json`).
 * The `did:web` host and the returned `serviceEndpoint` are untrusted, so both go through
 * `safeFetch`/`assertSafeUrl` to prevent SSRF.
 */
export async function resolvePdsUrl( did: string ): Promise< string > {
	if ( did.startsWith( 'did:plc:' ) ) {
		return resolveViaPlcHosts( did );
	}
	if ( did.startsWith( 'did:web:' ) ) {
		const host = did.slice( 'did:web:'.length ).replace( /:/g, '/' );
		return extractPdsEndpoint(
			await fetchDidDoc( `https://${ host }/.well-known/did.json` )
		);
	}
	throw new Error( `Unsupported DID method: ${ did }` );
}
