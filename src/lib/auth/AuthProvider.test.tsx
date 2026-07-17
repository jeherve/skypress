import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useContext, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext, AuthProvider, type AuthContextValue } from './AuthProvider';
import { takeOAuthReturn } from './oauth-return';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

// A signed-out browser OAuth client whose `signIn` we capture. `init()` resolves with no
// session so the provider settles on 'signed-out' without touching the PDS/profile code.
const oauth = vi.hoisted( () => ( {
	signIn: vi.fn( async () => {} ),
} ) );
vi.mock( './oauth', () => ( {
	createOAuthClient: async () => ( {
		init: async () => null,
		signIn: oauth.signIn,
		revoke: async () => {},
	} ),
} ) );

/** Render the provider and hand back the live context value (incl. `signIn`). */
async function mountProvider() {
	const captured: { value: AuthContextValue | null } = { value: null };
	function Capture( { sink }: { sink: { value: AuthContextValue | null } } ): ReactNode {
		sink.value = useContext( AuthContext );
		return null;
	}
	const container = document.createElement( 'div' );
	const root = createRoot( container );
	await act( async () => {
		root.render( createElement( AuthProvider, null, createElement( Capture, { sink: captured } ) ) );
	} );
	return captured;
}

function setLocation( origin: string, pathname: string, hostname: string ) {
	vi.stubGlobal( 'location', { origin, pathname, hostname } );
}

describe( 'AuthProvider signIn redirect target', () => {
	beforeEach( () => {
		oauth.signIn.mockClear();
		window.localStorage.clear();
	} );
	afterEach( () => {
		vi.unstubAllGlobals();
		window.localStorage.clear();
	} );

	it( 'hosted: returns to the page sign-in started from (/write/, not /editor/)', async () => {
		setLocation( 'https://skypress.blog', '/write/', 'skypress.blog' );
		const ctx = await mountProvider();
		await act( async () => {
			await ctx.value!.signIn( 'alice.bsky.social' );
		} );
		expect( oauth.signIn ).toHaveBeenCalledWith( 'alice.bsky.social', {
			redirect_uri: 'https://skypress.blog/write/',
		} );
	} );

	it( 'loopback (dev): passes no redirect_uri — the per-page loopback client already round-trips', async () => {
		setLocation( 'http://127.0.0.1:4321', '/write', '127.0.0.1' );
		const ctx = await mountProvider();
		await act( async () => {
			await ctx.value!.signIn( 'alice.bsky.social' );
		} );
		// `undefined` options is equivalent to omitting them — the loopback metadata's lone
		// redirect URI is the current page, so atproto comes back here on its own.
		expect( oauth.signIn ).toHaveBeenCalledWith( 'alice.bsky.social', undefined );
	} );

	it( 'hosted + returnTo (off-island page): routes through the static callback and stashes the return path', async () => {
		// The publication page /[author]/[slug]/ is a dynamic route that can't be a registered
		// redirect URI, so sign-in must round-trip through /oauth/callback/ and bounce back to
		// where the reader started (carrying the subscribe intent the button stashed).
		setLocation( 'https://skypress.blog', '/@alice.bsky.social/my-pub/', 'skypress.blog' );
		const ctx = await mountProvider();
		await act( async () => {
			await ctx.value!.signIn( 'alice.bsky.social', { returnTo: '/@alice.bsky.social/my-pub/' } );
		} );
		expect( oauth.signIn ).toHaveBeenCalledWith( 'alice.bsky.social', {
			redirect_uri: 'https://skypress.blog/oauth/callback/',
		} );
		expect( takeOAuthReturn( window.localStorage ) ).toBe( '/@alice.bsky.social/my-pub/' );
	} );

	it( 'loopback + returnTo: still no redirect_uri and no stash — the per-page client round-trips directly', async () => {
		setLocation( 'http://127.0.0.1:4321', '/@alice.bsky.social/my-pub/', '127.0.0.1' );
		const ctx = await mountProvider();
		await act( async () => {
			await ctx.value!.signIn( 'alice.bsky.social', { returnTo: '/@alice.bsky.social/my-pub/' } );
		} );
		expect( oauth.signIn ).toHaveBeenCalledWith( 'alice.bsky.social', undefined );
		expect( takeOAuthReturn( window.localStorage ) ).toBeNull();
	} );
} );
