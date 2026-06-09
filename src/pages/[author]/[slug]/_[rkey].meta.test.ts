/**
 * Source-level guard for the document page's Open Graph wiring.
 *
 * The document page opts out of Base's social meta (it owns the atproto
 * canonical + og:type=article), so it must build the FULL tag set itself via
 * buildMetaTags — not just the handful of og:* tags it used to hand-roll.
 * jsdom-pinned suite, so this is a source pin (see Base.meta.test.ts).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname( fileURLToPath( import.meta.url ) );
const page = readFileSync( join( here, './[rkey].astro' ), 'utf8' );

describe( 'document page Open Graph wiring', () => {
	it( 'imports buildMetaTags and buildGetBlobUrl', () => {
		expect( page ).toMatch( /import\s*\{\s*buildMetaTags\s*\}\s*from\s*'[^']*lib\/seo\/meta'/ );
		expect( page ).toMatch( /buildGetBlobUrl/ );
	} );

	it( 'builds the meta tags as an article with the canonical URL', () => {
		expect( page ).toMatch( /buildMetaTags\(/ );
		expect( page ).toMatch( /type:\s*'article'/ );
		expect( page ).toMatch( /url:\s*canonical/ );
	} );

	it( 'falls back to the default share image when the publication has no logo', () => {
		expect( page ).toMatch( /og-default\.png/ );
	} );

	it( 'renders the built tag set instead of hand-rolled og:title/og:description', () => {
		expect( page ).toMatch( /metaTags\.map/ );
		// The old hand-rolled tags are gone (buildMetaTags now owns og:title etc).
		expect( page ).not.toMatch( /<meta property="og:title"/ );
		expect( page ).not.toMatch( /<meta property="og:description"/ );
	} );

	it( 'still opts out of Base social meta and keeps its own canonical link', () => {
		expect( page ).toMatch( /socialMeta=\{false\}/ );
		expect( page ).toMatch( /<link\s+rel="canonical"\s+href=\{canonical\}/ );
	} );
} );
