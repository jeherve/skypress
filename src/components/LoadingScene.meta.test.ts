/**
 * Source-level guard for the client:only island loading fallback.
 *
 * `dashboard.astro` and `editor.astro` mount browser-only React islands
 * (`client:only`). Until their JS bundle loads, Astro shows the `slot="fallback"`
 * markup. That fallback must carry the durable page chrome — a logo-only header
 * (matching AppBar's `status === 'loading'` state) plus a content skeleton — so
 * the page has shape before hydration instead of a bare, left-aligned "Loading…".
 *
 * Rendering the pages through astro/container isn't viable here (the runner is
 * pinned to jsdom for the WordPress block suites), so these assertions pin the
 * wiring at the source level — same approach as `_index.phase.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = ( rel: string ) =>
	readFileSync( fileURLToPath( new URL( rel, import.meta.url ) ), 'utf8' );

describe( 'LoadingScene fallback', () => {
	const scene = read( './LoadingScene.astro' );

	it( 'renders the durable logo header using the shared app-bar classes', () => {
		expect( scene ).toMatch( /class="app-bar"/ );
		expect( scene ).toMatch( /class="app-bar__home"/ );
		expect( scene ).toMatch( /class="app-bar__word"/ );
		expect( scene ).toMatch( /SkyPress/ );
	} );

	it( 'omits the dynamic nav + identity (auth state is unknown pre-hydration)', () => {
		expect( scene ).not.toMatch( /app-bar__nav/ );
		expect( scene ).not.toMatch( /app-bar__identity/ );
		expect( scene ).not.toMatch( /app-bar__signout/ );
	} );

	it( 'renders shimmering skeleton placeholders', () => {
		expect( scene ).toMatch( /class="sk\b/ );
		expect( scene ).toMatch( /@keyframes/ );
	} );

	it( 'flags the region as busy and keeps an accessible loading label', () => {
		expect( scene ).toMatch( /aria-busy="true"/ );
		expect( scene ).toMatch( /Loading…/ );
	} );

	it( 'stills the shimmer for reduced-motion users', () => {
		expect( scene ).toMatch( /prefers-reduced-motion/ );
	} );

	it( 'offers distinct dashboard and editor variants', () => {
		expect( scene ).toMatch( /'dashboard'\s*\|\s*'editor'/ );
		expect( scene ).toMatch( /variant === 'dashboard'/ );
	} );
} );

describe( 'island fallbacks use LoadingScene', () => {
	const dashboard = read( '../pages/dashboard.astro' );
	const editor = read( '../pages/editor.astro' );

	it( 'dashboard fallback renders LoadingScene, not a bare "Loading…"', () => {
		expect( dashboard ).toMatch( /import LoadingScene from '[^']*LoadingScene.astro'/ );
		expect( dashboard ).toMatch( /<LoadingScene[\s\S]*?slot="fallback"/ );
		expect( dashboard ).toMatch( /variant="dashboard"/ );
		expect( dashboard ).not.toMatch( /class="dash__loading">Loading…/ );
	} );

	it( 'editor fallback renders LoadingScene, not a bare "Loading…"', () => {
		expect( editor ).toMatch( /import LoadingScene from '[^']*LoadingScene.astro'/ );
		expect( editor ).toMatch( /<LoadingScene[\s\S]*?slot="fallback"/ );
		expect( editor ).toMatch( /variant="editor"/ );
		expect( editor ).not.toMatch( /class="editor-shell__loading">Loading…/ );
	} );
} );
