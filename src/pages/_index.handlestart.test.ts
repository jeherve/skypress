/**
 * Regression guard for the landing-page handle CTA overflowing on narrow viewports.
 *
 * `.handlestart__row` is a flexbox row holding the input field (`flex: 1`) and the "Start"
 * button. A flex item's default `min-width: auto` refuses to shrink below its content's
 * intrinsic width — and the `<input>` carries a sizeable intrinsic floor. Without an explicit
 * `min-width: 0` on the field (and the input nested inside it), the field can't shrink on a
 * phone-width screen, so the row grows past the container and clips the "Start" button off the
 * right edge (reported 2026-06-09, reproduced at <=320px CSS px).
 *
 * Rendering the page through astro/container isn't viable here (the runner is pinned to jsdom
 * for the WordPress block suites), so — as with _index.phase.test.ts — these asserts pin the
 * fix at the source level.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = ( rel: string ) =>
	readFileSync( fileURLToPath( new URL( rel, import.meta.url ) ), 'utf8' );

/** Pull the body of a CSS rule (between its `{` and the matching `}`) for the given selector. */
const ruleBody = ( css: string, selector: string ): string => {
	const start = css.indexOf( selector );
	if ( start === -1 ) {
		return '';
	}
	const open = css.indexOf( '{', start );
	const close = css.indexOf( '}', open );
	return css.slice( open + 1, close );
};

describe( 'landing page handle CTA shrinks on narrow viewports', () => {
	const style = read( './index.astro' ).match( /<style>([\s\S]*?)<\/style>/ )?.[ 1 ] ?? '';

	it( 'lets the field shrink below the input intrinsic width (min-width: 0)', () => {
		const body = ruleBody( style, '.handlestart__field)' );
		expect( body, 'expected a .handlestart__field rule in the landing styles' ).not.toBe( '' );
		expect( body, '.handlestart__field must set min-width: 0 so it can shrink in the flex row' ).toMatch(
			/min-width:\s*0\b/
		);
	} );

	it( 'lets the input itself shrink inside the field (min-width: 0)', () => {
		const body = ruleBody( style, '.handlestart__input)' );
		expect( body, 'expected a .handlestart__input rule in the landing styles' ).not.toBe( '' );
		expect( body, '.handlestart__input must set min-width: 0 so the field can collapse around it' ).toMatch(
			/min-width:\s*0\b/
		);
	} );
} );
