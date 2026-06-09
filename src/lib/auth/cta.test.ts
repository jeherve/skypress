import { describe, expect, it } from 'vitest';
import { isProfileOwner } from './cta';

const PROFILE = 'did:plc:profile';

describe( 'isProfileOwner', () => {
	it( 'is true when signed in and the viewer DID matches the profile DID', () => {
		expect( isProfileOwner( 'signed-in', 'did:plc:profile', PROFILE ) ).toBe( true );
	} );

	it( 'is false when signed in as a different DID', () => {
		expect( isProfileOwner( 'signed-in', 'did:plc:someone-else', PROFILE ) ).toBe( false );
	} );

	it( 'is false when the viewer DID is null', () => {
		expect( isProfileOwner( 'signed-in', null, PROFILE ) ).toBe( false );
	} );

	it( 'is false for loading, signed-out and error statuses even if a DID matches', () => {
		expect( isProfileOwner( 'loading', PROFILE, PROFILE ) ).toBe( false );
		expect( isProfileOwner( 'signed-out', PROFILE, PROFILE ) ).toBe( false );
		expect( isProfileOwner( 'error', PROFILE, PROFILE ) ).toBe( false );
	} );
} );
