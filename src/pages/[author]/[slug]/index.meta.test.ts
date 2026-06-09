/**
 * Source-level guard for the publication page's Open Graph wiring.
 *
 * Page rendering through astro/container isn't viable in this jsdom-pinned suite
 * (see src/layouts/Base.meta.test.ts), so we pin the wiring at the source level:
 * the publication page must hand Base its own logo as the share image, with an
 * alt, falling back to the default image when there is no logo.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname( fileURLToPath( import.meta.url ) );
const page = readFileSync( join( here, './index.astro' ), 'utf8' );

describe( 'publication page Open Graph wiring', () => {
	it( 'passes the publication logo (or default) as the Base share image', () => {
		expect( page ).toMatch( /image=\{\s*logoUrl\s*\?\?\s*undefined\s*\}/ );
	} );

	it( 'passes the publication name as the image alt', () => {
		expect( page ).toMatch( /imageAlt=\{\s*publication!?\.name\s*\}/ );
	} );
} );

describe( 'publication page error wiring', () => {
	it( 'renders ErrorScene instead of plain-text 404s', () => {
		expect( page ).toMatch( /import ErrorScene from '[^']*components\/ErrorScene.astro'/ );
		expect( page ).toMatch( /import\s*\{\s*errorScene/ );
		expect( page ).toMatch( /<ErrorScene/ );
		expect( page ).not.toMatch( /new Response\(\s*'Not found'/ );
		expect( page ).not.toMatch( /new Response\(\s*'Publication not found'/ );
	} );

	it( 'maps writer + publication failures and sets the response status', () => {
		expect( page ).toMatch( /errorScene\(\s*'writer-not-found'/ );
		expect( page ).toMatch( /errorScene\(\s*'publication-not-found'/ );
		expect( page ).toMatch( /Astro\.response\.status\s*=/ );
	} );
} );
