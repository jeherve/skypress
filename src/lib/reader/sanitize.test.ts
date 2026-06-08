import { describe, expect, it } from 'vitest';
import { sanitizeArticleHtml } from './sanitize';

describe( 'sanitizeArticleHtml', () => {
	it( 'strips <script> and inline event handlers (untrusted PDS content)', () => {
		const dirty = '<p>Hi</p><script>alert(1)</script><img src="x" onerror="alert(2)">';
		const clean = sanitizeArticleHtml( dirty );
		expect( clean ).toContain( '<p>Hi</p>' );
		expect( clean ).not.toContain( '<script' );
		expect( clean ).not.toContain( 'onerror' );
		expect( clean ).not.toContain( 'alert(2)' );
	} );

	it( 'drops javascript: URLs but keeps safe links + images', () => {
		const dirty =
			'<a href="javascript:alert(1)">x</a><a href="https://ok.example">ok</a><img src="https://cdn.example/a.png" alt="a">';
		const clean = sanitizeArticleHtml( dirty );
		expect( clean ).not.toContain( 'javascript:' );
		expect( clean ).toContain( 'href="https://ok.example"' );
		expect( clean ).toContain( '<img' );
		expect( clean ).toContain( 'src="https://cdn.example/a.png"' );
	} );

	it( 'preserves the curated blocks’ tags + classes', () => {
		const html =
			'<h2 class="wp-block-heading">T</h2><pre class="wp-block-code"><code>x</code></pre><blockquote class="wp-block-quote"><p>q</p></blockquote>';
		const clean = sanitizeArticleHtml( html );
		expect( clean ).toContain( '<h2 class="wp-block-heading">' );
		expect( clean ).toContain( '<pre class="wp-block-code">' );
		expect( clean ).toContain( '<blockquote class="wp-block-quote">' );
	} );

	it( 'hardens external links with rel + target', () => {
		const clean = sanitizeArticleHtml( '<a href="https://x.example">x</a>' );
		expect( clean ).toContain( 'rel="noopener noreferrer nofollow ugc"' );
		expect( clean ).toContain( 'target="_blank"' );
	} );
} );
