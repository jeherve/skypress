import { describe, expect, it } from 'vitest';
import { highlightCodeBlocks } from './highlight';

const block = ( inner: string ) =>
	`<pre class="wp-block-code"><code>${ inner }</code></pre>`;

describe( 'highlightCodeBlocks', () => {
	it( 'tokenises a detected language into hljs spans', () => {
		// A clearly-JavaScript snippet; auto-detect should produce tokens.
		const out = highlightCodeBlocks( block( 'const answer = 42;' ) );
		expect( out ).toContain( 'class="hljs' );
		expect( out ).toContain( '<span class="hljs-' );
		// Still a single wp-block-code pre.
		expect( out ).toContain( '<pre class="wp-block-code"><code class="hljs' );
		expect( out ).toContain( '</code></pre>' );
	} );

	it( 'keeps escaped angle brackets escaped (no raw HTML injected)', () => {
		// render.ts stores code entity-escaped; markup must never be un-escaped into live tags.
		const out = highlightCodeBlocks( block( '&lt;div class="x"&gt;hi&lt;/div&gt;' ) );
		expect( out ).toContain( '&lt;' );
		expect( out ).not.toContain( '<div class="x">' );
	} );

	it( 'leaves inline <code> (not in a wp-block-code pre) untouched', () => {
		const html = '<p>Use <code>npm run dev</code> to start.</p>';
		expect( highlightCodeBlocks( html ) ).toBe( html );
	} );

	it( 'leaves non-code HTML untouched', () => {
		const html = '<h2 class="wp-block-heading">Title</h2><p>Body.</p>';
		expect( highlightCodeBlocks( html ) ).toBe( html );
	} );

	it( 'falls back to a plain wp-block-code block when nothing is highlightable', () => {
		// Empty content can yield zero-relevance auto-detect; must not throw or corrupt markup.
		const out = highlightCodeBlocks( block( '' ) );
		expect( out ).toContain( '<pre class="wp-block-code">' );
		expect( out ).toContain( '</code></pre>' );
		expect( out ).not.toContain( 'hljs' );
		expect( out ).toContain( '<pre class="wp-block-code"><code></code></pre>' );
	} );

	it( 'highlights every block when there are several', () => {
		const out = highlightCodeBlocks(
			block( 'const a = 1;' ) + '<p>mid</p>' + block( 'let b = 2;' )
		);
		// One highlighted wrapper per code block (token spans also carry hljs-* classes,
		// so count the <code> wrapper specifically, not every hljs class).
		const wrappers = out.match( /<code class="hljs/g ) ?? [];
		expect( wrappers.length ).toBe( 2 );
		expect( out ).toContain( '<p>mid</p>' );
	} );
} );
