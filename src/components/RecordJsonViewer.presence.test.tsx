import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RecordJsonViewer from './RecordJsonViewer';

describe( 'RecordJsonViewer presence', () => {
	it( 'default-exports a component that renders the trigger button, dialog closed', () => {
		const markup = renderToStaticMarkup(
			createElement( RecordJsonViewer, {
				highlightedHtml: '<code class="hljs language-json">{}</code>',
			} )
		);
		expect( markup ).toContain( 'record-json__trigger' );
		expect( markup ).toContain( 'aria-label="View record JSON"' );
		// Closed by default — no dialog in the initial (server) render.
		expect( markup ).not.toContain( 'role="dialog"' );
	} );
} );
