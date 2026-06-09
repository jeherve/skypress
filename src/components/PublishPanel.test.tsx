import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Agent } from '@atproto/api';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

// The publish button's onClick fires `run()` fire-and-forget, so the resulting state
// updates (setPhase('working') → awaited updateDocument → setPhase('done')) are flushed
// by React's scheduler on a detached task AFTER the dispatching act() returns. With raw
// react-dom (no @testing-library/react fireEvent to patch the dispatch into act's queue),
// no amount of act()-wrapping can adopt that detached commit, so React logs a benign
// "not wrapped in act(...)" warning. The assertion below only reads the synchronously
// captured mock call args, so the warning is noise — filter just this one message to keep
// the test output clean while letting every other console.error through.
const ACT_WARNING = 'not wrapped in act';
let restoreConsoleError: ( () => void ) | undefined;
beforeEach( () => {
	const original = console.error;
	const spy = vi
		.spyOn( console, 'error' )
		.mockImplementation( ( ...args: Parameters< typeof console.error > ) => {
			if ( typeof args[ 0 ] === 'string' && args[ 0 ].includes( ACT_WARNING ) ) {
				return;
			}
			original( ...args );
		} );
	restoreConsoleError = () => spy.mockRestore();
} );
afterEach( () => {
	restoreConsoleError?.();
} );

// Hoist the mock fns so vi.mock (which is hoisted) can reference them safely.
const { updateDocument, publish } = vi.hoisted( () => {
	return {
		updateDocument: vi.fn( async () => ( { documentUri: 'at://x', articleUrl: 'https://x' } ) ),
		publish: vi.fn( async () => ( {
			publicationUri: 'at://p',
			documentUri: 'at://d',
			postUri: 'at://post',
			articleUrl: 'https://x',
		} ) ),
	};
} );

// Mock the publish layer so we can assert what PublishPanel forwards.
vi.mock( '../lib/publish/publisher', () => ( { publish, updateDocument } ) );

import PublishPanel from './PublishPanel';

const EDITING = {
	rkey: '3kdoc',
	siteUri: 'at://did:plc:me/site.standard.publication/pub1',
	siteSlug: 'my-blog',
	publishedAt: '2026-06-08T00:00:00.000Z',
};

beforeEach( () => {
	updateDocument.mockClear();
	publish.mockClear();
} );

async function clickUpdate( description: string ) {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	await act( async () => {
		root.render(
			createElement( PublishPanel, {
				agent: {} as Agent,
				identity: { did: 'did:plc:me', handle: 'me.test' },
				blocks: [ { name: 'core/paragraph', attributes: { content: 'Body' }, innerBlocks: [] } ] as never,
				blobRegistry: new Map(),
				publications: [],
				editing: EDITING,
				title: 'A title',
				description,
			} )
		);
	} );
	const button = Array.from( container.querySelectorAll( 'button' ) ).find(
		( b ) => b.textContent === 'Update'
	)!;
	await act( async () => {
		button.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) );
	} );
	// Let the async run() chain (setPhase('done')/onComplete) settle inside act.
	await act( async () => {} );
	root.unmount();
	container.remove();
}

describe( 'PublishPanel', () => {
	it( 'forwards the lede to updateDocument as description', async () => {
		await clickUpdate( 'My hand-written lede' );
		expect( updateDocument ).toHaveBeenCalledTimes( 1 );
		expect( updateDocument.mock.calls[ 0 ][ 2 ] ).toMatchObject( {
			description: 'My hand-written lede',
		} );
	} );
} );
