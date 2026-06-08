/**
 * Regression guard for the landing-page sky phase carrier (docs/specs/sp8-brand-first-light.md).
 *
 * `data-phase` lives on exactly one carrier: `<html>`, the only element the pre-paint inline head
 * script can reach (it runs in `<head>`, before `.page` exists, so it sets `documentElement`).
 *
 * The catch: the per-phase rules — `[data-phase='x'] .sky` / `.masthead` / `.hero` — live in
 * index.astro's *scoped* `<style>`. Astro appends index.astro's scope id to every part of a
 * selector, including the ancestor, yielding `[cid][data-phase='x'] .sky[cid]`. But `<html>` is
 * rendered by Base.astro and never carries index.astro's cid, so a bare (scoped) ancestor matches
 * nothing and the sky renders unstyled. Wrapping the ancestor in `:global([data-phase='x'])` keeps
 * the descendant (`.sky`/`.masthead`/`.hero`) scoped while letting the ancestor match `<html>`.
 *
 * These asserts pin the wiring at the source level — rendering the page through astro/container
 * isn't viable here (the test runner is pinned to jsdom for the WordPress block suites, which
 * breaks esbuild's init invariant).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { phaseForHour } from '../lib/landing/time-of-day';

const read = ( rel: string ) =>
	readFileSync( fileURLToPath( new URL( rel, import.meta.url ) ), 'utf8' );

/** Strip the `---` frontmatter and any <style>/<script> blocks, leaving only rendered markup. */
const markupOnly = ( astro: string ) =>
	astro
		.replace( /^---[\s\S]*?\n---/, '' )
		.replace( /<style[\s\S]*?<\/style>/g, '' )
		.replace( /<script[\s\S]*?<\/script>/g, '' );

describe( 'landing page sky phase carrier', () => {
	const index = read( './index.astro' );
	const base = read( '../layouts/Base.astro' );

	it( 'carries the phase on <html> (the no-JS / pre-paint default the head script overwrites)', () => {
		const htmlTag = markupOnly( base ).match( /<html\b[^>]*>/ )?.[ 0 ];
		expect( htmlTag ).toBeDefined();
		expect( htmlTag ).toMatch( /data-phase=/ );
	} );

	it( 'passes the default phase from the landing page into the layout', () => {
		expect( index ).toMatch( /phase=\{\s*DEFAULT_PHASE\s*\}/ );
	} );

	it( 'never puts data-phase on a body element that would shadow <html> in the cascade', () => {
		// Every element in the page markup is a descendant of <html>; none may carry its own
		// data-phase. (The head <script> assigns it via documentElement, never as markup.)
		expect( markupOnly( index ) ).not.toMatch( /data-phase=/ );
	} );

	it( 'updates the phase before first paint via documentElement', () => {
		expect( index ).toMatch( /document\.documentElement\.dataset\.phase\s*=/ );
	} );

	it( 'wraps every per-phase ancestor selector in :global() so it can match <html>', () => {
		// The phase carrier is <html> (rendered by Base.astro), which never carries index.astro's
		// scoped cid. A bare `[data-phase=...]` ancestor would be scoped to that cid and match
		// nothing; only `:global([data-phase=...])` reaches <html>. Assert that EVERY data-phase
		// selector is global-wrapped — a single scoped one silently blanks the sky.
		const style = index.match( /<style>([\s\S]*?)<\/style>/ )?.[ 1 ] ?? '';
		const total = ( style.match( /\[data-phase=/g ) ?? [] ).length;
		const global = ( style.match( /:global\(\s*\[data-phase=/g ) ?? [] ).length;
		expect( total, 'expected per-phase selectors in the landing-page styles' ).toBeGreaterThan( 0 );
		expect( global, 'every [data-phase=...] selector must be :global()-wrapped' ).toBe( total );
	} );

	// The inline head script must run before any module loads (for a no-flash sky), so it
	// can't import phaseForHour — it hand-mirrors the same hour->phase boundaries. This guard
	// keeps that copy honest: extract its `var p = <ternary>` expression straight from source
	// and assert it agrees with phaseForHour for every hour. (The source comment in
	// time-of-day.ts promises exactly this test.)
	it( 'mirrors the phaseForHour boundaries in the inline head script', () => {
		const expr = index.match( /var p\s*=\s*([\s\S]*?);/ )?.[ 1 ];
		expect( expr, 'inline head script should assign `var p = <phase ternary>;`' ).toBeDefined();
		// Lock the expression to a phase ternary over `h` before evaluating it: only the variable
		// `h`, integer literals, comparison/logical/ternary operators, and quoted phase words are
		// allowed. This makes the `new Function` below incapable of running anything else, even if
		// the source were ever changed to something unexpected.
		expect( expr, 'unexpected tokens in inline phase expression' ).toMatch(
			/^[\sa-z\d<>=|?:'"]+$/
		);
		// eslint-disable-next-line no-new-func -- expr is validated above to be a pure phase ternary.
		const scriptPhase = new Function( 'h', `return ( ${ expr } );` ) as ( h: number ) => string;
		for ( let h = 0; h < 24; h++ ) {
			expect( scriptPhase( h ), `hour ${ h }` ).toBe( phaseForHour( h ) );
		}
	} );
} );
