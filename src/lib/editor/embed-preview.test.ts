import { describe, expect, it, vi } from 'vitest';
import { buildEmbedPreview } from './embed-preview';

function jsonResponse( body: unknown, ok = true ): Response {
	return { ok, json: async () => body } as unknown as Response;
}

describe( 'buildEmbedPreview', () => {
	it( 'returns a rich card for an atproto URL', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse( {
				posts: [ { uri: 'at://did:plc:a/app.bsky.feed.post/b', author: { handle: 'a.bsky.social', displayName: 'A' }, record: { text: 'hello' } } ],
			} )
		);
		const preview = await buildEmbedPreview( 'https://bsky.app/profile/did:plc:a/post/b', fetchImpl );
		expect( preview ).toMatchObject( { type: 'rich', provider_name: 'Bluesky' } );
		expect( preview!.html ).toContain( 'skypress-embed--atproto' );
		expect( preview!.html ).toContain( 'hello' );
	} );

	it( 'returns a placeholder for a youtube URL (no network)', async () => {
		const fetchImpl = vi.fn();
		const preview = await buildEmbedPreview( 'https://youtu.be/dQw4w9WgXcQ', fetchImpl );
		expect( fetchImpl ).not.toHaveBeenCalled();
		expect( preview!.html ).toContain( 'renders on your published page' );
		expect( preview!.provider_name ).toBe( 'YouTube' );
	} );

	it( 'returns null for an unrecognised URL', async () => {
		expect( await buildEmbedPreview( 'https://example.com/x', vi.fn() ) ).toBeNull();
	} );
} );
