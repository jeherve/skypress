import { describe, expect, it } from 'vitest';
import { applyFilters } from '@wordpress/hooks';
// Side-effect import: registers the editor.MediaUpload override.
import './registerMediaUpload';

describe( 'registerMediaUpload', () => {
	it( 'replaces editor.MediaUpload with an inert, non-rendering component', () => {
		// A stand-in for whatever component was registered before us (in the app, the
		// wp.media-based one from isolated-block-editor).
		const Bundled = () => 'wp.media frame';
		const Filtered = applyFilters( 'editor.MediaUpload', Bundled ) as () => unknown;

		expect( Filtered ).not.toBe( Bundled );
		// Renders nothing → no "Media Library" button, no wp.media access.
		expect( Filtered() ).toBeNull();
	} );
} );
