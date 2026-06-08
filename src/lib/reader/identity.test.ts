import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHandleToDid } from './identity';

/**
 * The read path takes the author straight from the URL (`/@<author>`) and uses it as a
 * resolver fetch host. These tests lock in that a non-handle-shaped value (path/port/
 * query/scheme smuggling) is rejected BEFORE any network request — so the worker can't be
 * turned into a request proxy. `safeFetch` is the internal-host backstop; this is the
 * syntactic gate in front of it.
 */
describe( 'resolveHandleToDid — read-path input validation', () => {
	afterEach( () => {
		vi.unstubAllGlobals();
	} );

	it( 'rejects non-handle input without making any network request', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal( 'fetch', fetchSpy );

		for ( const bad of [
			'evil.com/.well-known/atproto-did',
			'evil.com?x=y',
			'evil.com:8080',
			'http://evil.com',
			'user@evil.com',
			'',
			'   ',
			'notahandle',
		] ) {
			expect( await resolveHandleToDid( bad ) ).toBeNull();
		}
		expect( fetchSpy ).not.toHaveBeenCalled();
	} );

	it( 'returns a DID unchanged without a network request', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal( 'fetch', fetchSpy );

		expect( await resolveHandleToDid( 'did:plc:abc123' ) ).toBe( 'did:plc:abc123' );
		expect( fetchSpy ).not.toHaveBeenCalled();
	} );
} );
