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
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = ( rel: string ) =>
	readFileSync( fileURLToPath( new URL( rel, import.meta.url ) ), 'utf8' );

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
} );

describe( 'preview page metadata', () => {
	const preview = read( '../pages/preview.astro' );

	it( 'passes a description so its card has body text', () => {
		expect( preview ).toMatch( /<Base[^>]*\sdescription=/s );
	} );
} );
