import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listAllReaderPublications } from './publications';
import { listRecords } from './records';
import { SITE_BASE } from '../publish/records';
import { THEME_PRESETS } from '../publish/themes';

vi.mock( './records', () => ( { listRecords: vi.fn() } ) );
const mockedList = listRecords as unknown as ReturnType< typeof vi.fn >;

const PDS = 'https://pds.example';
const DID = 'did:plc:me';

function rec( rkey: string, url: string, extra: Record< string, unknown > = {} ) {
	return { uri: `at://${ DID }/site.standard.publication/${ rkey }`, cid: 'c', value: { url, name: `P${ rkey }`, ...extra } };
}

beforeEach( () => mockedList.mockReset() );

describe( 'listAllReaderPublications', () => {
	it( 'keeps only SkyPress-origin, slugged publications as owned', async () => {
		mockedList.mockResolvedValue( [
			rec( 'a', `${ SITE_BASE }/@me.bsky.social/blog`, { description: ' Hi ' } ),
			rec( 'b', 'https://leaflet.pub/x/y' ),
			rec( 'c', `${ SITE_BASE }/@me.bsky.social` ),
		] );
		const { owned } = await listAllReaderPublications( PDS, DID );
		expect( owned ).toHaveLength( 1 );
		expect( owned[ 0 ] ).toMatchObject( {
			uri: `at://${ DID }/site.standard.publication/a`,
			slug: 'blog',
			name: 'Pa',
			description: 'Hi',
		} );
	} );

	it( 'partitions owned SkyPress publications from foreign ones', async () => {
		const icon = { ref: { $link: 'bafyicon' }, mimeType: 'image/png', size: 1 };
		mockedList.mockResolvedValue( [
			rec( 'a', `${ SITE_BASE }/@me.bsky.social/blog`, { description: ' Hi ' } ),
			rec( 'b', 'https://leaflet.pub/lish/did:plc:me/xyz', { name: 'My Leaflet', icon } ),
			rec( 'c', 'ipfs://not-a-web-url' ), // non-http(s) → excluded everywhere
			rec( 'd', `${ SITE_BASE }/@me.bsky.social` ), // SkyPress, no slug → dropped
		] );
		const { owned, foreign } = await listAllReaderPublications( PDS, DID );

		expect( owned ).toHaveLength( 1 );
		expect( owned[ 0 ] ).toMatchObject( { slug: 'blog', name: 'Pa' } );

		expect( foreign ).toHaveLength( 1 );
		expect( foreign[ 0 ] ).toEqual( {
			uri: `at://${ DID }/site.standard.publication/b`,
			name: 'My Leaflet',
			hostname: 'leaflet.pub',
			url: 'https://leaflet.pub/lish/did:plc:me/xyz',
			icon,
			provider: 'leaflet',
		} );
	} );

	it( 'tags each foreign publication with its hostname and detected provider', async () => {
		mockedList.mockResolvedValue( [
			rec( 'a', 'https://jehervecom.leaflet.pub' ),
			rec( 'b', 'https://my-domain.example', { theme: { $type: 'blog.pckt.theme' } } ),
			rec( 'c', 'https://unknown.example/path' ),
		] );
		const { foreign } = await listAllReaderPublications( PDS, DID );
		const byRkey = Object.fromEntries(
			foreign.map( ( p ) => [ p.uri.split( '/' ).pop(), { hostname: p.hostname, provider: p.provider } ] )
		);
		expect( byRkey ).toEqual( {
			a: { hostname: 'jehervecom.leaflet.pub', provider: 'leaflet' },
			b: { hostname: 'my-domain.example', provider: 'pckt' },
			c: { hostname: 'unknown.example', provider: null },
		} );
	} );

	it( 'falls back to the hostname when a foreign record has no name', async () => {
		mockedList.mockResolvedValue( [
			{ uri: `at://${ DID }/site.standard.publication/n`, cid: 'c', value: { url: 'https://leaflet.pub/x' } },
		] );
		const { foreign } = await listAllReaderPublications( PDS, DID );
		expect( foreign[ 0 ] ).toMatchObject( { name: 'leaflet.pub', icon: null } );
	} );
} );

describe( 'reader basicTheme', () => {
	it( 'surfaces a valid stored basicTheme', async () => {
		mockedList.mockResolvedValue( [
			rec( 'a', `${ SITE_BASE }/@me.bsky.social/blog`, {
				basicTheme: THEME_PRESETS[ 5 ].colors, // morning
			} ),
		] );
		const { owned } = await listAllReaderPublications( PDS, DID );
		expect( owned[ 0 ].basicTheme ).toEqual( THEME_PRESETS[ 5 ].colors );
	} );

	it( 'sets basicTheme to null when absent or malformed', async () => {
		mockedList.mockResolvedValue( [
			rec( 'a', `${ SITE_BASE }/@me.bsky.social/plain` ),
			rec( 'b', `${ SITE_BASE }/@me.bsky.social/broken`, { basicTheme: { accent: 'red' } } ),
		] );
		const { owned } = await listAllReaderPublications( PDS, DID );
		expect( owned.find( ( p ) => p.slug === 'plain' )?.basicTheme ).toBeNull();
		expect( owned.find( ( p ) => p.slug === 'broken' )?.basicTheme ).toBeNull();
	} );
} );
