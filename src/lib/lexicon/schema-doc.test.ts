import { describe, expect, it } from 'vitest';
import {
	CONTENT_LEXICON_ID,
	CONTENT_LEXICON_DESCRIPTION,
	contentSchemaFields,
} from './schema-doc';

describe( 'content lexicon doc', () => {
	it( 'exposes the owned lexicon NSID and description from the schema file', () => {
		expect( CONTENT_LEXICON_ID ).toBe( 'blog.skypress.content.gutenberg' );
		expect( CONTENT_LEXICON_DESCRIPTION ).toContain( 'block tree' );
	} );

	it( 'derives ordered field rows from the schema, with required flags', () => {
		const fields = contentSchemaFields();
		expect( fields.map( ( f ) => f.name ) ).toEqual( [ 'version', 'blocks', 'mentions' ] );

		expect( fields[ 0 ] ).toMatchObject( {
			name: 'version',
			type: 'integer',
			required: true,
		} );
		expect( fields[ 0 ].description.length ).toBeGreaterThan( 0 );

		expect( fields[ 1 ] ).toMatchObject( {
			name: 'blocks',
			type: 'array',
			required: true,
		} );
		expect( fields[ 1 ].description ).toContain( 'block tree' );

		expect( fields[ 2 ] ).toMatchObject( {
			name: 'mentions',
			type: 'array',
			required: false,
		} );
		expect( fields[ 2 ].description.length ).toBeGreaterThan( 0 );
	} );
} );
