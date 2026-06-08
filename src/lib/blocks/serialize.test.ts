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
