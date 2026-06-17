import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;
import SignInPanel from './SignInPanel';

function mount( props: Record< string, unknown > ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	act( () => createRoot( container ).render( createElement( SignInPanel, props as never ) ) );
	return container;
}

// React 18 tracks a controlled input's value via a private setter; assigning `.value`
// directly then dispatching `input` is invisible to React and onChange never fires. Set
// through the native prototype setter so React's tracker sees the change (standard idiom).
const setInputValue = ( input: HTMLInputElement, value: string ) => {
	const setter = Object.getOwnPropertyDescriptor(
		window.HTMLInputElement.prototype,
		'value'
	)!.set!;
	setter.call( input, value );
};

describe( 'SignInPanel', () => {
	it( 'for-publish variant frames the CTA around publishing and links out to signup in a new tab', () => {
		const c = mount( { forPublish: true, error: null, onSubmit: vi.fn() } );
		expect( c.textContent?.toLowerCase() ).toContain( 'publish' );
		const signup = c.querySelector( 'a[href*="bsky.app"]' ) as HTMLAnchorElement | null;
		expect( signup ).not.toBe( null );
		// Opens in a new tab, hardened, and labelled so the new-tab behaviour is announced.
		expect( signup!.target ).toBe( '_blank' );
		expect( signup!.rel ).toContain( 'noopener' );
		expect( signup!.getAttribute( 'aria-label' )?.toLowerCase() ).toContain( 'new tab' );
		// Carries the usual external-link icon (not a bare "→").
		expect( signup!.querySelector( 'svg' ) ).not.toBe( null );
		expect( signup!.textContent ).not.toContain( '→' );
	} );

	it( 'submits the typed handle', () => {
		const onSubmit = vi.fn();
		const c = mount( { forPublish: false, error: null, onSubmit } );
		const input = c.querySelector( 'input' )!;
		const form = c.querySelector( 'form' )!;
		act( () => {
			setInputValue( input as HTMLInputElement, 'alice.bsky.social' );
			input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		} );
		act( () => form.dispatchEvent( new Event( 'submit', { bubbles: true, cancelable: true } ) ) );
		expect( onSubmit ).toHaveBeenCalledWith( 'alice.bsky.social' );
	} );

	it( 'shows an error when provided', () => {
		const c = mount( { forPublish: false, error: 'Bad handle', onSubmit: vi.fn() } );
		expect( c.textContent ).toContain( 'Bad handle' );
	} );
} );
