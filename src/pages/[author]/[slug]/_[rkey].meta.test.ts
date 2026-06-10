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
	it( 'imports buildMetaTags and takes the logo from the read context', () => {
		expect( page ).toMatch( /import\s*\{\s*buildMetaTags\s*\}\s*from\s*'[^']*lib\/seo\/meta'/ );
		// The blob-ref → URL construction lives in the read-context module now.
		expect( page ).toMatch( /publication\.logoUrl/ );
		expect( page ).not.toMatch( /buildGetBlobUrl/ );
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

	it( 'renders the ErrorScene instead of plain-text 404 responses', () => {
		expect( page ).toMatch( /import ErrorScene from '[^']*components\/ErrorScene.astro'/ );
		expect( page ).toMatch( /<ErrorScene/ );
		// No more bare plain-text 404 bodies.
		expect( page ).not.toMatch( /new Response\(\s*'Not found'/ );
		expect( page ).not.toMatch( /new Response\(\s*'Article not found'/ );
	} );

	it( 'delegates failure mapping to the read-context module and sets the response status', () => {
		// Error-kind mapping (writer/publication/article not found + the site-join)
		// is behaviourally tested in src/lib/reader/read-context.test.ts.
		expect( page ).toMatch(
			/import\s*\{\s*resolveArticleContext\s*\}\s*from\s*'[^']*lib\/reader\/read-context'/
		);
		expect( page ).toMatch( /resolveArticleContext\(/ );
		expect( page ).toMatch( /Astro\.response\.status\s*=/ );
	} );

	it( 'derives the og:description fallback via deriveExcerpt (shared with publish)', () => {
		expect( page ).toMatch(
			/import\s*\{\s*deriveExcerpt\s*\}\s*from\s*'[^']*lib\/publish\/excerpt'/
		);
		expect( page ).toMatch( /doc\.description\s*\|\|\s*deriveExcerpt\(\s*textContent\s*\)/ );
	} );

	it( 'no longer hand-rolls the textContent.slice fallback', () => {
		expect( page ).not.toMatch( /textContent\.slice\(\s*0,\s*200\s*\)/ );
	} );
} );

describe( 'document page focuses on publication + author', () => {
	it( 'replaces the SkyPress logo header with the publication logo + title linking to the publication', () => {
		expect( page ).not.toMatch( /import Logo from/ );
		expect( page ).not.toMatch( /<a href="\/"><Logo \/><\/a>/ );
		expect( page ).toMatch( /class="masthead__pub"\s+href=\{pubUrl\}/ );
		expect( page ).toMatch( /class="masthead__title">\{publication!?\.name\}/ );
	} );

	it( 'takes the author profile from the read context for the eyebrow', () => {
		expect( page ).toMatch( /profile\.displayName/ );
		expect( page ).toMatch( /profile\.avatar/ );
	} );

	it( 'shows the author (name, avatar, handle) in the eyebrow, linked to the profile', () => {
		expect( page ).toMatch( /class="reader__author"\s+href=\{`\/@\$\{\s*handle\s*\}`\}/ );
		expect( page ).toMatch( /reader__avatar/ );
		expect( page ).toMatch( /authorName/ );
		// The publication name no longer stands in for the byline in the eyebrow.
		expect( page ).not.toMatch( /class="reader__author"\s+href=\{pubUrl\}/ );
	} );

	it( 'renders dates in long format via formatLongDate', () => {
		expect( page ).toMatch(
			/import\s*\{\s*formatLongDate\s*\}\s*from\s*'[^']*lib\/reader\/dates'/
		);
		expect( page ).toMatch( /formatLongDate\(/ );
		expect( page ).not.toMatch( /\.slice\(\s*0,\s*10\s*\)/ );
	} );
} );
