import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SubscribeGate } from './SubscribeButton';
import { AuthContext, type AuthContextValue } from '../lib/auth/AuthProvider';
import { saveSubscribeIntent, consumeSubscribeIntent } from '../lib/subscribe/intent';

( globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean } ).IS_REACT_ACT_ENVIRONMENT = true;

// Stub the agent orchestration: the gate's job is to call subscribe()/fetchSubscriptionUri()
// correctly, not to talk to a PDS.
const subs = vi.hoisted( () => ( {
	fetchSubscriptionUri: vi.fn(),
	subscribe: vi.fn(),
	unsubscribe: vi.fn(),
} ) );
vi.mock( '../lib/subscribe/subscriptions', () => subs );

const PUB = 'at://did:plc:writer/site.standard.publication/pub1';

function signedIn(): AuthContextValue {
	return {
		status: 'signed-in',
		agent: {} as never,
		did: 'did:plc:reader',
		handle: 'reader.test',
		displayName: null,
		avatar: null,
		pdsUrl: null,
		error: null,
		signIn: async () => {},
		signOut: async () => {},
	};
}

let root: Root | null = null;
let container: HTMLElement;

async function mount( auth: AuthContextValue ) {
	container = document.createElement( 'div' );
	document.body.appendChild( container );
	root = createRoot( container );
	await act( async () => {
		root!.render(
			createElement(
				AuthContext.Provider,
				{ value: auth },
				createElement( SubscribeGate, { publicationUri: PUB, publicationName: 'Pub' } )
			)
		);
	} );
	// Flush the load effect (fetchSubscriptionUri) and the auto-subscribe effect it unblocks.
	for ( let i = 0; i < 4; i++ ) {
		await act( async () => {
			await Promise.resolve();
		} );
	}
}

describe( 'SubscribeGate auto-subscribe on return', () => {
	beforeEach( () => {
		window.localStorage.clear();
		subs.fetchSubscriptionUri.mockReset().mockResolvedValue( null );
		subs.subscribe
			.mockReset()
			.mockResolvedValue( 'at://did:plc:reader/site.standard.graph.subscription/s1' );
		subs.unsubscribe.mockReset().mockResolvedValue( undefined );
	} );
	afterEach( async () => {
		await act( async () => {
			root?.unmount();
		} );
		container?.remove();
		window.localStorage.clear();
	} );

	it( 'writes the subscription and shows Subscribed when a matching intent is pending', async () => {
		saveSubscribeIntent( PUB );
		await mount( signedIn() );
		expect( subs.subscribe ).toHaveBeenCalledWith( expect.anything(), 'did:plc:reader', PUB );
		expect( container.textContent ).toContain( 'Subscribed' );
		// Intent is consumed so a later revisit doesn't silently re-subscribe.
		expect( consumeSubscribeIntent( window.localStorage ) ).toBeNull();
	} );

	it( 'ignores an intent for a different publication', async () => {
		saveSubscribeIntent( 'at://did:plc:writer/site.standard.publication/OTHER' );
		await mount( signedIn() );
		expect( subs.subscribe ).not.toHaveBeenCalled();
	} );

	it( 'does not re-subscribe when the reader is already subscribed', async () => {
		subs.fetchSubscriptionUri.mockResolvedValue(
			'at://did:plc:reader/site.standard.graph.subscription/existing'
		);
		saveSubscribeIntent( PUB );
		await mount( signedIn() );
		expect( subs.subscribe ).not.toHaveBeenCalled();
		expect( container.textContent ).toContain( 'Subscribed' );
	} );

	it( 'does nothing on a normal signed-in visit with no pending intent', async () => {
		await mount( signedIn() );
		expect( subs.subscribe ).not.toHaveBeenCalled();
		expect( container.textContent ).toContain( 'Subscribe' );
	} );
} );
