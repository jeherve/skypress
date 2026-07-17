import { describe, it, expect } from 'vitest';
import { setOAuthReturn, takeOAuthReturn, safeOAuthReturnPath } from './oauth-return';

/** Minimal in-memory Storage stand-in (jsdom's localStorage isn't needed for pure logic). */
function memoryStorage(): Storage {
	const map = new Map< string, string >();
	return {
		getItem: ( k ) => map.get( k ) ?? null,
		setItem: ( k, v ) => void map.set( k, v ),
		removeItem: ( k ) => void map.delete( k ),
		clear: () => map.clear(),
		key: ( i ) => [ ...map.keys() ][ i ] ?? null,
		get length() {
			return map.size;
		},
	};
}

describe( 'oauth-return store', () => {
	it( 'round-trips the stashed return path exactly once', () => {
		const storage = memoryStorage();
		setOAuthReturn( '/@alice.bsky.social/my-pub/', storage );
		expect( takeOAuthReturn( storage ) ).toBe( '/@alice.bsky.social/my-pub/' );
	} );

	it( 'clears on read, so a second take returns null', () => {
		const storage = memoryStorage();
		setOAuthReturn( '/@alice.bsky.social/my-pub/', storage );
		takeOAuthReturn( storage );
		expect( takeOAuthReturn( storage ) ).toBeNull();
	} );

	it( 'returns null when nothing was stashed', () => {
		expect( takeOAuthReturn( memoryStorage() ) ).toBeNull();
	} );
} );

describe( 'safeOAuthReturnPath', () => {
	it( 'accepts a same-origin absolute path', () => {
		expect( safeOAuthReturnPath( '/@alice.bsky.social/my-pub/' ) ).toBe(
			'/@alice.bsky.social/my-pub/'
		);
	} );

	it( 'collapses off-origin, protocol-relative, non-slash and empty values to /', () => {
		expect( safeOAuthReturnPath( 'https://evil.com' ) ).toBe( '/' );
		expect( safeOAuthReturnPath( '//evil.com' ) ).toBe( '/' );
		expect( safeOAuthReturnPath( 'editor' ) ).toBe( '/' );
		expect( safeOAuthReturnPath( '' ) ).toBe( '/' );
		expect( safeOAuthReturnPath( null ) ).toBe( '/' );
	} );
} );
