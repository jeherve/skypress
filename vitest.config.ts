import { defineConfig } from 'vitest/config';

export default defineConfig( {
	// @wordpress/* packages guard WordPress-only branches behind these globals.
	define: {
		'process.env.IS_GUTENBERG_PLUGIN': 'undefined',
		'process.env.IS_WORDPRESS_CORE': 'undefined',
	},
	test: {
		globals: true,
		// jsdom: @wordpress/block-library block registration touches browser globals.
		environment: 'jsdom',
		include: [ 'src/**/*.test.ts', 'src/**/*.test.tsx' ],
	},
	// Let Vite transform the @wordpress tree instead of Node's native ESM loader,
	// which rejects their attribute-less JSON imports (e.g. @wordpress/blocks'
	// `import … from './i18n-block.json'`). One inlined graph also keeps the
	// @wordpress/data + blocks store singletons consistent for the fidelity tests.
	//
	// moment / moment-timezone stay EXTERNAL (native CJS): moment-timezone augments
	// moment via `require('moment')`, which only lands on @wordpress/date's default
	// import when both resolve to Node's single CJS instance. Inlining them splits
	// that instance under Vite's interop → `moment.tz` undefined (Decision 0003).
	// The Cloudflare build still inlines moment (no native require at the edge);
	// these configs intentionally differ.
	ssr: {
		noExternal: [ /@wordpress\// ],
	},
	resolve: {
		// Mirror astro.config.mjs: collapse the multiply-nested @wordpress store
		// singletons to one copy each so they register exactly once.
		dedupe: [
			'react',
			'react-dom',
			'@wordpress/element',
			'@wordpress/data',
			'@wordpress/core-data',
			'@wordpress/notices',
			'@wordpress/date',
			'@wordpress/blocks',
			'@wordpress/block-editor',
		],
	},
} );
