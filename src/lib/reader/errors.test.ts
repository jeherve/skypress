import { describe, expect, it } from 'vitest';
import { errorScene, type ErrorKind } from './errors';

const ALL_KINDS: ErrorKind[] = [
	'writer-not-found',
	'publication-not-found',
	'article-not-found',
	'not-found',
	'server-error',
];

describe( 'errorScene', () => {
	it( 'returns 404 for every not-found kind and 500 for server-error', () => {
		expect( errorScene( 'writer-not-found' ).status ).toBe( 404 );
		expect( errorScene( 'publication-not-found' ).status ).toBe( 404 );
		expect( errorScene( 'article-not-found' ).status ).toBe( 404 );
		expect( errorScene( 'not-found' ).status ).toBe( 404 );
		expect( errorScene( 'server-error' ).status ).toBe( 500 );
	} );

	it( 'interpolates the handle into the writer-not-found copy', () => {
		const scene = errorScene( 'writer-not-found', { handle: 'jeherve.com' } );
		expect( scene.heading ).toBe( 'No writer at @jeherve.com' );
	} );

	it( 'interpolates handle + slug into the publication-not-found copy', () => {
		const scene = errorScene( 'publication-not-found', {
			handle: 'jeherve.com',
			slug: 'tribulations',
		} );
		expect( scene.subline ).toContain( '@jeherve.com' );
		expect( scene.subline ).toContain( 'tribulations' );
	} );

	it( 'interpolates the publication name into the article-not-found copy', () => {
		const scene = errorScene( 'article-not-found', {
			publicationName: 'Tribulations of a Software Engineer',
		} );
		expect( scene.subline ).toContain( 'Tribulations of a Software Engineer' );
	} );

	it( 'falls back gracefully when the article publication name is missing', () => {
		const scene = errorScene( 'article-not-found' );
		expect( scene.subline ).toContain( 'this publication' );
	} );

	it( 'keeps the horizon metaphor for the generic not-found heading', () => {
		expect( errorScene( 'not-found' ).heading ).toBe(
			'This page set below the horizon'
		);
	} );

	it( 'never emits an em dash in any copy field (house rule)', () => {
		for ( const kind of ALL_KINDS ) {
			const scene = errorScene( kind, {
				handle: 'x',
				slug: 'y',
				publicationName: 'Z',
			} );
			const text = `${ scene.eyebrow }${ scene.heading }${ scene.subline }`;
			expect( text ).not.toContain( '—' ); // em dash
		}
	} );
} );
