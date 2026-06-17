import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

// Stub the heavy/irrelevant children with markers.
vi.mock( './SkyEditor', () => ( {
	default: () => createElement( 'div', { 'data-testid': 'sky-editor' } ),
} ) );
vi.mock( './CoverImagePicker', () => ( {
	default: () => createElement( 'div', { 'data-testid': 'cover-picker' } ),
} ) );

import EditorCanvas from './EditorCanvas';

const base = {
	title: '',
	onTitleChange: vi.fn(),
	lede: '',
	onLedeChange: vi.fn(),
	onBlocksChange: vi.fn(),
	cover: null,
	onCoverChange: vi.fn(),
};

function mount( props: Record< string, unknown > ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	act( () => createRoot( container ).render( createElement( EditorCanvas, { ...base, ...props } as never ) ) );
	return container;
}

// React 18 tracks a controlled value via a prototype setter; a direct `el.value = …`
// is invisible to it, so set through the native setter to make onChange fire.
function setValue( el: HTMLTextAreaElement, val: string ) {
	const proto = Object.getPrototypeOf( el );
	Object.getOwnPropertyDescriptor( proto, 'value' )!.set!.call( el, val );
	el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
}

describe( 'EditorCanvas', () => {
	it( 'renders the title + lede fields and the block editor', () => {
		const c = mount( {} );
		expect( c.querySelector( 'textarea.studio__title' ) ).not.toBe( null );
		expect( c.querySelector( 'textarea.studio__lede' ) ).not.toBe( null );
		expect( c.querySelector( '[data-testid="sky-editor"]' ) ).not.toBe( null );
	} );

	it( 'reports title and lede edits to the parent', () => {
		const onTitleChange = vi.fn();
		const onLedeChange = vi.fn();
		const c = mount( { onTitleChange, onLedeChange } );
		setValue( c.querySelector( 'textarea.studio__title' )!, 'My title' );
		setValue( c.querySelector( 'textarea.studio__lede' )!, 'My lede' );
		expect( onTitleChange ).toHaveBeenCalledWith( 'My title' );
		expect( onLedeChange ).toHaveBeenCalledWith( 'My lede' );
	} );

	it( 'shows the Bluesky-truncation hint only for a long lede', () => {
		expect( mount( { lede: 'short' } ).querySelector( '.studio__lede-hint' ) ).toBe( null );
		expect( mount( { lede: 'x'.repeat( 201 ) } ).querySelector( '.studio__lede-hint' ) ).not.toBe( null );
	} );

	it( 'shows the cover picker only when an upload handler is provided', () => {
		expect( mount( {} ).querySelector( '[data-testid="cover-picker"]' ) ).toBe( null );
		expect(
			mount( { onCoverUpload: vi.fn() } ).querySelector( '[data-testid="cover-picker"]' )
		).not.toBe( null );
	} );
} );
