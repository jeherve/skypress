import { describe, expect, it } from 'vitest';
import { renderRecordJson } from './record-json';

describe( 'renderRecordJson', () => {
	it( 'pretty-prints the value with two-space indentation and highlights it', () => {
		const out = renderRecordJson( { title: 'Hello', tags: [ 'a' ] } );
		// Two-space indentation survives into the highlighted markup.
		expect( out ).toContain( '\n  ' );
		expect( out ).toContain( '<code class="hljs language-json">' );
		expect( out ).toContain( 'hljs-' );
	} );

	it( 'highlights then sanitises — a hostile string value yields no raw tags', () => {
		const out = renderRecordJson( { x: '<img src=x onerror=alert(1)>' } );
		// The angle brackets are escaped to text; no live <img> survives.
		expect( out ).not.toContain( '<img' );
		expect( out ).toContain( '&lt;img' );
		// The sanitiser keeps the highlight markup (code/span/class are allowlisted).
		expect( out ).toContain( 'hljs' );
	} );
} );
