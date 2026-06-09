/**
 * Source-level guard for the Open Graph wiring in Base.astro.
 *
 * Rendering the layout through astro/container is not viable in this suite (the
 * runner is pinned to jsdom for the WordPress block tests — see
 * src/pages/index.phase.test.ts). So, like that test, we pin the wiring at the
 * source level: Base must compute absolute URLs, call buildMetaTags, render the
 * tags, and emit a canonical link. The tag *shapes* are unit-tested in
 * src/lib/seo/meta.test.ts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname( fileURLToPath( import.meta.url ) );
const read = ( rel: string ) => readFileSync( join( here, rel ), 'utf8' );

describe( 'Base.astro Open Graph wiring', () => {
	const base = read( './Base.astro' );

	it( 'imports the buildMetaTags helper', () => {
		expect( base ).toMatch( /import\s*\{\s*buildMetaTags\s*\}\s*from\s*'\.\.\/lib\/seo\/meta'/ );
	} );

	it( 'derives an absolute canonical URL and image URL from Astro.site', () => {
		expect( base ).toMatch( /new URL\(\s*Astro\.url\.pathname,\s*Astro\.site\s*\)/ );
		expect( base ).toMatch( /new URL\(\s*image,\s*Astro\.site\s*\)/ );
	} );

	it( 'renders the built meta tags into <head>', () => {
		expect( base ).toMatch( /metaTags\.map/ );
		expect( base ).toMatch( /<meta\s+property=\{/ );
		expect( base ).toMatch( /<meta\s+name=\{/ );
	} );

	it( 'emits a canonical link', () => {
		expect( base ).toMatch( /<link\s+rel="canonical"/ );
	} );

	it( 'defaults the share image to the shared og-default.png', () => {
		expect( base ).toMatch( /\/og-default\.png/ );
	} );

	it( 'guards the canonical link + social tags behind an opt-out socialMeta prop', () => {
		// Defaults on, so callers that pass nothing are unaffected.
		expect( base ).toMatch( /socialMeta\s*=\s*true/ );
		// The canonical + meta block only renders when socialMeta is truthy, so
		// pages that manage their own head tags (e.g. articles) can opt out.
		expect( base ).toMatch( /socialMeta\s*&&/ );
	} );

	it( 'accepts optional imageWidth/imageHeight props', () => {
		expect( base ).toMatch( /imageWidth\??:\s*number/ );
		expect( base ).toMatch( /imageHeight\??:\s*number/ );
	} );

	it( 'only defaults the 1200x630 dimensions for the built-in default image', () => {
		// A flag distinguishes the default image from a caller-supplied one.
		expect( base ).toMatch( /og-default\.png/ );
		// The 1200x630 defaults must be gated behind the isDefaultImage guard, so
		// caller-supplied images don't silently inherit the default dimensions.
		expect( base ).toMatch( /isDefaultImage\s*\?\s*1200/ );
		expect( base ).toMatch( /isDefaultImage\s*\?\s*630/ );
		// Dimensions are threaded into buildMetaTags.
		expect( base ).toMatch( /imageWidth:/ );
		expect( base ).toMatch( /imageHeight:/ );
	} );
} );

describe( 'preview page metadata', () => {
	const preview = read( '../pages/preview.astro' );

	it( 'passes a description so its card has body text', () => {
		expect( preview ).toMatch( /<Base[^>]*\sdescription=/s );
	} );
} );

describe( 'article page metadata', () => {
	const article = read( '../pages/[author]/[slug]/[rkey].astro' );

	it( 'opts out of Base social meta so its own OG + canonical tags are not duplicated', () => {
		expect( article ).toMatch( /<Base[^>]*\ssocialMeta=\{\s*false\s*\}/s );
	} );
} );
