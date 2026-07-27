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
	it( 'delegates resolution to the read-context module', () => {
		expect( page ).toMatch(
			/import\s*\{\s*resolvePublicationContext\s*\}\s*from\s*'[^']*lib\/reader\/read-context'/
		);
		expect( page ).toMatch( /resolvePublicationContext\(/ );
	} );

	it( 'renders ErrorScene with the module-provided copy instead of plain-text 404s', () => {
		// Error mapping (writer/publication not found) is behaviourally tested in
		// src/lib/reader/read-context.test.ts; the page only renders what comes back.
		expect( page ).toMatch( /import ErrorScene from '[^']*components\/ErrorScene.astro'/ );
		expect( page ).toMatch( /<ErrorScene/ );
		expect( page ).toMatch( /Astro\.response\.status\s*=/ );
		expect( page ).not.toMatch( /new Response\(\s*'Not found'/ );
		expect( page ).not.toMatch( /new Response\(\s*'Publication not found'/ );
	} );
} );

describe( 'publication page focuses on the publication', () => {
	it( 'no longer renders the SkyPress masthead/logo', () => {
		expect( page ).not.toMatch( /class="masthead"/ );
		expect( page ).not.toMatch( /import Logo from/ );
	} );

	it( 'renders article dates in long format via formatLongDate', () => {
		expect( page ).toMatch(
			/import\s*\{\s*formatLongDate\s*\}\s*from\s*'[^']*lib\/reader\/dates'/
		);
		expect( page ).toMatch( /formatLongDate\(/ );
		// The old ISO-slice date format is gone.
		expect( page ).not.toMatch( /publishedAt\?\.slice\(\s*0,\s*10\s*\)/ );
	} );
} );

describe( 'publication page AT Tags', () => {
	it( 'builds the tags through the shared builder and renders them', () => {
		expect( page ).toMatch(
			/import\s*\{\s*buildAtTags\s*\}\s*from\s*'[^']*lib\/seo\/at-tags'/
		);
		expect( page ).toMatch( /buildAtTags\(/ );
		expect( page ).toMatch( /<meta\s+name=\{tag\.name\}\s+content=\{tag\.content\}/ );
	} );

	it( 'declares the publication record as canonical', () => {
		expect( page ).toMatch( /canonical:\s*\[\s*publication\.uri\s*\]/ );
	} );

	it( 'attributes the page to the resolved author DID', () => {
		expect( page ).toMatch( /authorDids:\s*\[\s*did\s*\]/ );
		expect( page ).toMatch( /meDid:\s*did\b/ );
	} );

	it( 'does not tag each article it lists', () => {
		expect( page ).not.toMatch( /alternate\s*:\s*\[/ );
	} );

	it( 'keeps the existing site.standard link rel tag — the meta tags are additive', () => {
		expect( page ).toMatch( /<link\s+rel="site\.standard\.publication"/ );
	} );
} );
