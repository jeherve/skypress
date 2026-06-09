import { describe, expect, it } from 'vitest';
import { editLinkFor, editRkeyFromSearch } from './edit-link';

describe( 'editLinkFor', () => {
	it( 'builds the editor edit URL for an rkey', () => {
		expect( editLinkFor( '3kabc123' ) ).toBe( '/editor?edit=3kabc123' );
	} );
} );

describe( 'editRkeyFromSearch', () => {
	it( 'reads the rkey from the edit param', () => {
		expect( editRkeyFromSearch( '?edit=3kabc123' ) ).toBe( '3kabc123' );
	} );

	it( 'returns null when the param is absent', () => {
		expect( editRkeyFromSearch( '?foo=bar' ) ).toBeNull();
		expect( editRkeyFromSearch( '' ) ).toBeNull();
	} );

	it( 'returns null when the param is present but empty', () => {
		expect( editRkeyFromSearch( '?edit=' ) ).toBeNull();
	} );
} );
