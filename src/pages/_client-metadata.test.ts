import { describe, it, expect } from 'vitest';
import type { APIContext } from 'astro';
import { GET } from './client-metadata.json';
import { OAUTH_REDIRECT_PATHS, OAUTH_CALLBACK_PATH } from '../lib/auth/config';

// Colocated under src/pages/, so the filename is underscore-prefixed to keep Astro's
// file router from importing it during static-path collection (see AGENTS.md).

async function metadata( origin: string ) {
	const response = await GET( {
		url: new URL( `${ origin }/client-metadata.json` ),
	} as APIContext );
	return response.json() as Promise< { client_id: string; redirect_uris: string[] } >;
}

describe( '/client-metadata.json', () => {
	it( 'registers a redirect URI for every OAuth-island route', async () => {
		// Regression: with only /editor/ registered, signing in from /write returned the
		// writer to /editor — losing the in-progress writing-first draft (the publish
		// intent never resumed). Both surfaces must be registered redirect targets.
		const { redirect_uris } = await metadata( 'https://skypress.blog' );
		expect( redirect_uris ).toEqual(
			[ ...OAUTH_REDIRECT_PATHS, OAUTH_CALLBACK_PATH ].map(
				( path ) => `https://skypress.blog${ path }`
			)
		);
		expect( redirect_uris ).toContain( 'https://skypress.blog/write/' );
	} );

	it( 'registers the static OAuth callback route for off-island (dynamic-page) sign-in', async () => {
		// The publication page is a dynamic route that can't be a registered redirect URI, so
		// signing in from it returns via this one static callback (which then bounces back).
		const { redirect_uris } = await metadata( 'https://skypress.blog' );
		expect( redirect_uris ).toContain( 'https://skypress.blog/oauth/callback/' );
	} );

	it( 'derives client_id and redirect_uris from the request origin', async () => {
		const { client_id, redirect_uris } = await metadata( 'https://preview.example.com' );
		expect( client_id ).toBe( 'https://preview.example.com/client-metadata.json' );
		expect( redirect_uris[ 0 ] ).toBe( 'https://preview.example.com/editor/' );
	} );
} );
