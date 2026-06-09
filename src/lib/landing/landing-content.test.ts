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
		expect( footer ).toMatch( /href="\/lexicon"[^>]*>[\s\S]*?Docs/ );
	} );

	it( 'links the future demo publication under a News label', () => {
		expect( footer ).toMatch( /href="\/@skypress\.blog"[^>]*>[\s\S]*?News/ );
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
