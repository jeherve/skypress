import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname( fileURLToPath( import.meta.url ) );
const page = readFileSync( join( here, './index.astro' ), 'utf8' );

describe( 'writer page error wiring', () => {
	it( 'delegates resolution to the read-context module', () => {
		expect( page ).toMatch(
			/import\s*\{\s*resolveAuthorContext\s*\}\s*from\s*'[^']*lib\/reader\/read-context'/
		);
		expect( page ).toMatch( /resolveAuthorContext\(/ );
	} );

	it( 'renders ErrorScene with the module-provided copy instead of plain-text 404s', () => {
		// Error mapping (not-found / writer-not-found) is behaviourally tested in
		// src/lib/reader/read-context.test.ts; the page only renders what comes back.
		expect( page ).toMatch( /import ErrorScene from '[^']*components\/ErrorScene.astro'/ );
		expect( page ).toMatch( /<ErrorScene/ );
		expect( page ).toMatch( /Astro\.response\.status\s*=/ );
		expect( page ).not.toMatch( /new Response\(\s*'Not found'/ );
		expect( page ).not.toMatch( /new Response\(\s*`Could not resolve/ );
	} );
} );
