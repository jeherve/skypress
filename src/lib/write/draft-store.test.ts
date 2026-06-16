import { describe, it, expect, beforeEach } from 'vitest';
import { createDraftStore, type WriteDraft } from './draft-store';
import { createMemoryAssetStore } from './asset-store';
import type { BlockNode } from '../blocks/render';

const DATA = 'data:image/png;base64,QUFB';

function draft(): WriteDraft {
	return {
		title: 'Hello',
		lede: 'A lede',
		blocks: [
			{ name: 'core/paragraph', attributes: { content: 'hi' }, innerBlocks: [] },
			{ name: 'core/image', attributes: { url: DATA }, innerBlocks: [] },
		] as BlockNode[],
		coverDataUrl: DATA,
	};
}

beforeEach( () => window.localStorage.clear() );

function newStore() {
	return createDraftStore( { assets: createMemoryAssetStore(), storage: window.localStorage } );
}

describe( 'draft-store', () => {
	it( 'round-trips a draft including held image + cover bytes', async () => {
		const store = newStore();
		await store.save( draft() );
		// Image bytes must NOT sit in localStorage (only the token skeleton).
		expect( window.localStorage.getItem( 'skypress:write:draft' ) ).not.toContain( 'base64' );
		const loaded = await store.load();
		expect( loaded ).toEqual( draft() );
	} );

	it( 'returns null when nothing is saved', async () => {
		expect( await newStore().load() ).toBe( null );
	} );

	it( 'clear() removes the draft and its assets', async () => {
		const store = newStore();
		await store.save( draft() );
		await store.clear();
		expect( await store.load() ).toBe( null );
	} );

	it( 'publish intent is one-shot (set, then consumed once)', () => {
		const store = newStore();
		expect( store.consumePublishIntent() ).toBe( false );
		store.setPublishIntent();
		expect( store.consumePublishIntent() ).toBe( true );
		expect( store.consumePublishIntent() ).toBe( false );
	} );
} );
