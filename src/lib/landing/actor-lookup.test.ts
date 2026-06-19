import { describe, expect, it, vi } from 'vitest';
import { lookupActor, searchActors } from './actor-lookup';

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

describe( 'searchActors', () => {
	it( 'returns multiple previews for a partial query', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			ok( {
				actors: [
					{
						did: 'did:plc:abc',
						handle: 'riad.blog',
						displayName: 'Riad',
						avatar: 'https://cdn.example/r.jpg',
					},
					{
						did: 'did:plc:def',
						handle: 'rianna.bsky.social',
						displayName: 'Rianna',
						avatar: null,
					},
				],
			} )
		);
		const results = await searchActors( 'ria', fetchImpl as unknown as typeof fetch );
		expect( results ).toEqual( [
			{
				did: 'did:plc:abc',
				handle: 'riad.blog',
				displayName: 'Riad',
				avatar: 'https://cdn.example/r.jpg',
			},
			{
				did: 'did:plc:def',
				handle: 'rianna.bsky.social',
				displayName: 'Rianna',
				avatar: null,
			},
		] );
	} );

	it( 'hits the typeahead endpoint with an encoded query and a limit', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( ok( { actors: [] } ) );
		await searchActors( 'a b', fetchImpl as unknown as typeof fetch, 6 );
		expect( fetchImpl ).toHaveBeenCalledWith(
			'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=a%20b&limit=6'
		);
	} );

	it( 'maps missing displayName and avatar to null', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			ok( { actors: [ { did: 'did:plc:abc', handle: 'riad.blog' } ] } )
		);
		const results = await searchActors( 'ria', fetchImpl as unknown as typeof fetch );
		expect( results ).toEqual( [
			{ did: 'did:plc:abc', handle: 'riad.blog', displayName: null, avatar: null },
		] );
	} );

	it( 'drops actors missing a did or handle', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			ok( {
				actors: [
					{ did: 'did:plc:abc', handle: 'riad.blog' },
					{ handle: 'nohandle-did.test' },
					{ did: 'did:plc:nohandle' },
				],
			} )
		);
		const results = await searchActors( 'ria', fetchImpl as unknown as typeof fetch );
		expect( results ).toEqual( [
			{ did: 'did:plc:abc', handle: 'riad.blog', displayName: null, avatar: null },
		] );
	} );

	it( 'returns [] without fetching for an empty or whitespace query', async () => {
		const fetchImpl = vi.fn();
		expect( await searchActors( '', fetchImpl as unknown as typeof fetch ) ).toEqual( [] );
		expect( await searchActors( '   ', fetchImpl as unknown as typeof fetch ) ).toEqual( [] );
		expect( fetchImpl ).not.toHaveBeenCalled();
	} );

	it( 'returns [] on a non-ok response', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( notOk() );
		expect( await searchActors( 'ria', fetchImpl as unknown as typeof fetch ) ).toEqual( [] );
	} );

	it( 'returns [] when the network throws', async () => {
		const fetchImpl = vi.fn().mockRejectedValue( new Error( 'offline' ) );
		expect( await searchActors( 'ria', fetchImpl as unknown as typeof fetch ) ).toEqual( [] );
	} );

	it( 'returns [] when the body has no actors array', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( ok( {} ) );
		expect( await searchActors( 'ria', fetchImpl as unknown as typeof fetch ) ).toEqual( [] );
	} );
} );
