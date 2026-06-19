import { describe, expect, it } from 'vitest';
import { detectEmbed } from './registry';

describe( 'detectEmbed', () => {
	it( 'recognises a bsky.app post URL', () => {
		expect( detectEmbed( 'https://bsky.app/profile/jeremy.herve.bzh/post/3momrv24o4wlj' ) ).toEqual(
			{ kind: 'atproto', id: 'jeremy.herve.bzh/3momrv24o4wlj' }
		);
	} );

	it( 'recognises a mu.social post URL', () => {
		expect( detectEmbed( 'https://mu.social/profile/renderg.host/post/3mokzwgfyck2e' ) ).toEqual(
			{ kind: 'atproto', id: 'renderg.host/3mokzwgfyck2e' }
		);
	} );

	it( 'recognises a DID-based post URL', () => {
		expect( detectEmbed( 'https://bsky.app/profile/did:plc:abc123/post/xyz' ) ).toEqual(
			{ kind: 'atproto', id: 'did:plc:abc123/xyz' }
		);
	} );

	it( 'recognises a raw at:// post URI', () => {
		expect( detectEmbed( 'at://did:plc:abc123/app.bsky.feed.post/xyz' ) ).toEqual(
			{ kind: 'atproto', id: 'did:plc:abc123/xyz' }
		);
	} );

	it( 'recognises youtube watch + youtu.be + nocookie URLs', () => {
		expect( detectEmbed( 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' ) ).toEqual( { kind: 'youtube', id: 'dQw4w9WgXcQ' } );
		expect( detectEmbed( 'https://youtu.be/dQw4w9WgXcQ' ) ).toEqual( { kind: 'youtube', id: 'dQw4w9WgXcQ' } );
	} );

	it( 'recognises a vimeo URL', () => {
		expect( detectEmbed( 'https://vimeo.com/123456789' ) ).toEqual( { kind: 'vimeo', id: '123456789' } );
	} );

	it( 'does NOT match look-alike hosts (dot-boundary safety)', () => {
		expect( detectEmbed( 'https://notbsky.app/profile/a/post/b' ) ).toBeNull();
		expect( detectEmbed( 'https://bsky.app.evil.com/profile/a/post/b' ) ).toBeNull();
		expect( detectEmbed( 'https://evil-youtube.com/watch?v=x' ) ).toBeNull();
	} );

	it( 'returns null for unrelated or malformed URLs', () => {
		expect( detectEmbed( 'https://example.com/article' ) ).toBeNull();
		expect( detectEmbed( 'not a url' ) ).toBeNull();
		expect( detectEmbed( 'https://bsky.app/profile/alice.bsky.social' ) ).toBeNull(); // profile, not a post
	} );
} );
