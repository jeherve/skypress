// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

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
		resolve: {
			// Force a single shared instance of React and of every @wordpress store
			// singleton. core-data/notices/date are installed as multiple nested copies
			// (no hoisted top-level one); without deduping, each copy registers its store
			// at load → "Store 'core' is already registered" and a split registry.
			// Deduping collapses them to one copy in the bundle. (Decision 0021.)
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
	},
} );
