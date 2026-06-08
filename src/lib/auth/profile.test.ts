import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import { fetchViewerProfile } from './profile';

/** Minimal Agent stub: only getProfile is exercised. */
function agentReturning( data: Record< string, unknown > ): Agent {
	return { getProfile: vi.fn().mockResolvedValue( { data } ) } as unknown as Agent;
}
function agentThrowing(): Agent {
	return { getProfile: vi.fn().mockRejectedValue( new Error( 'appview down' ) ) } as unknown as Agent;
}

describe( 'fetchViewerProfile', () => {
	it( 'maps did, handle, displayName and avatar from getProfile', async () => {
		const agent = agentReturning( {
			did: 'did:plc:abc',
			handle: 'jane.bsky.social',
			displayName: 'Jane Rivera',
			avatar: 'https://cdn.example/av.jpg',
		} );
		const profile = await fetchViewerProfile( agent, 'did:plc:abc' );
		expect( profile ).toEqual( {
			did: 'did:plc:abc',
			handle: 'jane.bsky.social',
			displayName: 'Jane Rivera',
			avatar: 'https://cdn.example/av.jpg',
		} );
	} );

	it( 'falls back to nulls but keeps the did when getProfile throws', async () => {
		const profile = await fetchViewerProfile( agentThrowing(), 'did:plc:abc' );
		expect( profile ).toEqual( {
			did: 'did:plc:abc',
			handle: null,
			displayName: null,
			avatar: null,
		} );
	} );

	it( 'coerces missing optional fields to null', async () => {
		const agent = agentReturning( { did: 'did:plc:abc', handle: 'jane.bsky.social' } );
		const profile = await fetchViewerProfile( agent, 'did:plc:abc' );
		expect( profile.displayName ).toBeNull();
		expect( profile.avatar ).toBeNull();
		expect( profile.handle ).toBe( 'jane.bsky.social' );
	} );
} );
