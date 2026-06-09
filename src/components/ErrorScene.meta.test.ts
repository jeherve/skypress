/**
 * Source-level guard for the shared error scene. Page/component rendering through
 * astro/container isn't viable in this jsdom-pinned suite (see Base.meta.test.ts),
 * so we pin the wiring at the source level.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname( fileURLToPath( import.meta.url ) );
const component = readFileSync( join( here, './ErrorScene.astro' ), 'utf8' );

describe( 'ErrorScene component', () => {
	it( 'renders inside Base and opts out of social meta', () => {
		expect( component ).toMatch( /import Base from '[^']*layouts\/Base.astro'/ );
		expect( component ).toMatch( /socialMeta=\{false\}/ );
	} );

	it( 'marks the page noindex so playful copy is never indexed', () => {
		expect( component ).toMatch(
			/<meta\s+name="robots"\s+content="noindex"\s*\/?>/
		);
	} );

	it( 'renders the eyebrow, heading and subline props', () => {
		expect( component ).toMatch( /\{eyebrow\}/ );
		expect( component ).toMatch( /\{heading\}/ );
		expect( component ).toMatch( /\{subline\}/ );
	} );

	it( 'provides a single Back to homepage link to the site root', () => {
		expect( component ).toMatch( /href="\/"[^>]*>\s*Back to homepage/ );
	} );

	it( 'disables the sun-glow animation under reduced motion', () => {
		expect( component ).toMatch( /prefers-reduced-motion/ );
	} );

	it( 'is dependency-free (no @wordpress imports on the read path)', () => {
		expect( component ).not.toMatch( /@wordpress\// );
	} );
} );
