import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Agent } from '@atproto/api';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

// Mock the orchestration layer so we control whether the companion post "exists".
const { fetchPostState, fetchPostExists } = vi.hoisted( () => ( {
	fetchPostState: vi.fn(),
	fetchPostExists: vi.fn(),
} ) );
vi.mock( '../lib/social/interactions', () => ( { fetchPostState, fetchPostExists } ) );

import { ActionsGate } from './PostActions';
import { AuthContext, type AuthContextValue } from '../lib/auth/AuthProvider';

const PROPS = {
	postUri: 'at://did:plc:writer/app.bsky.feed.post/3kpost',
	postCid: 'bafypost',
	authorDid: 'did:plc:writer',
};

function authValue( overrides: Partial< AuthContextValue > ): AuthContextValue {
	return {
		status: 'signed-out',
		agent: null,
		did: null,
		handle: null,
		displayName: null,
		avatar: null,
		pdsUrl: null,
		error: null,
		signIn: async () => {},
		signOut: async () => {},
		...overrides,
	};
}

/** Mount ActionsGate under a hand-rolled auth context and flush its effects. */
async function mountGate( auth: Partial< AuthContextValue > ): Promise< { html: string; cleanup: () => void } > {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	await act( async () => {
		root.render(
			createElement(
				AuthContext.Provider,
				{ value: authValue( auth ) },
				createElement( ActionsGate, PROPS )
			)
		);
	} );
	return {
		html: container.innerHTML,
		cleanup: () => {
			act( () => {
				root.unmount();
			} );
			container.remove();
		},
	};
}

beforeEach( () => {
	fetchPostState.mockReset();
	fetchPostExists.mockReset();
} );

describe( 'PostActions presence gate', () => {
	it( 'renders nothing when the companion post is gone (signed in)', async () => {
		fetchPostState.mockResolvedValue( null ); // getPosts found no post
		const { html, cleanup } = await mountGate( {
			status: 'signed-in',
			agent: {} as Agent,
			did: 'did:plc:reader',
			handle: 'reader.test',
		} );
		expect( html ).toBe( '' );
		cleanup();
	} );

	it( 'renders nothing when the companion post is gone (signed out)', async () => {
		fetchPostExists.mockResolvedValue( false ); // public AppView says: deleted
		const { html, cleanup } = await mountGate( { status: 'signed-out' } );
		expect( html ).toBe( '' );
		cleanup();
	} );

	it( 'keeps the action bar when the post exists (signed in)', async () => {
		fetchPostState.mockResolvedValue( {
			likeCount: 0,
			repostCount: 0,
			replyCount: 0,
			viewerLikeUri: null,
			viewerRepostUri: null,
		} );
		const { html, cleanup } = await mountGate( {
			status: 'signed-in',
			agent: {} as Agent,
			did: 'did:plc:reader',
			handle: 'reader.test',
		} );
		expect( html ).toContain( 'Like' );
		expect( html ).toContain( 'Reply' );
		cleanup();
	} );

	it( 'keeps the sign-in prompt when the post exists (signed out)', async () => {
		fetchPostExists.mockResolvedValue( true );
		const { html, cleanup } = await mountGate( { status: 'signed-out' } );
		expect( html ).toContain( 'Sign in to react' );
		cleanup();
	} );

	it( 'keeps the action bar when existence is undetermined (signed out, network error → fail open)', async () => {
		fetchPostExists.mockResolvedValue( null );
		const { html, cleanup } = await mountGate( { status: 'signed-out' } );
		expect( html ).toContain( 'Sign in to react' );
		cleanup();
	} );
} );
