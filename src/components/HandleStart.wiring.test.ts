/**
 * Source-level wiring guard for the landing handle input. The component can't be
 * rendered through vitest (jsdom is pinned for the WordPress block suites), so we pin
 * the wiring at the source level — the same strategy as src/pages/index.phase.test.ts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve the sibling .tsx via a plain path join. `new URL( './HandleStart.tsx',
// import.meta.url )` can't be used here: vite rewrites a .tsx module URL to the dev
// server (http://localhost…), which fileURLToPath rejects. The .astro-reading guard in
// src/pages/index.phase.test.ts avoids this because vite leaves .astro URLs as file://.
const src = readFileSync(
	join( dirname( fileURLToPath( import.meta.url ) ), 'HandleStart.tsx' ),
	'utf8'
);

describe( 'HandleStart wiring', () => {
	it( 'looks the writer up via the public-AppView helper', () => {
		expect( src ).toMatch( /import \{ lookupActor.*\} from '\.\.\/lib\/landing\/actor-lookup'/ );
	} );

	it( 'debounces the lookup with a timer', () => {
		expect( src ).toMatch( /setTimeout\(/ );
		expect( src ).toMatch( /clearTimeout\(/ );
	} );

	it( 'starts sign-in through the existing OAuth client', () => {
		expect( src ).toMatch( /createOAuthClient/ );
		expect( src ).toMatch( /\.signIn\(\s*normalizeHandle\(/ );
	} );

	it( 'guards submission with isValidAccountInput so Start fails closed only on garbage', () => {
		expect( src ).toMatch( /isValidAccountInput\(/ );
	} );
} );
