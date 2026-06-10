import { describe, expect, it } from 'vitest';
import { detectProvider, KNOWN_PROVIDERS, type ProviderId } from './providers';

describe( 'detectProvider', () => {
	it( 'detects pckt by the blog.pckt.theme discriminator, even on a custom domain', () => {
		expect(
			detectProvider( 'https://my-custom-domain.example', {
				theme: { $type: 'blog.pckt.theme' },
			} )
		).toBe( 'pckt' );
	} );

	it( 'detects each provider by its default hostname', () => {
		expect( detectProvider( 'https://jehervecom.leaflet.pub', {} ) ).toBe( 'leaflet' );
		expect( detectProvider( 'https://check-whats-in-my-pckt.pckt.blog', {} ) ).toBe( 'pckt' );
		expect( detectProvider( 'https://news.offprint.app/', {} ) ).toBe( 'offprint' );
	} );

	it( 'matches the bare provider domain as well as subdomains', () => {
		expect( detectProvider( 'https://leaflet.pub', {} ) ).toBe( 'leaflet' );
		expect( detectProvider( 'https://offprint.app/x', {} ) ).toBe( 'offprint' );
	} );

	it( 'rejects look-alike hostnames', () => {
		expect( detectProvider( 'https://evil-leaflet.pub.com', {} ) ).toBeNull();
		expect( detectProvider( 'https://notleaflet.pub', {} ) ).toBeNull();
		expect( detectProvider( 'https://offprint.app.evil.com', {} ) ).toBeNull();
	} );

	it( 'returns null for unknown hosts and unparseable urls', () => {
		expect( detectProvider( 'https://example.com', {} ) ).toBeNull();
		expect( detectProvider( 'not a url', {} ) ).toBeNull();
		expect( detectProvider( '', undefined ) ).toBeNull();
	} );
} );

describe( 'KNOWN_PROVIDERS', () => {
	it( 'has a complete, renderable entry for every provider id', () => {
		const ids: ProviderId[] = [ 'leaflet', 'pckt', 'offprint' ];
		for ( const id of ids ) {
			const provider = KNOWN_PROVIDERS[ id ];
			expect( provider.id ).toBe( id );
			expect( provider.label.length ).toBeGreaterThan( 0 );
			expect( provider.viewBox ).toMatch( /^\d+ \d+ \d+ \d+$/ );
			expect( provider.body ).toContain( 'currentColor' );
		}
	} );
} );
