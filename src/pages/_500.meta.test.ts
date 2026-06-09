import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname( fileURLToPath( import.meta.url ) );
const page = readFileSync( join( here, './500.astro' ), 'utf8' );

describe( 'global 500 page', () => {
	it( 'is prerendered (static, no per-request data)', () => {
		expect( page ).toMatch( /export const prerender = true/ );
	} );

	it( 'renders ErrorScene with the server-error copy', () => {
		expect( page ).toMatch( /import ErrorScene from '[^']*components\/ErrorScene.astro'/ );
		expect( page ).toMatch( /errorScene\(\s*'server-error'\s*\)/ );
		expect( page ).toMatch( /<ErrorScene/ );
	} );
} );
