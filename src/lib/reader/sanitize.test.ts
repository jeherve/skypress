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

	it( 'keeps a mention link (class + href) but strips its data-did', () => {
		const dirty =
			'<p>Hi <a class="skypress-mention" href="https://bsky.app/profile/alice.bsky.social" data-did="did:plc:alice">@alice.bsky.social</a></p>';
		const clean = sanitizeArticleHtml( dirty );
		expect( clean ).toContain( 'class="skypress-mention"' );
		expect( clean ).toContain( 'href="https://bsky.app/profile/alice.bsky.social"' );
		expect( clean ).not.toContain( 'data-did' );
		expect( clean ).toContain( '@alice.bsky.social' );
	} );
} );

describe( 'embed cards', () => {
	it( 'keeps the atproto card structure', () => {
		const html = sanitizeArticleHtml(
			'<figure class="wp-block-embed skypress-embed skypress-embed--atproto"><a class="skypress-embed__link" href="https://mu.social/profile/x/post/y"><span class="skypress-embed__text">hi</span></a></figure>'
		);
		expect( html ).toContain( 'skypress-embed--atproto' );
		expect( html ).toContain( 'href="https://mu.social/profile/x/post/y"' );
	} );

	it( 'keeps the video facade button + scoped data attributes', () => {
		const html = sanitizeArticleHtml(
			'<figure class="wp-block-embed skypress-embed skypress-embed--video"><button type="button" class="skypress-embed__play" data-embed-provider="youtube" data-embed-id="dQw4w9WgXcQ"><img class="skypress-embed__thumb" src="https://i/x.jpg" alt=""/></button></figure>'
		);
		expect( html ).toContain( '<button' );
		expect( html ).toContain( 'data-embed-provider="youtube"' );
		expect( html ).toContain( 'data-embed-id="dQw4w9WgXcQ"' );
	} );

	it( 'still strips a document-injected iframe', () => {
		const html = sanitizeArticleHtml( '<p>x</p><iframe src="https://evil.com"></iframe>' );
		expect( html ).not.toContain( '<iframe' );
	} );

	it( 'strips data attributes on non-button elements and onclick handlers', () => {
		const html = sanitizeArticleHtml(
			'<span data-embed-id="x" onclick="alert(1)">t</span>'
		);
		expect( html ).not.toContain( 'data-embed-id' );
		expect( html ).not.toContain( 'onclick' );
	} );
} );
