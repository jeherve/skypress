import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Agent } from '@atproto/api';
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
			rkey: 'r',
			slug: 'blog',
			name: 'Blog',
			basicTheme: THEME_PRESETS[ 2 ].colors, // dusk
		};
		expect( checkedValue( renderForm( existing ) ) ).toBe( 'dusk' );
	} );
} );
