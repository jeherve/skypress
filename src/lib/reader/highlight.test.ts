import { describe, expect, it } from 'vitest';
import { highlightCodeBlocks, highlightJson } from './highlight';

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

	it( 'converts <br> line breaks in code to real newlines (never literal tag text)', () => {
		// Some stored code blocks use <br /> as the line separator (render.ts passes it
		// through; the sanitiser keeps it as a real break). Highlighting must tokenise
		// clean multi-line source, not turn the breaks into literal "<br>" text.
		const out = highlightCodeBlocks(
			block( '{<br />  "name": "potato",<br />  "value": 42<br />}' )
		);
		expect( out ).not.toContain( '<br' );  // no raw <br> passed through to hljs
		expect( out ).not.toContain( '&lt;' ); // and not escaped into literal "<br>" text
		expect( out ).toContain( '\n' );       // line breaks preserved as real newlines
		expect( out ).toContain( 'class="hljs' ); // still highlighted
	} );

	it( 'keeps a literal <br> typed in a code sample as text, not a newline', () => {
		// A literal `<br>` in a code sample is stored escaped (`&lt;br&gt;`), unlike the
		// real break tags above. It must survive as escaped tag text after highlighting,
		// not be collapsed into a newline along with the genuine separators.
		const out = highlightCodeBlocks( block( 'const html = "&lt;br&gt;";' ) );
		expect( out ).toContain( '&lt;br&gt;' ); // literal example tag preserved as text
		expect( out ).not.toContain( '\n' );     // not turned into a line break
		expect( out ).toContain( 'class="hljs' ); // still highlighted
	} );
} );

describe( 'highlightJson', () => {
	it( 'tokenises JSON into hljs spans inside a language-json code element', () => {
		const out = highlightJson( '{\n  "answer": 42\n}' );
		expect( out ).toContain( '<code class="hljs language-json">' );
		expect( out ).toContain( '<span class="hljs-' );
		expect( out ).toContain( '</code>' );
		// No <pre> wrapper — the caller owns the chrome.
		expect( out ).not.toContain( '<pre' );
	} );

	it( 'keeps HTML in string values escaped (no raw tags from untrusted records)', () => {
		const out = highlightJson( '{\n  "x": "</script><img src=x onerror=alert(1)>"\n}' );
		expect( out ).toContain( '&lt;' );
		expect( out ).not.toContain( '<img' );
		expect( out ).not.toContain( '</script>' );
	} );

	it( 'handles an empty object without throwing', () => {
		const out = highlightJson( '{}' );
		expect( out ).toContain( '<code class="hljs language-json">' );
		expect( out ).toContain( '</code>' );
	} );
} );
