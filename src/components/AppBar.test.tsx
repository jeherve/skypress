import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AppBar from './AppBar';
import { AuthContext, type AuthContextValue } from '../lib/auth/AuthProvider';
import type { AppBarContext } from '../lib/auth/nav';

/** Render the AppBar under a hand-rolled auth context (bypasses real OAuth). */
function renderBar( current: AppBarContext, auth: Partial< AuthContextValue > ): string {
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
		createElement( AuthContext.Provider, { value }, createElement( AppBar, { current } ) )
	);
}

describe( 'AppBar contextual nav visibility', () => {
	it( 'hides the Publications link on the editor when signed out', () => {
		const markup = renderBar( 'editor', { status: 'signed-out' } );
		expect( markup ).not.toContain( 'Publications' );
		expect( markup ).not.toContain( 'href="/dashboard"' );
	} );

	it( 'hides the Write link on the dashboard when signed out', () => {
		const markup = renderBar( 'dashboard', { status: 'signed-out' } );
		expect( markup ).not.toContain( 'Write' );
		expect( markup ).not.toContain( 'href="/editor"' );
	} );

	it( 'hides the contextual nav while auth is still loading', () => {
		const markup = renderBar( 'editor', { status: 'loading' } );
		expect( markup ).not.toContain( 'Publications' );
	} );

	it( 'shows the Publications link on the editor when signed in', () => {
		const markup = renderBar( 'editor', {
			status: 'signed-in',
			agent: {} as never,
			did: 'did:plc:writer',
			handle: 'writer.test',
		} );
		expect( markup ).toContain( 'Publications' );
		expect( markup ).toContain( 'href="/dashboard"' );
	} );

	it( 'shows the Write link on the dashboard when signed in', () => {
		const markup = renderBar( 'dashboard', {
			status: 'signed-in',
			agent: {} as never,
			did: 'did:plc:writer',
			handle: 'writer.test',
		} );
		expect( markup ).toContain( 'Write' );
		expect( markup ).toContain( 'href="/editor"' );
	} );

	it( 'always shows the SkyPress home link, regardless of auth state', () => {
		expect( renderBar( 'editor', { status: 'signed-out' } ) ).toContain( 'SkyPress home' );
	} );
} );
