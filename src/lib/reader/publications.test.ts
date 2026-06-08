import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listReaderPublications, resolveReaderPublication } from './publications';
import { listRecords } from './records';
import { SITE_BASE } from '../publish/records';

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
