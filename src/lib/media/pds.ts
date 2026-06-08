import { safeFetch, assertSafeUrl } from '../net/safe-fetch';

/**
 * Resolve a writer's PDS endpoint from their DID document. Handles `did:plc` (via
 * plc.directory) and `did:web`. The `did:web` host and the returned `serviceEndpoint`
 * are untrusted, so both go through `safeFetch`/`assertSafeUrl` to prevent SSRF.
 */
export async function resolvePdsUrl( did: string ): Promise< string > {
	let docUrl: string;
	if ( did.startsWith( 'did:plc:' ) ) {
		docUrl = `https://plc.directory/${ encodeURIComponent( did ) }`;
	} else if ( did.startsWith( 'did:web:' ) ) {
		const host = did.slice( 'did:web:'.length ).replace( /:/g, '/' );
		docUrl = `https://${ host }/.well-known/did.json`;
	} else {
		throw new Error( `Unsupported DID method: ${ did }` );
	}

	const res = await safeFetch( docUrl );
	if ( ! res.ok ) {
		throw new Error( `Failed to resolve DID document (${ res.status })` );
	}
	const doc: { service?: Array< { id: string; type: string; serviceEndpoint: string } > } =
		await res.json();
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
