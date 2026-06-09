import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	listReaderPublications,
	listAllReaderPublications,
	resolveReaderPublication,
} from './publications';
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

describe( 'listReaderPublications', () => {
	it( 'keeps only SkyPress-origin, slugged publications', async () => {
		mockedList.mockResolvedValue( [
			rec( 'a', `${ SITE_BASE }/@me.bsky.social/blog`, { description: ' Hi ' } ),
			rec( 'b', 'https://leaflet.pub/x/y' ),
			rec( 'c', `${ SITE_BASE }/@me.bsky.social` ),
		] );
		const pubs = await listReaderPublications( PDS, DID );
		expect( pubs ).toHaveLength( 1 );
		expect( pubs[ 0 ] ).toMatchObject( {
			uri: `at://${ DID }/site.standard.publication/a`,
			slug: 'blog',
			name: 'Pa',
			description: 'Hi',
		} );
	} );
} );

describe( 'listAllReaderPublications', () => {
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
			url: 'https://leaflet.pub/lish/did:plc:me/xyz',
			icon,
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

describe( 'resolveReaderPublication', () => {
	it( 'finds the publication whose slug matches', async () => {
		mockedList.mockResolvedValue( [
			rec( 'a', `${ SITE_BASE }/@me.bsky.social/blog` ),
			rec( 'b', `${ SITE_BASE }/@me.bsky.social/notes` ),
		] );
		const pub = await resolveReaderPublication( PDS, DID, 'notes' );
		expect( pub?.uri ).toBe( `at://${ DID }/site.standard.publication/b` );
	} );

	it( 'returns null when no slug matches', async () => {
		mockedList.mockResolvedValue( [ rec( 'a', `${ SITE_BASE }/@me.bsky.social/blog` ) ] );
		expect( await resolveReaderPublication( PDS, DID, 'missing' ) ).toBeNull();
	} );
} );

describe( 'reader basicTheme', () => {
	it( 'surfaces a valid stored basicTheme', async () => {
		mockedList.mockResolvedValue( [
			rec( 'a', `${ SITE_BASE }/@me.bsky.social/blog`, {
				basicTheme: THEME_PRESETS[ 5 ].colors, // morning
			} ),
		] );
		const pub = await resolveReaderPublication( PDS, DID, 'blog' );
		expect( pub?.basicTheme ).toEqual( THEME_PRESETS[ 5 ].colors );
	} );

	it( 'sets basicTheme to null when absent or malformed', async () => {
		mockedList.mockResolvedValue( [
			rec( 'a', `${ SITE_BASE }/@me.bsky.social/plain` ),
			rec( 'b', `${ SITE_BASE }/@me.bsky.social/broken`, { basicTheme: { accent: 'red' } } ),
		] );
		expect( ( await resolveReaderPublication( PDS, DID, 'plain' ) )?.basicTheme ).toBeNull();
		expect( ( await resolveReaderPublication( PDS, DID, 'broken' ) )?.basicTheme ).toBeNull();
	} );
} );
