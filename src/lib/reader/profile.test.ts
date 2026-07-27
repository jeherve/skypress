import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchActorProfile } from './profile';
import { getRecord } from './records';

vi.mock( './records', () => ( { getRecord: vi.fn() } ) );

const mockedGetRecord = getRecord as unknown as ReturnType< typeof vi.fn >;
const PDS = 'https://pds.example';
const DID = 'did:plc:me';

beforeEach( () => {
	mockedGetRecord.mockReset();
} );

describe( 'fetchActorProfile', () => {
	it( 'reads app.bsky.actor.profile/self and resolves blobs to getBlob URLs', async () => {
		mockedGetRecord.mockResolvedValue( {
			uri: `at://${ DID }/app.bsky.actor.profile/self`,
			cid: 'bafy',
			value: {
				displayName: 'Jane Rivera',
				description: '  Writer & gardener  ',
				avatar: { $type: 'blob', ref: { $link: 'bafyavatar' }, mimeType: 'image/png', size: 1 },
				banner: { $type: 'blob', ref: { $link: 'bafybanner' }, mimeType: 'image/png', size: 1 },
			},
		} );
		const profile = await fetchActorProfile( PDS, DID );

		expect( mockedGetRecord ).toHaveBeenCalledWith(
			PDS,
			DID,
			'app.bsky.actor.profile',
			'self'
		);
		expect( profile.displayName ).toBe( 'Jane Rivera' );
		expect( profile.description ).toBe( 'Writer & gardener' ); // trimmed
		expect( profile.avatar ).toContain( 'cid=bafyavatar' );
		expect( profile.banner ).toContain( 'cid=bafybanner' );
		expect( profile.exists ).toBe( true );
	} );

	it( 'returns all-null and exists:false when the profile record is missing', async () => {
		mockedGetRecord.mockResolvedValue( null );
		const profile = await fetchActorProfile( PDS, DID );
		expect( profile ).toEqual( {
			displayName: null,
			description: null,
			avatar: null,
			banner: null,
			exists: false,
		} );
	} );

	it( 'coerces empty strings and missing blobs to null', async () => {
		mockedGetRecord.mockResolvedValue( {
			uri: 'x',
			cid: 'y',
			value: { displayName: '   ', description: '' },
		} );
		const profile = await fetchActorProfile( PDS, DID );
		expect( profile.displayName ).toBeNull();
		expect( profile.description ).toBeNull();
		expect( profile.avatar ).toBeNull();
		expect( profile.banner ).toBeNull();
	} );

	it( 'reports exists:true for a record that is present but empty', async () => {
		// An empty record is still a record — the author page declares it as an
		// at:alternate, so "all fields null" must not be read as "no record".
		mockedGetRecord.mockResolvedValue( { uri: 'x', cid: 'y', value: {} } );
		const profile = await fetchActorProfile( PDS, DID );
		expect( profile.exists ).toBe( true );
		expect( profile.displayName ).toBeNull();
	} );
} );
