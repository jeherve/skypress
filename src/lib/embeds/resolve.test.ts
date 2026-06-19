// src/lib/embeds/resolve.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fetchAtprotoCard, fetchVideoCard, resolveEmbeds } from './resolve';
import type { EmbedMatch } from './registry';

function jsonResponse( body: unknown, ok = true ): Response {
	return { ok, json: async () => body } as unknown as Response;
}

describe( 'fetchAtprotoCard', () => {
	it( 'resolves a handle authority to a DID, then fetches the post', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce( jsonResponse( { did: 'did:plc:abc' } ) ) // getProfile
			.mockResolvedValueOnce(
				jsonResponse( {
					posts: [
						{
							uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
							author: { handle: 'jeremy.herve.bzh', displayName: 'Jeremy', avatar: 'https://cdn/av.jpg' },
							record: { text: 'Hi there', createdAt: '2026-06-19T10:00:00Z' },
							embed: {
								$type: 'app.bsky.embed.images#view',
								images: [ { fullsize: 'https://cdn/i.jpg', alt: 'pic' } ],
							},
						},
					],
				} )
			);

		const match: EmbedMatch = { kind: 'atproto', id: 'jeremy.herve.bzh/xyz' };
		const card = await fetchAtprotoCard( match, fetchImpl );

		expect( fetchImpl.mock.calls[ 0 ][ 0 ] ).toContain( 'app.bsky.actor.getProfile?actor=jeremy.herve.bzh' );
		expect( fetchImpl.mock.calls[ 1 ][ 0 ] ).toContain(
			'getPosts?uris=at%3A%2F%2Fdid%3Aplc%3Aabc%2Fapp.bsky.feed.post%2Fxyz'
		);
		expect( card ).toMatchObject( {
			kind: 'atproto',
			authorName: 'Jeremy',
			handle: 'jeremy.herve.bzh',
			text: 'Hi there',
			images: [ { src: 'https://cdn/i.jpg', alt: 'pic' } ],
			viewUrl: 'https://mu.social/profile/did:plc:abc/post/xyz',
		} );
	} );

	it( 'reads images from a recordWithMedia quote-post embed', async () => {
		const fetchImpl = vi.fn().mockResolvedValueOnce(
			jsonResponse( {
				posts: [
					{
						uri: 'at://did:plc:abc/app.bsky.feed.post/xyz',
						author: { handle: 'a.bsky.social' },
						record: { text: 'quoting' },
						embed: {
							$type: 'app.bsky.embed.recordWithMedia#view',
							media: {
								$type: 'app.bsky.embed.images#view',
								images: [ { fullsize: 'https://cdn/q.jpg', alt: 'quoted pic' } ],
							},
						},
					},
				],
			} )
		);
		const card = await fetchAtprotoCard( { kind: 'atproto', id: 'did:plc:abc/xyz' }, fetchImpl );
		expect( card?.images ).toEqual( [ { src: 'https://cdn/q.jpg', alt: 'quoted pic' } ] );
	} );

	it( 'skips profile resolution when the authority is already a DID', async () => {
		const fetchImpl = vi.fn().mockResolvedValueOnce(
			jsonResponse( {
				posts: [ { uri: 'at://did:plc:abc/app.bsky.feed.post/xyz', author: { handle: 'a.bsky.social' }, record: { text: 't' } } ],
			} )
		);
		await fetchAtprotoCard( { kind: 'atproto', id: 'did:plc:abc/xyz' }, fetchImpl );
		expect( fetchImpl ).toHaveBeenCalledTimes( 1 );
		expect( fetchImpl.mock.calls[ 0 ][ 0 ] ).toContain( 'getPosts' );
	} );

	it( 'returns null when the post is missing', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( jsonResponse( { posts: [] } ) );
		expect( await fetchAtprotoCard( { kind: 'atproto', id: 'did:plc:abc/xyz' }, fetchImpl ) ).toBeNull();
	} );

	it( 'returns null on a thrown fetch', async () => {
		const fetchImpl = vi.fn().mockRejectedValue( new Error( 'network' ) );
		expect( await fetchAtprotoCard( { kind: 'atproto', id: 'did:plc:abc/xyz' }, fetchImpl ) ).toBeNull();
	} );
} );

describe( 'fetchVideoCard', () => {
	it( 'reads title + thumbnail from youtube oEmbed', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse( { title: 'Cool', thumbnail_url: 'https://i.ytimg/x.jpg' } )
		);
		const card = await fetchVideoCard( { kind: 'youtube', id: 'dQw4w9WgXcQ' }, fetchImpl );
		expect( card ).toEqual( {
			kind: 'youtube',
			id: 'dQw4w9WgXcQ',
			title: 'Cool',
			thumbnail: 'https://i.ytimg/x.jpg',
			url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		} );
	} );

	it( 'returns null on oEmbed failure', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( jsonResponse( {}, false ) );
		expect( await fetchVideoCard( { kind: 'vimeo', id: '1' }, fetchImpl ) ).toBeNull();
	} );
} );

describe( 'resolveEmbeds', () => {
	const blocks = [
		{ name: 'core/paragraph', attributes: { content: 'hello' } },
		{ name: 'core/embed', attributes: { url: 'https://vimeo.com/123' } },
	];

	it( 'attaches resolved data onto recognised core/embed nodes', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( jsonResponse( { title: 'V', thumbnail_url: 'https://t/x.jpg' } ) );
		const out = await resolveEmbeds( blocks, { fetchImpl } );
		expect( out[ 0 ].attributes ).not.toHaveProperty( '_skypressEmbed' );
		expect( out[ 1 ].attributes?._skypressEmbed ).toMatchObject( { kind: 'vimeo', title: 'V' } );
	} );

	it( 'leaves unrecognised embeds and other blocks untouched', async () => {
		const fetchImpl = vi.fn();
		const out = await resolveEmbeds(
			[ { name: 'core/embed', attributes: { url: 'https://example.com/x' } } ],
			{ fetchImpl }
		);
		expect( fetchImpl ).not.toHaveBeenCalled();
		expect( out[ 0 ].attributes ).not.toHaveProperty( '_skypressEmbed' );
	} );

	it( 'honours the `only` filter (RSS resolves atproto, not video)', async () => {
		const fetchImpl = vi.fn();
		const out = await resolveEmbeds( blocks, { only: [ 'atproto' ], fetchImpl } );
		expect( fetchImpl ).not.toHaveBeenCalled();
		expect( out[ 1 ].attributes ).not.toHaveProperty( '_skypressEmbed' );
	} );
} );
