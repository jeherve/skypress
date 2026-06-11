import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import RecordJsonViewer from './RecordJsonViewer';

// react-dom/client + act need this flag so React treats vitest's jsdom as a test env.
( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

const HTML =
	'<code class="hljs language-json"><span class="hljs-attr">"title"</span>: <span class="hljs-string">"Hi"</span></code>';

let container: HTMLDivElement;
let root: Root;

async function mount() {
	container = document.createElement( 'div' );
	document.body.appendChild( container );
	root = createRoot( container );
	await act( async () => {
		root.render( createElement( RecordJsonViewer, { highlightedHtml: HTML } ) );
	} );
}

afterEach( () => {
	act( () => root.unmount() );
	container.remove();
} );

const trigger = () => container.querySelector( '.record-json__trigger' ) as HTMLButtonElement;
const dialog = () => document.querySelector( '[role="dialog"]' );

describe( 'RecordJsonViewer interaction', () => {
	it( 'renders a labelled trigger and no dialog initially', async () => {
		await mount();
		expect( trigger() ).not.toBeNull();
		expect( trigger().getAttribute( 'aria-label' ) ).toBe( 'View record JSON' );
		expect( dialog() ).toBeNull();
	} );

	it( 'opens the dialog with the highlighted JSON on click', async () => {
		await mount();
		await act( async () => {
			trigger().click();
		} );
		expect( dialog() ).not.toBeNull();
		expect( dialog()!.innerHTML ).toContain( 'hljs-string' );
	} );

	it( 'closes via the close button and restores focus to the trigger', async () => {
		await mount();
		await act( async () => {
			trigger().click();
		} );
		const closeBtn = document.querySelector( '.record-json__close' ) as HTMLButtonElement;
		await act( async () => {
			closeBtn.click();
		} );
		expect( dialog() ).toBeNull();
		expect( document.activeElement ).toBe( trigger() );
	} );

	it( 'closes when the backdrop is clicked', async () => {
		await mount();
		await act( async () => {
			trigger().click();
		} );
		const backdrop = document.querySelector( '.record-json__backdrop' ) as HTMLElement;
		await act( async () => {
			backdrop.click();
		} );
		expect( dialog() ).toBeNull();
	} );

	it( 'closes on Escape', async () => {
		await mount();
		await act( async () => {
			trigger().click();
		} );
		await act( async () => {
			document.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Escape' } ) );
		} );
		expect( dialog() ).toBeNull();
	} );
} );
