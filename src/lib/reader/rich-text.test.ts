import { describe, expect, it } from 'vitest';
import { detectBioSegments, safeHttpHref } from './rich-text';

describe( 'detectBioSegments', () => {
	it( 'returns a single text segment for plain prose', () => {
		expect( detectBioSegments( 'Just a writer.' ) ).toEqual( [
			{ type: 'text', text: 'Just a writer.' },
		] );
	} );

	it( 'returns an empty array for blank input', () => {
		expect( detectBioSegments( '   ' ) ).toEqual( [] );
	} );

	it( 'linkifies a full URL and keeps trailing punctuation out of the link', () => {
		expect( detectBioSegments( 'Visit https://example.com.' ) ).toEqual( [
			{ type: 'text', text: 'Visit ' },
			{ type: 'link', text: 'https://example.com', href: 'https://example.com' },
			{ type: 'text', text: '.' },
		] );
	} );

	it( 'linkifies a bare domain with an https href and bare display text', () => {
		expect( detectBioSegments( 'example.com' ) ).toEqual( [
			{ type: 'link', text: 'example.com', href: 'https://example.com' },
		] );
	} );

	it( 'links a mention to its Bluesky profile by handle', () => {
		expect( detectBioSegments( 'hi @alice.bsky.social' ) ).toEqual( [
			{ type: 'text', text: 'hi ' },
			{
				type: 'link',
				text: '@alice.bsky.social',
				href: 'https://bsky.app/profile/alice.bsky.social',
			},
		] );
	} );

	it( 'links a hashtag to its Bluesky hashtag page', () => {
		expect( detectBioSegments( 'love #design' ) ).toEqual( [
			{ type: 'text', text: 'love ' },
			{ type: 'link', text: '#design', href: 'https://bsky.app/hashtag/design' },
		] );
	} );

	it( 'orders mixed text, url, mention and tag segments correctly', () => {
		expect(
			detectBioSegments( 'me @alice.bsky.social #design example.com' )
		).toEqual( [
			{ type: 'text', text: 'me ' },
			{
				type: 'link',
				text: '@alice.bsky.social',
				href: 'https://bsky.app/profile/alice.bsky.social',
			},
			{ type: 'text', text: ' ' },
			{ type: 'link', text: '#design', href: 'https://bsky.app/hashtag/design' },
			{ type: 'text', text: ' ' },
			{ type: 'link', text: 'example.com', href: 'https://example.com' },
		] );
	} );
} );

describe( 'safeHttpHref', () => {
	it( 'passes http and https through unchanged', () => {
		expect( safeHttpHref( 'https://example.com' ) ).toBe( 'https://example.com' );
		expect( safeHttpHref( 'http://example.com/x' ) ).toBe( 'http://example.com/x' );
	} );

	it( 'rejects non-http(s) schemes and garbage', () => {
		expect( safeHttpHref( 'javascript:alert(1)' ) ).toBeNull();
		expect( safeHttpHref( 'ftp://example.com' ) ).toBeNull();
		expect( safeHttpHref( 'not a url' ) ).toBeNull();
	} );
} );
