import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProviderLogo from './ProviderLogo';

describe( 'ProviderLogo', () => {
	it( 'renders nothing when the provider is null', () => {
		expect( renderToStaticMarkup( createElement( ProviderLogo, { provider: null } ) ) ).toBe( '' );
	} );

	it( "renders the provider's labelled svg glyph", () => {
		const html = renderToStaticMarkup( createElement( ProviderLogo, { provider: 'leaflet' } ) );
		expect( html ).toContain( '<svg' );
		expect( html ).toContain( 'aria-label="Leaflet"' );
		expect( html ).toContain( 'role="img"' );
		expect( html ).toContain( 'currentColor' );
	} );
} );
