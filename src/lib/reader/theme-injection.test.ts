/**
 * Regression guard for the publication-theme injection (Decision 0012).
 *
 * The publication-home and article pages inject a `<style>` overriding the design tokens when a
 * publication has a `basicTheme`. Rendering these `.astro` pages through astro/container isn't
 * viable here (the runner is pinned to jsdom for the WordPress block suites, which breaks
 * esbuild's init invariant — see index.phase.test.ts), so these asserts pin the wiring at the
 * source level: each page must compute `themeStyleBlock(publication.basicTheme)` and inject it,
 * gated on a truthy result, via `set:html` (the value is app-built CSS, proven injection-safe by
 * themes.test.ts). A refactor that drops the gate or passes the wrong field ships green without it.
 *
 * Lives under src/lib/ (not src/pages/) on purpose: a `.test.ts` inside a `[param]` route dir is
 * treated by Astro as a prerendered endpoint and breaks the build.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = ( rel: string ) =>
	readFileSync( fileURLToPath( new URL( rel, import.meta.url ) ), 'utf8' );

describe( 'publication theme injection wiring', () => {
	for ( const [ label, file ] of [
		[ 'publication home', '../../pages/[author]/[slug]/index.astro' ],
		[ 'article', '../../pages/[author]/[slug]/[rkey].astro' ],
	] as const ) {
		describe( label, () => {
			const src = read( file );

			it( 'imports themeStyleBlock from the themes module', () => {
				expect( src ).toMatch(
					/import\s*\{\s*themeStyleBlock\s*\}\s*from\s*['"][^'"]*publish\/themes['"]/
				);
			} );

			it( 'derives the style block from the publication’s basicTheme', () => {
				expect( src ).toMatch( /themeStyleBlock\(\s*publication\.basicTheme\s*\)/ );
			} );

			it( 'injects it via set:html, gated on a truthy theme', () => {
				expect( src ).toMatch(
					/\{\s*themeStyle\s*&&\s*<Fragment\s+set:html=\{\s*themeStyle\s*\}\s*\/>\s*\}/
				);
			} );
		} );
	}
} );
