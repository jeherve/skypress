import { describe, expect, it } from 'vitest';
import { graphemeLength } from './grapheme';

describe( 'graphemeLength', () => {
	it( 'counts ASCII characters one-for-one', () => {
		expect( graphemeLength( 'hello' ) ).toBe( 5 );
	} );

	it( 'counts an emoji as a single grapheme', () => {
		// "👍" is 2 UTF-16 code units / 4 UTF-8 bytes but one grapheme.
		expect( graphemeLength( '👍' ) ).toBe( 1 );
	} );

	it( 'counts a multi-codepoint emoji cluster as one grapheme', () => {
		// Family emoji = several codepoints joined by ZWJ, still one grapheme.
		expect( graphemeLength( '👨‍👩‍👧' ) ).toBe( 1 );
	} );

	it( 'returns 0 for the empty string', () => {
		expect( graphemeLength( '' ) ).toBe( 0 );
	} );
} );
