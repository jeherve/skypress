import { describe, expect, it } from 'vitest';
import { parseInlineCode } from './inline-code';

describe( 'parseInlineCode', () => {
	it( 'splits a string into text and code segments', () => {
		expect( parseInlineCode( 'fall back to `textContent` always' ) ).toEqual( [
			{ text: 'fall back to ', code: false },
			{ text: 'textContent', code: true },
			{ text: ' always', code: false },
		] );
	} );

	it( 'handles a code span at the start and end', () => {
		expect( parseInlineCode( '`a` and `b`' ) ).toEqual( [
			{ text: 'a', code: true },
			{ text: ' and ', code: false },
			{ text: 'b', code: true },
		] );
	} );

	it( 'returns a single text segment when there are no backticks', () => {
		expect( parseInlineCode( 'plain text' ) ).toEqual( [
			{ text: 'plain text', code: false },
		] );
	} );
} );
