// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';

const nodeModules = fileURLToPath( new URL( './node_modules', import.meta.url ) );

// SP0: static build, no host adapter yet (added in SP7). The editor runs as a
// client-only React island; public pages render to light HTML at build time.
export default defineConfig( {
	integrations: [ react() ],
	vite: {
		// React 18 is required by the bundled @wordpress/* packages (Decision 0001).
		// Force a single React instance shared between the app and the editor.
		resolve: {
			// React 18 is required by the bundled @wordpress/* packages (Decision 0001).
			// Force a single shared instance of React and the WP store registry.
			dedupe: [ 'react', 'react-dom', '@wordpress/element', '@wordpress/data' ],
		},
		// @wordpress/* packages expect these globals to exist at bundle time.
		define: {
			'process.env.IS_GUTENBERG_PLUGIN': 'undefined',
			'process.env.IS_WORDPRESS_CORE': 'undefined',
		},
		ssr: {
			// Bundle (don't externalize) the WordPress packages for SSR. Externalized,
			// `@wordpress/date`'s moment-timezone side-effect import fails to augment
			// moment (CJS/ESM interop) and crashes at load. Bundling resolves it — the
			// same reason it works under Vitest. (Decision 0003.)
			noExternal: [ /^@wordpress\//, /^moment/, 'clsx', 'tslib' ],
		},
		css: {
			preprocessorOptions: {
				scss: {
					// isolated-block-editor's style.scss does `@import '@wordpress/base-styles/...'`.
					// Bare specifiers only resolve when node_modules is on the Sass load path.
					loadPaths: [ nodeModules ],
					quietDeps: true,
					silenceDeprecations: [
						'import',
						'global-builtin',
						'color-functions',
						'legacy-js-api',
						'slash-div',
						'mixed-decls',
					],
				},
			},
		},
	},
} );
