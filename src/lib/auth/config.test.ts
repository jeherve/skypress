import { describe, expect, it } from 'vitest';
import {
	getClientMode,
	clientMetadataUrl,
	normalizeHandle,
	isValidAccountInput,
	OAUTH_SCOPE,
} from './config';

describe( 'getClientMode', () => {
	it( 'treats loopback hosts as dev (loopback) clients', () => {
		expect( getClientMode( 'localhost' ) ).toBe( 'loopback' );
		expect( getClientMode( '127.0.0.1' ) ).toBe( 'loopback' );
		expect( getClientMode( '[::1]' ) ).toBe( 'loopback' );
	} );

	it( 'treats real hosts as hosted clients', () => {
		expect( getClientMode( 'skypress.blog' ) ).toBe( 'hosted' );
	} );
} );

describe( 'clientMetadataUrl', () => {
	it( 'points at /client-metadata.json on the app origin', () => {
		expect( clientMetadataUrl( 'https://skypress.blog' ) ).toBe(
			'https://skypress.blog/client-metadata.json'
		);
	} );
} );

describe( 'normalizeHandle', () => {
	it( 'strips a leading @, trims, and lowercases', () => {
		expect( normalizeHandle( '  @Alice.BSKY.social ' ) ).toBe( 'alice.bsky.social' );
		expect( normalizeHandle( 'bob.com' ) ).toBe( 'bob.com' );
	} );
} );

describe( 'isValidAccountInput', () => {
	it( 'accepts handles, DIDs and PDS URLs', () => {
		expect( isValidAccountInput( 'alice.bsky.social' ) ).toBe( true );
		expect( isValidAccountInput( '@alice.bsky.social' ) ).toBe( true );
		expect( isValidAccountInput( 'did:plc:abc123' ) ).toBe( true );
		expect( isValidAccountInput( 'https://pds.example.com' ) ).toBe( true );
	} );

	it( 'rejects empty input and bare words without a domain', () => {
		expect( isValidAccountInput( '' ) ).toBe( false );
		expect( isValidAccountInput( '   ' ) ).toBe( false );
		expect( isValidAccountInput( 'notahandle' ) ).toBe( false );
	} );
} );

describe( 'OAUTH_SCOPE', () => {
	it( 'requests atproto + transitional generic access for SP1', () => {
		expect( OAUTH_SCOPE ).toBe( 'atproto transition:generic' );
	} );
} );
