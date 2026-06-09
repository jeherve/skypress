import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionsGate } from './PostActions';
import { AuthContext, type AuthContextValue } from '../lib/auth/AuthProvider';

const PROPS = { postUri: 'at://did:plc:writer/app.bsky.feed.post/3kpost', postCid: 'bafypost' };

/** Render ActionsGate under a hand-rolled auth context (bypasses real OAuth). */
function renderGate( auth: Partial< AuthContextValue > ): string {
	const value: AuthContextValue = {
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
		...auth,
	};
	return renderToStaticMarkup(
		createElement( AuthContext.Provider, { value }, createElement( ActionsGate, PROPS ) )
	);
}

describe( 'PostActions render branches', () => {
	it( 'shows a loading state while auth initialises', () => {
		expect( renderGate( { status: 'loading' } ) ).toContain( 'Loading actions…' );
	} );

	it( 'prompts sign-in (with the public-actions note) when signed out', () => {
		const markup = renderGate( { status: 'signed-out' } );
		expect( markup ).toContain( 'Sign in to react' );
		expect( markup.toLowerCase() ).toContain( 'public' );
		// Even signed-out, the thread is linkable on Bluesky.
		expect( markup ).toContain( 'bsky.app/profile/did:plc:writer/post/3kpost' );
	} );

	it( 'renders the four actions when signed in', () => {
		const markup = renderGate( {
			status: 'signed-in',
			agent: {} as never,
			did: 'did:plc:reader',
			handle: 'reader.test',
		} );
		expect( markup ).toContain( 'Like' );
		expect( markup ).toContain( 'Repost' );
		expect( markup ).toContain( 'Quote' );
		expect( markup ).toContain( 'Reply' );
		expect( markup.toLowerCase() ).toContain( 'public' );
	} );
} );
