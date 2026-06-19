import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePdsUrl } from './pds';

/**
 * `resolvePdsUrl` turns a writer's DID into their PDS `serviceEndpoint`. For `did:plc` it
 * consults the PLC directory; we resolve through Eurosky's European mirror first (data
 * sovereignty) and fall back to the canonical Bluesky-run `plc.directory` so a mirror
 * miss/lag/outage never breaks resolution. `safeFetch` calls global `fetch` after its
 * public-host guard, so stubbing `fetch` (both PLC hosts are public) drives these tests.
 * See docs/decisions/0022-eurosky-plc-primary.md.
 */
const DID = 'did:plc:abc123';
const ENC = encodeURIComponent( DID );
const EUROSKY = `https://plc.eurosky.network/${ ENC }`;
const CANONICAL = `https://plc.directory/${ ENC }`;

function didDoc( endpoint: string ) {
	return {
		ok: true,
		status: 200,
		json: async () => ( {
			service: [
				{
					id: '#atproto_pds',
					type: 'AtprotoPersonalDataServer',
					serviceEndpoint: endpoint,
				},
			],
		} ),
	} as unknown as Response;
}

const notFound = () =>
	( { ok: false, status: 404, json: async () => ( {} ) } as unknown as Response );

describe( 'resolvePdsUrl — did:plc resolution order', () => {
	afterEach( () => vi.unstubAllGlobals() );

	it( 'resolves via the Eurosky mirror first, without touching the canonical directory', async () => {
		const fetchSpy = vi.fn( async ( url: URL | string ) => {
			if ( String( url ) === EUROSKY ) {
				return didDoc( 'https://pds.example.com' );
			}
			throw new Error( `unexpected fetch: ${ url }` );
		} );
		vi.stubGlobal( 'fetch', fetchSpy );

		expect( await resolvePdsUrl( DID ) ).toBe( 'https://pds.example.com' );
		const hosts = fetchSpy.mock.calls.map( ( c ) => String( c[ 0 ] ) );
		expect( hosts ).toContain( EUROSKY );
		expect( hosts ).not.toContain( CANONICAL );
	} );

	it( 'falls back to plc.directory when the mirror returns a non-ok response', async () => {
		const fetchSpy = vi.fn( async ( url: URL | string ) => {
			if ( String( url ) === EUROSKY ) {
				return notFound();
			}
			if ( String( url ) === CANONICAL ) {
				return didDoc( 'https://canonical-pds.example.com' );
			}
			throw new Error( `unexpected fetch: ${ url }` );
		} );
		vi.stubGlobal( 'fetch', fetchSpy );

		expect( await resolvePdsUrl( DID ) ).toBe( 'https://canonical-pds.example.com' );
	} );

	it( 'falls back to plc.directory when the mirror request throws', async () => {
		const fetchSpy = vi.fn( async ( url: URL | string ) => {
			if ( String( url ) === EUROSKY ) {
				throw new Error( 'network down' );
			}
			if ( String( url ) === CANONICAL ) {
				return didDoc( 'https://canonical-pds.example.com' );
			}
			throw new Error( `unexpected fetch: ${ url }` );
		} );
		vi.stubGlobal( 'fetch', fetchSpy );

		expect( await resolvePdsUrl( DID ) ).toBe( 'https://canonical-pds.example.com' );
	} );

	it( 'throws after trying every PLC host when none can resolve the DID', async () => {
		const fetchSpy = vi.fn( async () => notFound() );
		vi.stubGlobal( 'fetch', fetchSpy );

		await expect( resolvePdsUrl( DID ) ).rejects.toThrow(
			/Failed to resolve DID document/
		);
		expect( fetchSpy ).toHaveBeenCalledTimes( 2 );
	} );

	it( 'throws on an unsupported DID method without any network request', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal( 'fetch', fetchSpy );

		await expect( resolvePdsUrl( 'did:foo:bar' ) ).rejects.toThrow(
			/Unsupported DID method/
		);
		expect( fetchSpy ).not.toHaveBeenCalled();
	} );

	it( 'resolves did:web from the domain itself, never via a PLC host', async () => {
		const fetchSpy = vi.fn( async ( url: URL | string ) => {
			if ( String( url ) === 'https://example.com/.well-known/did.json' ) {
				return didDoc( 'https://pds.example.com' );
			}
			throw new Error( `unexpected fetch: ${ url }` );
		} );
		vi.stubGlobal( 'fetch', fetchSpy );

		expect( await resolvePdsUrl( 'did:web:example.com' ) ).toBe( 'https://pds.example.com' );
		const hosts = fetchSpy.mock.calls.map( ( c ) => String( c[ 0 ] ) );
		expect( hosts.some( ( h ) => h.includes( 'plc.' ) ) ).toBe( false );
	} );
} );
