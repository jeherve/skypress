import { defineConfig } from 'vitest/config';

export default defineConfig( {
	test: {
		globals: true,
		// jsdom: @wordpress/block-library block registration touches browser globals.
		environment: 'jsdom',
		include: [ 'src/**/*.test.ts' ],
	},
	resolve: {
		dedupe: [ 'react', 'react-dom', '@wordpress/element' ],
	},
} );
