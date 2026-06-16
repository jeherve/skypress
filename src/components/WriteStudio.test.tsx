// src/components/WriteStudio.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

// Stub the heavy editor: render a marker, ignore props.
vi.mock( './SkyEditor', () => ( { default: () => createElement( 'div', { 'data-testid': 'sky-editor' } ) } ) );
// Stub AppBar to avoid pulling chrome we don't assert on.
vi.mock( './AppBar', () => ( { default: () => null } ) );

const auth = vi.hoisted( () => ( { value: {} as Record< string, unknown > } ) );
vi.mock( '../lib/auth/AuthProvider', () => ( {
	AuthProvider: ( { children }: { children: unknown } ) => children,
} ) );
vi.mock( '../lib/auth/useAuth', () => ( { useAuth: () => auth.value } ) );

const draft = vi.hoisted( () => ( {
	store: {
		load: vi.fn( async () => null ),
		save: vi.fn( async () => {} ),
		clear: vi.fn( async () => {} ),
		setPublishIntent: vi.fn(),
		consumePublishIntent: vi.fn( () => false ),
	},
} ) );
vi.mock( '../lib/write/draft-store', () => ( {
	createDraftStore: () => draft.store,
} ) );
vi.mock( '../lib/publish/publications', () => ( {
	listPublications: vi.fn( async () => [] ),
} ) );

import WriteStudio from './WriteStudio';

function render() {
	const container = document.createElement( 'div' );
	document.body.appendChild( container );
	const root = createRoot( container );
	return { container, root };
}

beforeEach( () => {
	draft.store.consumePublishIntent.mockReturnValue( false );
	draft.store.load.mockResolvedValue( null );
} );

describe( 'WriteStudio', () => {
	it( 'signed out: renders the editor AND a sign-in affordance (no gate)', async () => {
		auth.value = { status: 'signed-out', agent: null, did: null, handle: null, signIn: vi.fn(), signOut: vi.fn() };
		const { container, root } = render();
		await act( async () => {
			root.render( createElement( WriteStudio ) );
		} );
		expect( container.querySelector( '[data-testid="sky-editor"]' ) ).not.toBe( null );
		expect( container.textContent?.toLowerCase() ).toContain( 'sign in' );
	} );

	it( 'signed in: renders the editor AND the account pill', async () => {
		auth.value = {
			status: 'signed-in', agent: {}, did: 'did:plc:me', handle: 'me.test',
			displayName: 'Me', avatar: null, pdsUrl: 'https://pds', signIn: vi.fn(), signOut: vi.fn(),
		};
		const { container, root } = render();
		await act( async () => {
			root.render( createElement( WriteStudio ) );
		} );
		expect( container.querySelector( '[data-testid="sky-editor"]' ) ).not.toBe( null );
		expect( container.querySelector( '.account-pill' ) ).not.toBe( null );
	} );

	it( 'resume: a publish intent on a signed-in load opens the publish flow', async () => {
		draft.store.consumePublishIntent.mockReturnValue( true );
		auth.value = {
			status: 'signed-in', agent: {}, did: 'did:plc:me', handle: 'me.test',
			displayName: 'Me', avatar: null, pdsUrl: 'https://pds', signIn: vi.fn(), signOut: vi.fn(),
		};
		const { container, root } = render();
		await act( async () => {
			root.render( createElement( WriteStudio ) );
		} );
		expect( container.querySelector( '.writeflow' ) ).not.toBe( null );
	} );
} );
