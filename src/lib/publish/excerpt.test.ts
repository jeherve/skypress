import { describe, expect, it } from 'vitest';
import { deriveExcerpt } from './excerpt';

describe( 'deriveExcerpt', () => {
	it( 'returns empty string for empty or whitespace-only input', () => {
		expect( deriveExcerpt( '' ) ).toBe( '' );
		expect( deriveExcerpt( '   \n\t ' ) ).toBe( '' );
	} );

	it( 'returns short text unchanged, with no ellipsis', () => {
		expect( deriveExcerpt( 'A short lede.' ) ).toBe( 'A short lede.' );
	} );

	it( 'collapses internal whitespace and newlines to single spaces', () => {
		expect( deriveExcerpt( 'one\n\ntwo   three' ) ).toBe( 'one two three' );
	} );

	it( 'truncates long text on a word boundary with a trailing ellipsis', () => {
		const long = 'word '.repeat( 100 ).trim(); // 499 chars, all word boundaries
		const result = deriveExcerpt( long );
		expect( result.endsWith( '…' ) ).toBe( true );
		// Body (sans ellipsis) stays within the limit and never splits a word.
		const body = result.slice( 0, -1 );
		expect( body.length ).toBeLessThanOrEqual( 200 );
		expect( body.endsWith( 'word' ) ).toBe( true );
		expect( body.endsWith( ' ' ) ).toBe( false );
	} );

	it( 'honours a custom maxChars and cuts at the last space within it', () => {
		expect( deriveExcerpt( 'alpha beta gamma', 10 ) ).toBe( 'alpha…' );
	} );

	it( 'truncates an unsplittable token at maxChars with an ellipsis', () => {
		const result = deriveExcerpt( 'x'.repeat( 300 ) );
		expect( result ).toBe( `${ 'x'.repeat( 200 ) }…` );
	} );
} );
