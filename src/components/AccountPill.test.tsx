import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;
import AccountPill from './AccountPill';

function mount( props: Record< string, unknown > ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	act( () => createRoot( container ).render( createElement( AccountPill, props as never ) ) );
	return container;
}

// The pill's menu is collapsed until the trigger is clicked; open it before asserting items.
const openMenu = ( container: HTMLElement ) => {
	const trigger = container.querySelector( '.account-pill__trigger' ) as HTMLButtonElement;
	act( () => trigger.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) ) );
};

describe( 'AccountPill', () => {
	it( 'shows the handle and a Manage-publications + Profile + Sign out menu', () => {
		const c = mount( {
			displayName: 'Alice', handle: 'alice.test', avatar: null, onSignOut: vi.fn(),
		} );
		expect( c.textContent ).toContain( 'alice.test' );
		openMenu( c );
		expect( c.querySelector( 'a[href="/dashboard"]' ) ).not.toBe( null );
		expect( c.querySelector( 'a[href="/@alice.test"]' ) ).not.toBe( null );
		expect( c.textContent?.toLowerCase() ).toContain( 'sign out' );
	} );

	it( 'invokes onSignOut when Sign out is clicked', () => {
		const onSignOut = vi.fn();
		const c = mount( { displayName: 'Alice', handle: 'alice.test', avatar: null, onSignOut } );
		openMenu( c );
		const btn = [ ...c.querySelectorAll( 'button' ) ].find( ( b ) => /sign out/i.test( b.textContent ?? '' ) )!;
		act( () => btn.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) ) );
		expect( onSignOut ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'omits the Profile link when no handle is known', () => {
		const c = mount( { displayName: 'did:plc:me', handle: null, avatar: null, onSignOut: vi.fn() } );
		openMenu( c );
		expect( c.querySelector( 'a[href^="/@"]' ) ).toBe( null );
	} );
} );
