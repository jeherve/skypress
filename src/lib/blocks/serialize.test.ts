import { beforeAll, describe, expect, it } from 'vitest';
import { createBlock } from '@wordpress/blocks';
import {
	registerSkyPressBlocks,
	serializeBlocks,
	parseBlocks,
} from './serialize';

beforeAll( () => {
	registerSkyPressBlocks();
} );

describe( 'block-tree round trip', () => {
	it( 'serialize → parse → serialize is idempotent for the curated set', () => {
		const blocks = [
			createBlock( 'core/heading', { level: 2, content: 'Welcome' } ),
			createBlock( 'core/paragraph', { content: 'Hello world' } ),
			createBlock( 'core/list', {}, [
				createBlock( 'core/list-item', { content: 'First' } ),
				createBlock( 'core/list-item', { content: 'Second' } ),
			] ),
			createBlock( 'core/quote', {}, [
				createBlock( 'core/paragraph', { content: 'A quotable line' } ),
			] ),
			createBlock( 'core/separator' ),
		];

		const markup1 = serializeBlocks( blocks );
		const markup2 = serializeBlocks( parseBlocks( markup1 ) );

		expect( markup1 ).toContain( '<!-- wp:heading' );
		expect( markup2 ).toBe( markup1 );
	} );
} );

describe( 'edit round-trip preserves the blob reference', () => {
	// Reloading a published document for editing rebuilds each block with
	// `createBlock` (SkyEditor's `toEditorBlocks`). `createBlock` sanitises
	// attributes down to the registered schema, so the custom `skypressBlob`
	// blob ref must be registered on `core/image` or it is silently dropped —
	// which makes the PDS garbage-collect the blob on the next update commit.
	it( 'createBlock keeps the custom skypressBlob attribute on core/image', () => {
		const skypressBlob = {
			$type: 'blob',
			ref: { $link: 'bafkreifazdufln7f377eye4ql7tquarcnh75ew6xx4w2tcjt56s6bcb3di' },
			mimeType: 'image/png',
			size: 1234,
		};

		const block = createBlock( 'core/image', {
			url: 'https://pds.example/xrpc/com.atproto.sync.getBlob?did=did:plc:x&cid=bafkreifazdufln7f377eye4ql7tquarcnh75ew6xx4w2tcjt56s6bcb3di',
			skypressBlob,
		} );

		expect( block.attributes.skypressBlob ).toEqual( skypressBlob );
	} );
} );
