/**
 * Source-level guards for the landing redesign (spec 2026-06-09). The .astro pages
 * can't render through the jsdom-pinned vitest, so we assert on source — same approach
 * as src/pages/index.phase.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve at module scope: jsdom swaps the global `URL` for one based at
// http://localhost, so `new URL( rel, import.meta.url )` only stays a file://
// URL when it runs at collection time (module/describe-body evaluation, before
// jsdom takes over) rather than inside an `it()` callback.
const resolve = ( rel: string ) => fileURLToPath( new URL( rel, import.meta.url ) );
const read = ( rel: string ) => readFileSync( resolve( rel ), 'utf8' );

describe( 'site footer links', () => {
	const footer = read( '../../components/Footer.astro' );

	it( 'links the lexicon under a Docs label', () => {
		expect( footer ).toMatch( /href=["']\/lexicon["'][^>]*>[\s\S]*?Docs/ );
	} );

	it( 'links the SkyPress launch article under a News label', () => {
		expect( footer ).toMatch(
			/href=["']https:\/\/skypress\.blog\/@skypress\.blog\/its-always-sunny-on-skypress["'][^>]*>[\s\S]*?News/
		);
	} );

	it( 'links the SkyPress source repo on tangled.org with an accessible label and icon', () => {
		expect( footer ).toMatch(
			/href=["']https:\/\/tangled\.org\/jeremy\.herve\.bzh\/skypress["'][\s\S]*?aria-label=[\s\S]*?<svg/
		);
	} );
} );

describe( 'sample/preview page is retired', () => {
	const previewRoute = resolve( '../../pages/preview.astro' );

	it( 'no longer ships the /preview route', () => {
		expect( existsSync( previewRoute ) ).toBe( false );
	} );

	it( 'is not linked from the landing or lexicon pages', () => {
		expect( read( '../../pages/index.astro' ) ).not.toMatch( /\/preview/ );
		expect( read( '../../pages/lexicon.astro' ) ).not.toMatch( /\/preview/ );
	} );
} );

describe( 'landing hero redesign', () => {
	const index = read( '../../pages/index.astro' );

	it( 'mounts the HandleStart island as the primary CTA', () => {
		expect( index ).toMatch( /import HandleStart from '\.\.\/components\/HandleStart'/ );
		expect( index ).toMatch( /<HandleStart\s+client:only="react"\s*\/>/ );
	} );

	it( 'drops the old multi-button hero actions', () => {
		expect( index ).not.toMatch( /Start writing/ );
		expect( index ).not.toMatch( /Read a sample/ );
		expect( index ).not.toMatch( /See the lexicon/ );
		expect( index ).not.toMatch( /href="\/editor">Studio/ );
	} );

	it( 'states that SkyPress is free', () => {
		expect( index ).toMatch( /[Ff]ree/ );
	} );

	it( 'no longer carries the Bluesky cross-post note on the home page', () => {
		// The "One thing worth knowing…" notice was removed from the landing page
		// (commit c1508f9); the cross-post disclosure now lives on the publish panel.
		expect( index ).not.toMatch( /posts to Bluesky/ );
	} );

	it( 'shows the three-up "see it in action" screenshot strip', () => {
		expect( index ).toMatch( /\/screenshots\/editor\.png/ );
		expect( index ).toMatch( /\/screenshots\/published-article\.png/ );
		expect( index ).toMatch( /\/screenshots\/author-page\.png/ );
	} );

	it( 'no longer renders the three-step how-it-works list', () => {
		expect( index ).not.toMatch( /class="steps"/ );
	} );
} );

describe( 'playful: shooting star', () => {
	const index = read( '../../pages/index.astro' );

	it( 'renders a shooting-star element inside the decorative sky', () => {
		expect( index ).toMatch( /class="shootingstar"/ );
	} );

	it( 'animates only in dark phases', () => {
		const style = index.match( /<style>([\s\S]*?)<\/style>/ )?.[ 1 ] ?? '';
		expect( style ).toMatch( /:global\(\s*\[data-phase='night'\]\s*\)\s*\.shootingstar/ );
	} );

	it( 'is silenced under reduced motion', () => {
		const style = index.match( /<style>([\s\S]*?)<\/style>/ )?.[ 1 ] ?? '';
		const reduced = style.match( /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\}/ )?.[ 1 ] ?? '';
		expect( reduced ).toMatch( /\.shootingstar/ );
	} );
} );
