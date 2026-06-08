import { describe, expect, it } from 'vitest';
import { isPublicHostname, assertSafeUrl } from './safe-fetch';

describe( 'isPublicHostname', () => {
	it( 'accepts real public domains', () => {
		expect( isPublicHostname( 'bsky.social' ) ).toBe( true );
		expect( isPublicHostname( 'jeherve.com' ) ).toBe( true );
		expect( isPublicHostname( 'chanterelle.us-west.host.bsky.network' ) ).toBe( true );
	} );

	it( 'rejects IP literals (incl. cloud metadata + loopback)', () => {
		expect( isPublicHostname( '127.0.0.1' ) ).toBe( false );
		expect( isPublicHostname( '169.254.169.254' ) ).toBe( false );
		expect( isPublicHostname( '10.0.0.5' ) ).toBe( false );
		expect( isPublicHostname( '[::1]' ) ).toBe( false );
		expect( isPublicHostname( '::1' ) ).toBe( false );
	} );

	it( 'rejects single-label and reserved/internal names', () => {
		expect( isPublicHostname( 'localhost' ) ).toBe( false );
		expect( isPublicHostname( 'internal' ) ).toBe( false );
		expect( isPublicHostname( 'foo.internal' ) ).toBe( false );
		expect( isPublicHostname( 'db.local' ) ).toBe( false );
		expect( isPublicHostname( 'host.localhost' ) ).toBe( false );
		expect( isPublicHostname( '' ) ).toBe( false );
	} );
} );

describe( 'assertSafeUrl', () => {
	it( 'returns a parsed URL for safe https targets', () => {
		expect( assertSafeUrl( 'https://bsky.social/xrpc/x' ).hostname ).toBe( 'bsky.social' );
	} );

	it( 'throws for non-https, IPs, ports-to-internal, and reserved hosts', () => {
		expect( () => assertSafeUrl( 'http://bsky.social/x' ) ).toThrow();
		expect( () => assertSafeUrl( 'https://127.0.0.1/x' ) ).toThrow();
		expect( () => assertSafeUrl( 'https://localhost/x' ) ).toThrow();
		expect( () => assertSafeUrl( 'https://169.254.169.254/latest/meta-data' ) ).toThrow();
		expect( () => assertSafeUrl( 'file:///etc/passwd' ) ).toThrow();
	} );
} );
