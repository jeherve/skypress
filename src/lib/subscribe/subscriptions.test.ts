import { describe, expect, it, vi } from 'vitest';
import { subscribe, unsubscribe, fetchSubscriptionUri } from './subscriptions';

const DID = 'did:plc:reader';
const PUB_URI = 'at://did:plc:writer/site.standard.publication/3kpub';
const OTHER_PUB = 'at://did:plc:writer/site.standard.publication/3kother';

function mockAgent( records: Array< { uri: string; value: unknown } > = [] ) {
	const createRecord = vi.fn( async () => ( {
		data: { uri: 'at://did:plc:reader/site.standard.graph.subscription/3knew', cid: 'bafynew' },
	} ) );
	const deleteRecord = vi.fn( async () => ( {} ) );
	const listRecords = vi.fn( async () => ( { data: { records } } ) );
	return {
		com: { atproto: { repo: { createRecord, deleteRecord, listRecords } } },
		_spies: { createRecord, deleteRecord, listRecords },
	} as never;
}

function spies( agent: unknown ) {
	return ( agent as { _spies: Record< string, ReturnType< typeof vi.fn > > } )._spies;
}

describe( 'subscribe', () => {
	it( 'creates a site.standard.graph.subscription in the reader repo and returns its uri', async () => {
		const agent = mockAgent();
		const uri = await subscribe( agent, DID, PUB_URI );
		const { createRecord } = spies( agent );
		expect( createRecord ).toHaveBeenCalledTimes( 1 );
		const arg = createRecord.mock.calls[ 0 ][ 0 ];
		expect( arg.repo ).toBe( DID );
		expect( arg.collection ).toBe( 'site.standard.graph.subscription' );
		expect( arg.record.$type ).toBe( 'site.standard.graph.subscription' );
		expect( arg.record.publication ).toBe( PUB_URI );
		expect( typeof arg.record.createdAt ).toBe( 'string' );
		expect( uri ).toBe( 'at://did:plc:reader/site.standard.graph.subscription/3knew' );
	} );
} );

describe( 'unsubscribe', () => {
	it( 'deletes the subscription record by rkey parsed from its uri', async () => {
		const agent = mockAgent();
		await unsubscribe( agent, DID, 'at://did:plc:reader/site.standard.graph.subscription/3kold' );
		const { deleteRecord } = spies( agent );
		expect( deleteRecord ).toHaveBeenCalledWith( {
			repo: DID,
			collection: 'site.standard.graph.subscription',
			rkey: '3kold',
		} );
	} );
} );

describe( 'fetchSubscriptionUri', () => {
	it( 'returns the matching subscription record uri for the publication', async () => {
		const agent = mockAgent( [
			{ uri: 'at://did:plc:reader/site.standard.graph.subscription/3ka', value: { publication: OTHER_PUB } },
			{ uri: 'at://did:plc:reader/site.standard.graph.subscription/3kb', value: { publication: PUB_URI } },
		] );
		const uri = await fetchSubscriptionUri( agent, DID, PUB_URI );
		expect( uri ).toBe( 'at://did:plc:reader/site.standard.graph.subscription/3kb' );
		const { listRecords } = spies( agent );
		expect( listRecords.mock.calls[ 0 ][ 0 ] ).toMatchObject( {
			repo: DID,
			collection: 'site.standard.graph.subscription',
		} );
	} );

	it( 'returns null when the reader has no subscription to the publication', async () => {
		const agent = mockAgent( [
			{ uri: 'at://did:plc:reader/site.standard.graph.subscription/3ka', value: { publication: OTHER_PUB } },
		] );
		expect( await fetchSubscriptionUri( agent, DID, PUB_URI ) ).toBeNull();
	} );

	it( 'returns null on an empty repo', async () => {
		const agent = mockAgent( [] );
		expect( await fetchSubscriptionUri( agent, DID, PUB_URI ) ).toBeNull();
	} );
} );
