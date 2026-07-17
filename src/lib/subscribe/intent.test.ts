import { describe, it, expect } from 'vitest';
import { saveSubscribeIntent, consumeSubscribeIntent } from './intent';

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

describe( 'subscribe intent store', () => {
	it( 'round-trips the pending publication URI exactly once', () => {
		const storage = memoryStorage();
		saveSubscribeIntent( 'at://did:plc:abc/site.standard.publication/xyz', storage );
		expect( consumeSubscribeIntent( storage ) ).toBe(
			'at://did:plc:abc/site.standard.publication/xyz'
		);
	} );

	it( 'clears on consume, so a second consume returns null', () => {
		const storage = memoryStorage();
		saveSubscribeIntent( 'at://did:plc:abc/site.standard.publication/xyz', storage );
		consumeSubscribeIntent( storage );
		expect( consumeSubscribeIntent( storage ) ).toBeNull();
	} );

	it( 'returns null when no subscribe intent is pending', () => {
		expect( consumeSubscribeIntent( memoryStorage() ) ).toBeNull();
	} );
} );
