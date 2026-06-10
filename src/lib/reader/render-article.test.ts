import { describe, expect, it } from 'vitest';
import { renderArticle } from './render-article';

const AUTHOR = { pdsUrl: 'https://pds.example', did: 'did:plc:alice' };

describe( 'renderArticle', () => {
	it( 'renders block content to HTML', () => {
		const { html } = renderArticle(
			{
				content: {
					blocks: [
						{ name: 'core/heading', attributes: { level: 2, content: 'Section' } },
						{ name: 'core/paragraph', attributes: { content: 'A paragraph.' } },
					],
				},
			},
			AUTHOR
		);
		expect( html ).toContain( '<h2 class="wp-block-heading">Section</h2>' );
		expect( html ).toContain( '<p>A paragraph.</p>' );
	} );

	it( 'never lets a script in block content survive (sanitise is the last step)', () => {
		const { html } = renderArticle(
			{
				content: {
					blocks: [
						{
							name: 'core/paragraph',
							attributes: { content: 'Hello <script>alert(1)</script>world' },
						},
					],
				},
			},
			AUTHOR
		);
		expect( html ).not.toContain( '<script' );
		expect( html ).not.toContain( 'alert(1)' );
		expect( html ).toContain( 'Hello' );
	} );

	it( 'strips event-handler attributes smuggled through rich text', () => {
		const { html } = renderArticle(
			{
				content: {
					blocks: [
						{
							name: 'core/paragraph',
							attributes: { content: '<em onmouseover="steal()">hover me</em>' },
						},
					],
				},
			},
			AUTHOR
		);
		expect( html ).toContain( '<em>hover me</em>' );
		expect( html ).not.toContain( 'onmouseover' );
	} );

	it( 'rewrites blob-backed image URLs to the author PDS before rendering', () => {
		const { html } = renderArticle(
			{
				content: {
					blocks: [
						{
							name: 'core/image',
							attributes: {
								url: 'https://stale-pds.example/old-blob.png',
								alt: 'A photo',
								skypressBlob: {
									$type: 'blob',
									ref: { $link: 'bafyreidcid' },
									mimeType: 'image/png',
									size: 1234,
								},
							},
						},
					],
				},
			},
			AUTHOR
		);
		// `&amp;` (not `&`) — the URL came out the far side of the sanitiser.
		expect( html ).toContain(
			'src="https://pds.example/xrpc/com.atproto.sync.getBlob?did=did%3Aplc%3Aalice&amp;cid=bafyreidcid"'
		);
		expect( html ).not.toContain( 'stale-pds.example' );
	} );

	it( 'prefers the stored textContent for the plain-text view', () => {
		const { text } = renderArticle(
			{
				textContent: 'Stored summary.',
				content: {
					blocks: [ { name: 'core/paragraph', attributes: { content: 'Body.' } } ],
				},
			},
			AUTHOR
		);
		expect( text ).toBe( 'Stored summary.' );
	} );

	it( 'falls back to the block text when textContent is absent or empty', () => {
		const { text } = renderArticle(
			{
				textContent: '',
				content: {
					blocks: [
						{ name: 'core/heading', attributes: { level: 2, content: 'Section' } },
						{ name: 'core/paragraph', attributes: { content: 'Body text.' } },
					],
				},
			},
			AUTHOR
		);
		expect( text ).toBe( 'Section\n\nBody text.' );
	} );

	it( 'returns empty html and text for a document with no blocks', () => {
		const { html, text } = renderArticle( {}, AUTHOR );
		expect( html ).toBe( '' );
		expect( text ).toBe( '' );
	} );
} );
