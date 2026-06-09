import { describe, it, expect } from 'vitest';
import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import type { Agent } from '@atproto/api';

// react-dom/client + act need this flag so React treats vitest's jsdom as a test environment.
( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;
import PublicationForm from './PublicationForm';
import { THEME_PRESETS } from '../lib/publish/themes';
import type { Publication } from '../lib/publish/publications';

const baseProps = {
	agent: {} as Agent,
	did: 'did:plc:alice',
	pdsUrl: null,
	handle: 'alice.test',
	onSaved: () => {},
	onCancel: () => {},
};

function renderForm( existing?: Publication ): string {
	return renderToStaticMarkup( createElement( PublicationForm, { ...baseProps, existing } ) );
}

/** Every `<input type="radio">` tag in the markup. */
function radios( markup: string ): string[] {
	return markup.match( /<input[^>]*type="radio"[^>]*>/g ) ?? [];
}

/** The `value=""` of the single checked radio, or null. */
function checkedValue( markup: string ): string | null {
	const checked = radios( markup ).find( ( tag ) => /\schecked\b/.test( tag ) );
	if ( ! checked ) {
		return null;
	}
	return checked.match( /value="([^"]*)"/ )?.[ 1 ] ?? null;
}

describe( 'PublicationForm theme picker', () => {
	it( 'renders a "no theme" option plus every preset as radios in one group', () => {
		const markup = renderForm();
		expect( markup ).toContain( 'role="radiogroup"' );
		expect( markup ).toContain( 'aria-label="Theme"' );
		expect( radios( markup ) ).toHaveLength( THEME_PRESETS.length + 1 );
		for ( const preset of THEME_PRESETS ) {
			expect( markup ).toContain( `value="${ preset.slug }"` );
			expect( markup ).toContain( preset.label );
		}
	} );

	it( 'defaults a new publication to "no theme" (empty value checked)', () => {
		expect( checkedValue( renderForm() ) ).toBe( '' );
	} );

	it( 'pre-selects the matching preset when editing a themed publication', () => {
		const existing: Publication = {
			uri: 'at://x',
			cid: 'bafyx',
			rkey: 'r',
			slug: 'blog',
			name: 'Blog',
			basicTheme: THEME_PRESETS[ 2 ].colors, // dusk
		};
		expect( checkedValue( renderForm( existing ) ) ).toBe( 'dusk' );
	} );

	it( 'surfaces and pre-selects a "Current" option when the stored theme matches no preset', () => {
		// A valid theme whose colours match no preset (e.g. a preset whose values later changed).
		// It must remain visible + selected so an unrelated edit doesn't silently erase it.
		const existing: Publication = {
			uri: 'at://x',
			cid: 'bafyx',
			rkey: 'r',
			slug: 'blog',
			name: 'Blog',
			basicTheme: {
				$type: 'site.standard.theme.basic',
				background: { r: 10, g: 20, b: 30 },
				foreground: { r: 240, g: 240, b: 240 },
				accent: { r: 100, g: 50, b: 200 },
				accentForeground: { r: 255, g: 255, b: 255 },
			},
		};
		const markup = renderForm( existing );
		expect( markup ).toContain( 'Current' );
		expect( radios( markup ) ).toHaveLength( THEME_PRESETS.length + 2 ); // none + custom + presets
		expect( checkedValue( markup ) ).toBe( 'custom' );
	} );

	it( 'shows no "Current" option for an unthemed publication', () => {
		const existing: Publication = { uri: 'at://x', cid: 'bafyx', rkey: 'r', slug: 'blog', name: 'Blog' };
		const markup = renderForm( existing );
		expect( radios( markup ) ).toHaveLength( THEME_PRESETS.length + 1 );
		expect( checkedValue( markup ) ).toBe( '' );
	} );
} );

describe( 'PublicationForm save lifecycle', () => {
	it( 'clears the "Saving…" state after a successful save even when the form stays mounted', async () => {
		// The Settings tab keeps the SAME PublicationForm instance mounted across a save:
		// onSaved just re-renders the manager on the same tab, so the form never unmounts.
		// onSubmit must therefore reset `saving` on the success path — relying on unmount left
		// the button stuck on "Saving…" forever despite the PDS returning 200 (the reported bug).
		const existing: Publication = {
			uri: 'at://did:plc:alice/site.standard.publication/abc',
			rkey: 'abc',
			slug: 'blog',
			name: 'Blog',
		};
		let resolvePut: ( ( value: unknown ) => void ) | null = null;
		const agent = {
			com: {
				atproto: {
					repo: {
						putRecord: () =>
							new Promise( ( resolve ) => {
								resolvePut = resolve;
							} ),
					},
				},
			},
		} as unknown as Agent;

		const container = document.createElement( 'div' );
		document.body.appendChild( container );
		const root = createRoot( container );
		await act( async () => {
			root.render(
				createElement( PublicationForm, { ...baseProps, agent, existing, onSaved: () => {} } )
			);
		} );

		const form = container.querySelector( 'form' ) as HTMLFormElement;
		const button = container.querySelector( '.pubform__save' ) as HTMLButtonElement;
		expect( button.textContent ).toBe( 'Save changes' );

		await act( async () => {
			form.dispatchEvent( new Event( 'submit', { bubbles: true, cancelable: true } ) );
		} );
		expect( button.textContent ).toBe( 'Saving…' );
		expect( button.disabled ).toBe( true );

		// The PDS write resolves (the 200 the user saw). The button must return to normal.
		// Flush the whole async chain (putRecord resolve → updatePublication resolve → onSubmit
		// continuation → setSaving) inside act. A macrotask drains every queued microtask first,
		// so the setSaving update lands inside the act() scope rather than escaping it.
		await act( async () => {
			resolvePut?.( { data: {} } );
			await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
		} );
		expect( button.textContent ).toBe( 'Save changes' );
		expect( button.disabled ).toBe( false );

		await act( async () => {
			root.unmount();
		} );
		container.remove();
	} );
} );
