/**
 * Source-level guard for the shared publication footer. Page/component rendering
 * through astro/container isn't viable in this jsdom-pinned suite (see
 * Base.meta.test.ts / ErrorScene.meta.test.ts), so we pin the wiring at the
 * source level.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname( fileURLToPath( import.meta.url ) );
const component = readFileSync( join( here, './PublicationFooter.astro' ), 'utf8' );

describe( 'PublicationFooter component', () => {
	it( 'declares the name, pubUrl and feedHref props', () => {
		expect( component ).toMatch( /name/ );
		expect( component ).toMatch( /pubUrl/ );
		expect( component ).toMatch( /feedHref/ );
	} );

	it( 'links the publication name to the pubUrl prop', () => {
		expect( component ).toMatch( /href=\{\s*pubUrl\s*\}[^>]*>\s*\{\s*name\s*\}/ );
	} );

	it( 'links the RSS icon to the feedHref prop with an accessible label', () => {
		expect( component ).toMatch( /href=\{\s*feedHref\s*\}/ );
		expect( component ).toMatch( /aria-label=/ );
		expect( component ).toMatch( /<svg/ );
	} );

	it( 'links "Powered by SkyPress" to the site root', () => {
		expect( component ).toMatch( /href="\/"[^>]*>\s*Powered by SkyPress/ );
	} );

	it( 'is dependency-free (no @wordpress imports on the read path)', () => {
		expect( component ).not.toMatch( /@wordpress\// );
	} );
} );
