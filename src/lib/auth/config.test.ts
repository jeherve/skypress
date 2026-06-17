import { describe, expect, it } from 'vitest';
import {
	getClientMode,
	clientMetadataUrl,
	normalizeHandle,
	isValidAccountInput,
	isValidHandleOrDid,
	redirectUriForLocation,
	OAUTH_REDIRECT_PATHS,
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

describe( 'OAUTH_REDIRECT_PATHS', () => {
	it( 'lists every route that mounts the OAuth island, /editor/ first (the default)', () => {
		// Both editor surfaces must be registered redirect targets, or atproto rejects
		// the round-trip; /editor/ stays first so it is the safe fallback for any other
		// page that ever triggers sign-in.
		expect( OAUTH_REDIRECT_PATHS ).toEqual( [ '/editor/', '/write/' ] );
	} );
} );

describe( 'redirectUriForLocation', () => {
	it( 'returns the originating page so the OAuth round-trip comes back to it', () => {
		// The bug: signing in from /write returned the writer to /editor (the only
		// registered redirect), orphaning the writing-first draft + publish intent.
		expect( redirectUriForLocation( 'https://skypress.blog', '/write/' ) ).toBe(
			'https://skypress.blog/write/'
		);
		expect( redirectUriForLocation( 'https://skypress.blog', '/editor/' ) ).toBe(
			'https://skypress.blog/editor/'
		);
	} );

	it( 'normalises a missing trailing slash to the registered (slashed) path', () => {
		expect( redirectUriForLocation( 'https://skypress.blog', '/write' ) ).toBe(
			'https://skypress.blog/write/'
		);
	} );

	it( 'falls back to /editor/ for any non-editor path', () => {
		expect( redirectUriForLocation( 'https://skypress.blog', '/' ) ).toBe(
			'https://skypress.blog/editor/'
		);
		expect( redirectUriForLocation( 'https://skypress.blog', '/dashboard/' ) ).toBe(
			'https://skypress.blog/editor/'
		);
	} );

	it( 'strips a trailing slash off the origin before joining', () => {
		expect( redirectUriForLocation( 'https://skypress.blog/', '/write/' ) ).toBe(
			'https://skypress.blog/write/'
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

describe( 'isValidHandleOrDid', () => {
	it( 'accepts handles and DIDs', () => {
		expect( isValidHandleOrDid( 'alice.bsky.social' ) ).toBe( true );
		expect( isValidHandleOrDid( '@alice.bsky.social' ) ).toBe( true );
		expect( isValidHandleOrDid( 'did:plc:abc123' ) ).toBe( true );
		expect( isValidHandleOrDid( 'did:web:example.com' ) ).toBe( true );
	} );

	it( 'rejects URLs and anything carrying a path, port, query or scheme', () => {
		// These would otherwise be used directly as a resolver fetch host (SSRF/proxy).
		expect( isValidHandleOrDid( 'https://pds.example.com' ) ).toBe( false );
		expect( isValidHandleOrDid( 'evil.com/.well-known/atproto-did' ) ).toBe( false );
		expect( isValidHandleOrDid( 'evil.com?x=y' ) ).toBe( false );
		expect( isValidHandleOrDid( 'evil.com:8080' ) ).toBe( false );
		expect( isValidHandleOrDid( 'user@evil.com' ) ).toBe( false );
	} );

	it( 'rejects empty input and bare words without a domain', () => {
		expect( isValidHandleOrDid( '' ) ).toBe( false );
		expect( isValidHandleOrDid( '   ' ) ).toBe( false );
		expect( isValidHandleOrDid( 'notahandle' ) ).toBe( false );
	} );
} );

describe( 'OAUTH_SCOPE', () => {
	it( 'requests atproto + transitional generic access for SP1', () => {
		expect( OAUTH_SCOPE ).toBe( 'atproto transition:generic' );
	} );
} );
