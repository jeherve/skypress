import { describe, it, expect } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

import PublishedPill from './PublishedPill';

function render( props: { url: string; isEditing: boolean } ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	act( () => {
		root.render( createElement( PublishedPill, props ) );
	} );
	return {
		container,
		cleanup: () => {
			root.unmount();
			container.remove();
		},
	};
}

describe( 'PublishedPill', () => {
	it( 'shows the live copy and links to the article for a new publish', () => {
		const { container, cleanup } = render( {
			url: 'https://skypress.blog/jeherve.com/my-blog/hello',
			isEditing: false,
		} );
		expect( container.textContent ).toContain( "It's live" );
		const link = container.querySelector( 'a' )!;
		expect( link.getAttribute( 'href' ) ).toBe(
			'https://skypress.blog/jeherve.com/my-blog/hello'
		);
		expect( link.textContent ).toContain( 'Read it' );
		cleanup();
	} );

	it( 'shows the updated copy when editing', () => {
		const { container, cleanup } = render( {
			url: 'https://x',
			isEditing: true,
		} );
		expect( container.textContent ).toContain( 'Updated' );
		expect( container.textContent ).not.toContain( "It's live" );
		cleanup();
	} );
} );
