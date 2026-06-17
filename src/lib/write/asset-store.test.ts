import { describe, it, expect } from 'vitest';
import { createMemoryAssetStore } from './asset-store';

describe( 'createMemoryAssetStore', () => {
	it( 'puts, merges, reads all, and clears', async () => {
		const store = createMemoryAssetStore();
		await store.put( { a0: 'data:1' } );
		await store.put( { a1: 'data:2' } );
		expect( await store.getAll() ).toEqual( { a0: 'data:1', a1: 'data:2' } );
		await store.clear();
		expect( await store.getAll() ).toEqual( {} );
	} );

	it( 'replaces a key on re-put', async () => {
		const store = createMemoryAssetStore();
		await store.put( { a0: 'data:1' } );
		await store.put( { a0: 'data:CHANGED' } );
		expect( await store.getAll() ).toEqual( { a0: 'data:CHANGED' } );
	} );
} );
