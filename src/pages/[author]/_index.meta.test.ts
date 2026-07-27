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

describe( 'writer page AT Tags', () => {
	it( 'builds the tags through the shared builder and renders them in a head fragment', () => {
		expect( page ).toMatch(
			/import\s*\{\s*buildAtTags\s*\}\s*from\s*'[^']*lib\/seo\/at-tags'/
		);
		expect( page ).toMatch( /buildAtTags\(/ );
		expect( page ).toMatch( /<Fragment slot="head">/ );
		expect( page ).toMatch( /<meta\s+name=\{tag\.name\}\s+content=\{tag\.content\}/ );
	} );

	it( 'declares the profile record as an alternate, gated on the record existing', () => {
		expect( page ).toMatch( /profile\.exists\s*\?/ );
		expect( page ).toMatch( /app\.bsky\.actor\.profile\/self/ );
	} );

	it( 'declares no canonical — no single record makes this index page exist', () => {
		expect( page ).not.toMatch( /canonical\s*:\s*\[/ ); // not passed to the builder
		expect( page ).not.toMatch( /name="at:canonical"/ ); // not hand-rolled either
	} );

	it( 'attributes the page to the resolved author DID', () => {
		expect( page ).toMatch( /authorDids:\s*\[\s*did\s*\]/ );
		expect( page ).toMatch( /meDid:\s*did\b/ );
	} );
} );
