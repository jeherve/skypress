/**
 * Source-level guards for the landing redesign (spec 2026-06-09). The .astro pages
 * can't render through the jsdom-pinned vitest, so we assert on source — same approach
 * as src/pages/index.phase.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = ( rel: string ) =>
	readFileSync( fileURLToPath( new URL( rel, import.meta.url ) ), 'utf8' );

describe( 'site footer links', () => {
	const footer = read( '../../components/Footer.astro' );

	it( 'links the lexicon under a Docs label', () => {
		expect( footer ).toMatch( /href="\/lexicon"[^>]*>[\s\S]*?Docs/ );
	} );

	it( 'links the future demo publication under a News label', () => {
		expect( footer ).toMatch( /href="\/@skypress\.blog"[^>]*>[\s\S]*?News/ );
	} );
} );
