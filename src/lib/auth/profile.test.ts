import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import { fetchViewerProfile, displayNameFor, authorPath, accountMenuItems } from './profile';

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
			did: 'did:plc:ignored',
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

describe( 'displayNameFor', () => {
	const base = { did: 'did:plc:abc', handle: 'jane.bsky.social', avatar: null };
	it( 'prefers displayName', () => {
		expect( displayNameFor( { ...base, displayName: 'Jane Rivera' } ) ).toBe( 'Jane Rivera' );
	} );
	it( 'falls back to handle when displayName is null', () => {
		expect( displayNameFor( { ...base, displayName: null } ) ).toBe( 'jane.bsky.social' );
	} );
	it( 'falls back to the did when handle and displayName are null', () => {
		expect(
			displayNameFor( { did: 'did:plc:abc', handle: null, displayName: null, avatar: null } )
		).toBe( 'did:plc:abc' );
	} );
} );

describe( 'authorPath', () => {
	it( 'builds the public page path for a handle', () => {
		expect( authorPath( 'jane.bsky.social' ) ).toBe( '/@jane.bsky.social' );
	} );
	it( 'returns null when there is no handle', () => {
		expect( authorPath( null ) ).toBeNull();
	} );
} );

describe( 'accountMenuItems', () => {
	const base = { did: 'did:plc:abc', displayName: 'Jane Rivera', avatar: null };

	it( 'returns Dashboard, Write and Profile in order for a profile with a handle', () => {
		expect( accountMenuItems( { ...base, handle: 'jane.bsky.social' } ) ).toEqual( [
			{ label: 'Dashboard', href: '/dashboard' },
			{ label: 'Write', href: '/editor' },
			{ label: 'Profile', href: '/@jane.bsky.social' },
		] );
	} );

	it( 'omits the Profile item when no handle is known', () => {
		expect( accountMenuItems( { ...base, handle: null } ) ).toEqual( [
			{ label: 'Dashboard', href: '/dashboard' },
			{ label: 'Write', href: '/editor' },
		] );
	} );
} );
