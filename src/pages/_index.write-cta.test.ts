/**
 * The home page leads with the writing-first experience (/write), not the gated editor.
 *
 * Source-level asserts (like the sibling _index.*.test.ts) — rendering the page through
 * astro/container isn't viable under the jsdom-pinned runner, so we pin the link targets
 * at the source.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve via `fileURLToPath` + `join` (not `new URL(rel, import.meta.url)`): under this
// repo's Astro/Vite-backed Vitest the global `URL` resolves a relative specifier to an
// `http://localhost` dev URL, which `readFileSync` rejects. Mirrors `_write.meta.test.ts`.
const here = dirname( fileURLToPath( import.meta.url ) );
const src = readFileSync( join( here, './index.astro' ), 'utf8' );

describe( 'home page leads with the writing-first experience', () => {
	it( 'points the masthead Write button at /write, not the gated editor', () => {
		expect( src ).toMatch( /class="[^"]*masthead-write[^"]*"\s+href="\/write"/ );
		// The home page no longer routes anyone to the login-gated /editor.
		expect( src ).not.toContain( 'href="/editor"' );
	} );

	it( 'gives the hero a primary "Start writing" CTA to /write', () => {
		expect( src ).toMatch( /href="\/write"[^>]*>\s*Start writing/ );
	} );

	it( 'keeps the handle sign-in as the secondary, returning-user path', () => {
		expect( src ).toContain( '<HandleStart' );
	} );
} );
