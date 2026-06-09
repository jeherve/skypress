/**
 * Regression guard for the signed-in account menu dropdown stacking on the landing page.
 *
 * The dropdown (`.account-menu__dropdown`, `z-index: 5`) lives inside `.masthead`, which is a
 * positioned stacking context. `.masthead`, `.hero`, and `.showcase` are sibling children of
 * `.page`. A positioned element's `z-index` only competes within its own stacking context, so the
 * dropdown's `z-index: 5` is confined to `.masthead` and never escapes it. When `.masthead` and a
 * later sibling carry the *same* `z-index`, DOM order wins and the later sibling paints on top of
 * the entire masthead — including the dropdown.
 *
 * On mobile the dropdown extends down into the `.hero` region; if `.hero` ties `.masthead` on
 * `z-index`, the hero text paints over the dropdown (it looks see-through) and the hero intercepts
 * the dropdown's clicks. So `.masthead` must outrank every sibling it can overlap.
 *
 * Rendering the page through astro/container isn't viable here (the runner is pinned to jsdom for
 * the WordPress block suites), so this pins the stacking order at the source level.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `import.meta.url` must be referenced from a top-level binding so vite's transform rewrites it
// to a `file://` URL; referenced inside a `describe` callback it is left as a non-file URL at
// collection time and `fileURLToPath` throws. (The sibling _index.phase.test.ts does the same.)
const read = ( rel: string ) =>
	readFileSync( fileURLToPath( new URL( rel, import.meta.url ) ), 'utf8' );

describe( 'landing page masthead stacking', () => {
	const index = read( './index.astro' );
	// Strip CSS comments so prose like "z-index: 2" inside a comment can't be mistaken for a
	// declaration.
	const style = ( index.match( /<style>([\s\S]*?)<\/style>/ )?.[ 1 ] ?? '' ).replace(
		/\/\*[\s\S]*?\*\//g,
		''
	);

	/** Read the `z-index` declared on the rule that positions `selector`. */
	const zIndexOf = ( selector: string ): number => {
		// `.hero`/`.masthead` also appear in grouped per-phase rules (`… .hero {`) that only set
		// colours; the positioning rule is the one declaring z-index. Scan every `<selector> { … }`
		// block (body has no nested braces) and take the z-index wherever it is declared. `\b` keeps
		// `.masthead` off `.masthead__right`; the leading `\.` keeps it off classes ending the same.
		const blocks = style.matchAll(
			new RegExp( `${ selector.replace( /\./g, '\\.' ) }\\b\\s*\\{([^{}]*)\\}`, 'g' )
		);
		let z: string | undefined;
		for ( const [ , body ] of blocks ) {
			z = body.match( /z-index:\s*(-?\d+)/ )?.[ 1 ] ?? z;
		}
		expect( z, `expected a rule positioning ${ selector } with a z-index` ).toBeDefined();
		return Number( z );
	};

	it( 'stacks the masthead above the hero so its dropdown can paint over hero content', () => {
		expect( zIndexOf( '.masthead' ) ).toBeGreaterThan( zIndexOf( '.hero' ) );
	} );

	it( 'stacks the masthead above the showcase below the fold', () => {
		expect( zIndexOf( '.masthead' ) ).toBeGreaterThan( zIndexOf( '.showcase' ) );
	} );
} );
