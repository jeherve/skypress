import { describe, expect, it } from 'vitest';
import {
	ATMOSPHERE_WEB_BASE,
	atmosphereProfileUrl,
	atmosphereHashtagUrl,
	atmospherePostWebUrl,
} from './atmosphere-url';

describe( 'atmosphere-url', () => {
	it( 'builds a profile URL from a handle', () => {
		expect( atmosphereProfileUrl( 'alice.bsky.social' ) ).toBe(
			'https://mu.social/profile/alice.bsky.social'
		);
	} );

	it( 'builds a hashtag URL from a bare tag', () => {
		expect( atmosphereHashtagUrl( 'design' ) ).toBe(
			'https://mu.social/hashtag/design'
		);
	} );

	it( 'maps an at:// post uri to its profile/post URL', () => {
		expect(
			atmospherePostWebUrl( 'at://did:plc:writer/app.bsky.feed.post/3kpost' )
		).toBe( 'https://mu.social/profile/did:plc:writer/post/3kpost' );
	} );

	it( 'falls back to the AppView home for an unparseable uri', () => {
		expect( atmospherePostWebUrl( 'not-an-at-uri' ) ).toBe( ATMOSPHERE_WEB_BASE );
	} );
} );
