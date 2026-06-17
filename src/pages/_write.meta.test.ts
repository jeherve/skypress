import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read the page source off disk. We resolve via `fileURLToPath` + `join` rather
// than handing a `URL` straight to `readFileSync` because, under this repo's
// Astro/Vite-backed Vitest, the global `URL` resolves a relative specifier
// against the test module to an `http://localhost` dev-server URL (not `file:`),
// which `readFileSync` rejects. This mirrors the sibling `_*.meta.test.ts` pages.
const here = dirname( fileURLToPath( import.meta.url ) );
const src = readFileSync( join( here, './write.astro' ), 'utf8' );

describe( '/write route', () => {
	it( 'mounts WriteStudio as a client:only island', () => {
		expect( src ).toContain( "import WriteStudio from '../components/WriteStudio.tsx'" );
		expect( src ).toMatch( /<WriteStudio\s+client:only="react"/ );
	} );

	it( 'ships a writing-focused title and the write chrome styles', () => {
		expect( src ).toMatch( /<Base title="Write[^"]*"/ );
		expect( src ).toContain( "import '../styles/write-chrome.css'" );
	} );
} );
