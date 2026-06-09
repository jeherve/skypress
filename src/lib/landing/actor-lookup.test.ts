import { describe, expect, it, vi } from 'vitest';
import { lookupActor } from './actor-lookup';

const ok = ( body: unknown ) =>
	( { ok: true, json: async () => body } ) as unknown as Response;
const notOk = () => ( { ok: false, json: async () => ( {} ) } ) as unknown as Response;

describe( 'lookupActor', () => {
	it( 'returns a preview for a resolvable handle', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			ok( {
				did: 'did:plc:abc',
				handle: 'alice.bsky.social',
				displayName: 'Alice Rivers',
				avatar: 'https://cdn.example/a.jpg',
			} )
		);
		const preview = await lookupActor( '@Alice.bsky.social', fetchImpl as unknown as typeof fetch );
		expect( preview ).toEqual( {
			did: 'did:plc:abc',
			handle: 'alice.bsky.social',
			displayName: 'Alice Rivers',
			avatar: 'https://cdn.example/a.jpg',
		} );
		expect( fetchImpl ).toHaveBeenCalledWith(
			'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=alice.bsky.social'
		);
	} );

	it( 'passes a DID through untouched', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( ok( { did: 'did:plc:xyz', handle: 'x.test' } ) );
		await lookupActor( 'did:plc:xyz', fetchImpl as unknown as typeof fetch );
		expect( fetchImpl ).toHaveBeenCalledWith(
			'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=did%3Aplc%3Axyz'
		);
	} );

	it( 'returns null without fetching for syntactically invalid input', async () => {
		const fetchImpl = vi.fn();
		expect( await lookupActor( 'notahandle', fetchImpl as unknown as typeof fetch ) ).toBeNull();
		expect( await lookupActor( '   ', fetchImpl as unknown as typeof fetch ) ).toBeNull();
		expect( fetchImpl ).not.toHaveBeenCalled();
	} );

	it( 'returns null on a non-ok response', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( notOk() );
		expect( await lookupActor( 'ghost.bsky.social', fetchImpl as unknown as typeof fetch ) ).toBeNull();
	} );

	it( 'returns null when the network throws', async () => {
		const fetchImpl = vi.fn().mockRejectedValue( new Error( 'offline' ) );
		expect( await lookupActor( 'alice.bsky.social', fetchImpl as unknown as typeof fetch ) ).toBeNull();
	} );

	it( 'returns null when the body has no did', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( ok( { handle: 'x.test' } ) );
		expect( await lookupActor( 'x.test', fetchImpl as unknown as typeof fetch ) ).toBeNull();
	} );
} );
