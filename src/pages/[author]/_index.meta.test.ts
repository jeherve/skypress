import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname( fileURLToPath( import.meta.url ) );
const page = readFileSync( join( here, './index.astro' ), 'utf8' );

describe( 'writer page error wiring', () => {
	it( 'renders ErrorScene instead of plain-text 404s', () => {
		expect( page ).toMatch( /import ErrorScene from '[^']*components\/ErrorScene.astro'/ );
		expect( page ).toMatch( /import\s*\{\s*errorScene/ );
		expect( page ).toMatch( /<ErrorScene/ );
		expect( page ).not.toMatch( /new Response\(\s*'Not found'/ );
		expect( page ).not.toMatch( /new Response\(\s*`Could not resolve/ );
	} );

	it( 'maps the writer-not-found failure and sets the response status', () => {
		expect( page ).toMatch( /errorScene\(\s*'writer-not-found'/ );
		expect( page ).toMatch( /errorScene\(\s*'not-found'/ );
		expect( page ).toMatch( /Astro\.response\.status\s*=/ );
	} );
} );
