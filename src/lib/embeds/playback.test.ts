// src/lib/embeds/playback.test.ts
import { describe, expect, it } from 'vitest';
import { playbackUrl, isTrustedPlaybackUrl } from './playback';

describe( 'playbackUrl', () => {
	it( 'builds privacy-friendly youtube + vimeo URLs', () => {
		expect( playbackUrl( 'youtube', 'dQw4w9WgXcQ' ) ).toBe(
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1'
		);
		expect( playbackUrl( 'vimeo', '123456789' ) ).toBe(
			'https://player.vimeo.com/video/123456789?autoplay=1'
		);
	} );

	it( 'URL-encodes the id', () => {
		expect( playbackUrl( 'youtube', 'a/b?c' ) ).toContain( '/embed/a%2Fb%3Fc?' );
	} );
} );

describe( 'isTrustedPlaybackUrl', () => {
	it( 'accepts only the two playback hosts', () => {
		expect( isTrustedPlaybackUrl( 'https://www.youtube-nocookie.com/embed/x?autoplay=1' ) ).toBe( true );
		expect( isTrustedPlaybackUrl( 'https://player.vimeo.com/video/1?autoplay=1' ) ).toBe( true );
	} );

	it( 'rejects anything else', () => {
		expect( isTrustedPlaybackUrl( 'https://evil.com/embed/x' ) ).toBe( false );
		expect( isTrustedPlaybackUrl( 'https://www.youtube-nocookie.com.evil.com/embed/x' ) ).toBe( false );
		expect( isTrustedPlaybackUrl( 'javascript:alert(1)' ) ).toBe( false );
	} );
} );
