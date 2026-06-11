import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for editor-chrome.css.
 *
 * A comment once read "NOT the --sun[star][slash]--ink tokens": that adjacent
 * star-then-slash pair closed the CSS comment early, so the trailing prose plus
 * the next selector collapsed into one invalid rule and the whole
 * `.studio__published` block (gradient, pill shape, centring) was silently
 * dropped by every CSS parser — the publish pill rendered as an unstyled
 * full-width paragraph.
 *
 * Parsing with PostCSS reproduces the browser's tokeniser (first comment close
 * wins), so asserting the styled rule survives catches any future premature
 * comment close.
 */
describe( 'editor-chrome.css', () => {
	it( 'keeps the .studio__published pill rule intact (no premature comment close)', () => {
		const here = dirname( fileURLToPath( import.meta.url ) );
		const css = readFileSync( join( here, './editor-chrome.css' ), 'utf8' );
		const root = postcss.parse( css );

		let pill: postcss.Rule | undefined;
		root.walkRules( '.studio__published', ( rule ) => {
			if ( rule.some( ( node ) => node.type === 'decl' && node.prop === 'background' ) ) {
				pill = rule;
			}
		} );

		expect( pill, '.studio__published rule with a background was dropped' ).toBeDefined();
		const background = pill!.nodes.find(
			( node ): node is postcss.Declaration => node.type === 'decl' && node.prop === 'background'
		);
		expect( background?.value ).toContain( 'linear-gradient' );
		expect(
			pill!.some( ( node ) => node.type === 'decl' && node.prop === 'width' )
		).toBe( true );
	} );
} );
