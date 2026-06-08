// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

const nodeModules = fileURLToPath( new URL( './node_modules', import.meta.url ) );

// Static by default; the article/homepage routes render on demand (read-through
// renderer, SP4). Deployed to Cloudflare Pages (SP7). `nodejs_compat` (set in
// wrangler.toml) lets sanitize-html's Node-style deps run on the edge.
export default defineConfig( {
	// Public origin. Override with PUBLIC_SITE_URL when self-hosting (see README / .env.example).
	site: process.env.PUBLIC_SITE_URL || 'https://skypress.blog',
	adapter: cloudflare(),
	// SkyPress doesn't use Astro server sessions (auth is a browser OAuth client).
	// A no-binding in-memory driver stops the adapter requiring a Cloudflare KV
	// namespace, keeping the no-database goal (brief §2). Never used at runtime.
	session: { driver: 'memory' },
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
