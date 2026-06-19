// src/lib/embeds/card.test.ts
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEmbedCard } from './card';

describe( 'escapeHtml', () => {
	it( 'escapes the HTML metacharacters', () => {
		expect( escapeHtml( `<img src=x onerror="alert(1)"> & "q" 'a'` ) ).toBe(
			'&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;q&quot; &#39;a&#39;'
		);
	} );
} );

describe( 'renderEmbedCard — atproto', () => {
	const data = {
		kind: 'atproto' as const,
		authorName: 'Jeremy',
		handle: 'jeremy.herve.bzh',
		avatar: 'https://cdn.example/av.jpg',
		text: 'Hello <script>alert(1)</script> world',
		images: [ { src: 'https://cdn.example/i.jpg', alt: 'a "nice" pic' } ],
		createdAt: '2026-06-19T10:00:00.000Z',
		viewUrl: 'https://mu.social/profile/did:plc:x/post/abc',
	};

	it( 'renders a static card with escaped post text', () => {
		const html = renderEmbedCard( data );
		expect( html ).toContain( 'class="wp-block-embed skypress-embed skypress-embed--atproto"' );
		expect( html ).toContain( 'Hello &lt;script&gt;alert(1)&lt;/script&gt; world' );
		expect( html ).not.toContain( '<script>' );
		expect( html ).toContain( 'href="https://mu.social/profile/did:plc:x/post/abc"' );
		expect( html ).toContain( '@jeremy.herve.bzh' );
	} );

	it( 'escapes hostile image alt text', () => {
		expect( renderEmbedCard( data ) ).toContain( 'alt="a &quot;nice&quot; pic"' );
	} );

	it( 'contains no iframe', () => {
		expect( renderEmbedCard( data ) ).not.toContain( '<iframe' );
	} );
} );

describe( 'renderEmbedCard — video facade', () => {
	const data = {
		kind: 'youtube' as const,
		id: 'dQw4w9WgXcQ',
		title: 'Cool <b>video</b>',
		thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
		url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	};

	it( 'renders a facade with a play button and data attributes, no iframe', () => {
		const html = renderEmbedCard( data );
		expect( html ).toContain( 'skypress-embed--video' );
		expect( html ).toContain( 'data-embed-provider="youtube"' );
		expect( html ).toContain( 'data-embed-id="dQw4w9WgXcQ"' );
		expect( html ).toContain( '<button' );
		expect( html ).toContain( 'Cool &lt;b&gt;video&lt;/b&gt;' );
		expect( html ).not.toContain( '<iframe' );
	} );
} );

describe( 'renderEmbedCard — URL scheme guard', () => {
	it( 'neutralizes a javascript: viewUrl on an atproto card', () => {
		const html = renderEmbedCard( {
			kind: 'atproto',
			authorName: 'Jeremy',
			handle: 'jeremy.herve.bzh',
			text: 'hi',
			images: [],
			viewUrl: 'javascript:alert(1)',
		} );
		expect( html ).not.toContain( 'href="javascript:alert(1)"' );
		expect( html ).not.toContain( 'javascript:' );
		expect( html ).toContain( 'href=""' );
	} );

	it( 'neutralizes a javascript: url in the video fallback href', () => {
		const html = renderEmbedCard( {
			kind: 'youtube',
			id: 'dQw4w9WgXcQ',
			title: 'x',
			thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
			url: 'javascript:alert(1)',
		} );
		expect( html ).not.toContain( 'href="javascript:alert(1)"' );
		expect( html ).not.toContain( 'javascript:' );
		expect( html ).toContain( 'href=""' );
	} );

	it( 'leaves a valid https url untouched in the href', () => {
		const html = renderEmbedCard( {
			kind: 'atproto',
			authorName: 'Jeremy',
			handle: 'jeremy.herve.bzh',
			text: 'hi',
			images: [],
			viewUrl: 'https://mu.social/profile/did:plc:x/post/abc',
		} );
		expect( html ).toContain( 'href="https://mu.social/profile/did:plc:x/post/abc"' );
	} );
} );
