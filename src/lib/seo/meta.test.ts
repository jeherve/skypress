import { describe, expect, it } from 'vitest';
import { buildMetaTags, type MetaTag } from './meta';

const BASE = {
	title: 'SkyPress',
	description: 'A writing studio for the open social web.',
	url: 'https://skypress.blog/',
	image: 'https://skypress.blog/og-default.png',
	siteName: 'SkyPress',
	imageAlt: 'SkyPress',
};

const byProperty = ( tags: MetaTag[], property: string ) =>
	tags.find( ( t ) => t.property === property );
const byName = ( tags: MetaTag[], name: string ) =>
	tags.find( ( t ) => t.name === name );

describe( 'buildMetaTags', () => {
	it( 'emits the core Open Graph tags', () => {
		const tags = buildMetaTags( BASE );
		expect( byProperty( tags, 'og:title' )?.content ).toBe( 'SkyPress' );
		expect( byProperty( tags, 'og:url' )?.content ).toBe( 'https://skypress.blog/' );
		expect( byProperty( tags, 'og:type' )?.content ).toBe( 'website' );
		expect( byProperty( tags, 'og:site_name' )?.content ).toBe( 'SkyPress' );
	} );

	it( 'emits the image tags with explicit dimensions and alt', () => {
		const tags = buildMetaTags( BASE );
		expect( byProperty( tags, 'og:image' )?.content ).toBe(
			'https://skypress.blog/og-default.png'
		);
		expect( byProperty( tags, 'og:image:width' )?.content ).toBe( '1200' );
		expect( byProperty( tags, 'og:image:height' )?.content ).toBe( '630' );
		expect( byProperty( tags, 'og:image:alt' )?.content ).toBe( 'SkyPress' );
	} );

	it( 'emits a large-image Twitter card mirroring title and image', () => {
		const tags = buildMetaTags( BASE );
		expect( byName( tags, 'twitter:card' )?.content ).toBe( 'summary_large_image' );
		expect( byName( tags, 'twitter:title' )?.content ).toBe( 'SkyPress' );
		expect( byName( tags, 'twitter:image' )?.content ).toBe(
			'https://skypress.blog/og-default.png'
		);
	} );

	it( 'includes description tags when a description is given', () => {
		const tags = buildMetaTags( BASE );
		expect( byProperty( tags, 'og:description' )?.content ).toBe( BASE.description );
		expect( byName( tags, 'twitter:description' )?.content ).toBe( BASE.description );
	} );

	it( 'omits description tags entirely when no description is given', () => {
		const tags = buildMetaTags( { ...BASE, description: undefined } );
		expect( byProperty( tags, 'og:description' ) ).toBeUndefined();
		expect( byName( tags, 'twitter:description' ) ).toBeUndefined();
	} );

	it( 'honours a custom og:type', () => {
		const tags = buildMetaTags( { ...BASE, type: 'article' } );
		expect( byProperty( tags, 'og:type' )?.content ).toBe( 'article' );
	} );

	it( 'omits og:image:alt when no alt is given', () => {
		const tags = buildMetaTags( { ...BASE, imageAlt: undefined } );
		expect( byProperty( tags, 'og:image:alt' ) ).toBeUndefined();
	} );
} );
