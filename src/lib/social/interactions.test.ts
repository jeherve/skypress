import { describe, expect, it, vi } from 'vitest';
import {
	like,
	unlike,
	repost,
	unrepost,
	postReply,
	postQuote,
	fetchPostState,
	fetchPostExists,
} from './interactions';
import type { StrongRef } from './records';

const DID = 'did:plc:reader';
/** The article author's DID — the repo that authored the companion post `SUBJECT`. */
const AUTHOR_DID = 'did:plc:writer';
const SUBJECT: StrongRef = {
	uri: 'at://did:plc:writer/app.bsky.feed.post/3kpost',
	cid: 'bafypost',
};

/** A minimal mock of the `@atproto/api` Agent surface these helpers touch. */
function mockAgent( overrides: Record< string, unknown > = {} ) {
	const createRecord = vi.fn( async () => ( {
		data: { uri: 'at://did:plc:reader/app.bsky.feed.like/3knew', cid: 'bafynew' },
	} ) );
	const deleteRecord = vi.fn( async () => ( {} ) );
	const getPosts = vi.fn( async () => ( {
		data: {
			posts: [
				{
					uri: SUBJECT.uri,
					cid: SUBJECT.cid,
					likeCount: 3,
					repostCount: 1,
					replyCount: 2,
					viewer: {
						like: 'at://did:plc:reader/app.bsky.feed.like/3kexisting',
						repost: undefined,
					},
				},
			],
		},
	} ) );
	return {
		com: { atproto: { repo: { createRecord, deleteRecord } } },
		app: { bsky: { feed: { getPosts } } },
		...overrides,
		// expose the spies for assertions
		_spies: { createRecord, deleteRecord, getPosts },
	} as never;
}

describe( 'like', () => {
	it( 'creates an app.bsky.feed.like in the reader repo and returns its uri', async () => {
		const agent = mockAgent();
		const uri = await like( agent, DID, SUBJECT, AUTHOR_DID );
		const { createRecord } = ( agent as never as { _spies: { createRecord: ReturnType< typeof vi.fn > } } )._spies;
		expect( createRecord ).toHaveBeenCalledTimes( 1 );
		const arg = createRecord.mock.calls[ 0 ][ 0 ];
		expect( arg.repo ).toBe( DID );
		expect( arg.collection ).toBe( 'app.bsky.feed.like' );
		expect( arg.record.$type ).toBe( 'app.bsky.feed.like' );
		expect( arg.record.subject ).toEqual( SUBJECT );
		expect( typeof arg.record.createdAt ).toBe( 'string' );
		expect( uri ).toBe( 'at://did:plc:reader/app.bsky.feed.like/3knew' );
	} );
} );

describe( 'unlike', () => {
	it( 'deletes the like record by the rkey parsed from its uri', async () => {
		const agent = mockAgent();
		await unlike( agent, DID, 'at://did:plc:reader/app.bsky.feed.like/3kexisting' );
		const { deleteRecord } = ( agent as never as { _spies: { deleteRecord: ReturnType< typeof vi.fn > } } )._spies;
		expect( deleteRecord ).toHaveBeenCalledWith( {
			repo: DID,
			collection: 'app.bsky.feed.like',
			rkey: '3kexisting',
		} );
	} );
} );

describe( 'repost / unrepost', () => {
	it( 'creates an app.bsky.feed.repost', async () => {
		const agent = mockAgent();
		await repost( agent, DID, SUBJECT, AUTHOR_DID );
		const { createRecord } = ( agent as never as { _spies: { createRecord: ReturnType< typeof vi.fn > } } )._spies;
		const arg = createRecord.mock.calls[ 0 ][ 0 ];
		expect( arg.collection ).toBe( 'app.bsky.feed.repost' );
		expect( arg.record.$type ).toBe( 'app.bsky.feed.repost' );
		expect( arg.record.subject ).toEqual( SUBJECT );
	} );

	it( 'deletes the repost by rkey', async () => {
		const agent = mockAgent();
		await unrepost( agent, DID, 'at://did:plc:reader/app.bsky.feed.repost/3krp' );
		const { deleteRecord } = ( agent as never as { _spies: { deleteRecord: ReturnType< typeof vi.fn > } } )._spies;
		expect( deleteRecord ).toHaveBeenCalledWith( {
			repo: DID,
			collection: 'app.bsky.feed.repost',
			rkey: '3krp',
		} );
	} );
} );

describe( 'postReply', () => {
	it( 'creates a post threaded under the companion post', async () => {
		const agent = mockAgent();
		await postReply( agent, DID, { text: 'great read', subject: SUBJECT }, AUTHOR_DID );
		const { createRecord } = ( agent as never as { _spies: { createRecord: ReturnType< typeof vi.fn > } } )._spies;
		const arg = createRecord.mock.calls[ 0 ][ 0 ];
		expect( arg.collection ).toBe( 'app.bsky.feed.post' );
		expect( arg.record.text ).toBe( 'great read' );
		expect( arg.record.reply ).toEqual( { root: SUBJECT, parent: SUBJECT } );
	} );
} );

describe( 'postQuote', () => {
	it( 'creates a standalone post embedding the companion post', async () => {
		const agent = mockAgent();
		await postQuote( agent, DID, { text: 'worth a read', subject: SUBJECT }, AUTHOR_DID );
		const { createRecord } = ( agent as never as { _spies: { createRecord: ReturnType< typeof vi.fn > } } )._spies;
		const arg = createRecord.mock.calls[ 0 ][ 0 ];
		expect( arg.collection ).toBe( 'app.bsky.feed.post' );
		expect( arg.record.embed ).toEqual( {
			$type: 'app.bsky.embed.record',
			record: SUBJECT,
		} );
		expect( arg.record.reply ).toBeUndefined();
	} );
} );

describe( 'companion-post authority guard', () => {
	// `subject` is read verbatim from the author's untrusted PDS document. A malicious
	// publication can point it at a foreign post; every write must refuse when the ref's
	// repo DID does not match the article author's DID (confused-deputy prevention).
	const FOREIGN: StrongRef = {
		uri: 'at://did:plc:attacker/app.bsky.feed.post/3kevil',
		cid: 'bafyevil',
	};

	it( 'refuses to like a post whose repo DID is not the article author, without writing', async () => {
		const agent = mockAgent();
		await expect( like( agent, DID, FOREIGN, AUTHOR_DID ) ).rejects.toThrow();
		const { createRecord } = ( agent as never as { _spies: { createRecord: ReturnType< typeof vi.fn > } } )._spies;
		expect( createRecord ).not.toHaveBeenCalled();
	} );

	it( 'refuses to repost a foreign post, without writing', async () => {
		const agent = mockAgent();
		await expect( repost( agent, DID, FOREIGN, AUTHOR_DID ) ).rejects.toThrow();
		const { createRecord } = ( agent as never as { _spies: { createRecord: ReturnType< typeof vi.fn > } } )._spies;
		expect( createRecord ).not.toHaveBeenCalled();
	} );

	it( 'refuses to reply under a foreign post, without writing', async () => {
		const agent = mockAgent();
		await expect(
			postReply( agent, DID, { text: 'hi', subject: FOREIGN }, AUTHOR_DID )
		).rejects.toThrow();
		const { createRecord } = ( agent as never as { _spies: { createRecord: ReturnType< typeof vi.fn > } } )._spies;
		expect( createRecord ).not.toHaveBeenCalled();
	} );

	it( 'refuses to quote a foreign post, without writing', async () => {
		const agent = mockAgent();
		await expect(
			postQuote( agent, DID, { text: 'hi', subject: FOREIGN }, AUTHOR_DID )
		).rejects.toThrow();
		const { createRecord } = ( agent as never as { _spies: { createRecord: ReturnType< typeof vi.fn > } } )._spies;
		expect( createRecord ).not.toHaveBeenCalled();
	} );
} );

describe( 'fetchPostState', () => {
	it( 'returns counts and the viewer like/repost rkey uris', async () => {
		const agent = mockAgent();
		const state = await fetchPostState( agent, SUBJECT.uri );
		const { getPosts } = ( agent as never as { _spies: { getPosts: ReturnType< typeof vi.fn > } } )._spies;
		expect( getPosts ).toHaveBeenCalledWith( { uris: [ SUBJECT.uri ] } );
		expect( state ).toEqual( {
			likeCount: 3,
			repostCount: 1,
			replyCount: 2,
			viewerLikeUri: 'at://did:plc:reader/app.bsky.feed.like/3kexisting',
			viewerRepostUri: null,
		} );
	} );

	it( 'returns null when the post is not found', async () => {
		const agent = mockAgent( {
			app: { bsky: { feed: { getPosts: vi.fn( async () => ( { data: { posts: [] } } ) ) } } },
		} );
		expect( await fetchPostState( agent, SUBJECT.uri ) ).toBeNull();
	} );
} );

describe( 'fetchPostExists', () => {
	const ok = ( body: unknown ) =>
		( { ok: true, json: async () => body } ) as unknown as Response;
	const notOk = () => ( { ok: false, json: async () => ( {} ) } ) as unknown as Response;

	it( 'queries the public AppView getPosts endpoint with the encoded uri', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( ok( { posts: [ { uri: SUBJECT.uri } ] } ) );
		await fetchPostExists( SUBJECT.uri, fetchImpl as unknown as typeof fetch );
		expect( fetchImpl ).toHaveBeenCalledWith(
			`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${ encodeURIComponent(
				SUBJECT.uri
			) }`
		);
	} );

	it( 'returns true when the post is present', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( ok( { posts: [ { uri: SUBJECT.uri } ] } ) );
		expect( await fetchPostExists( SUBJECT.uri, fetchImpl as unknown as typeof fetch ) ).toBe( true );
	} );

	it( 'returns false when the post is gone (no posts returned)', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( ok( { posts: [] } ) );
		expect( await fetchPostExists( SUBJECT.uri, fetchImpl as unknown as typeof fetch ) ).toBe( false );
	} );

	it( 'returns null (undetermined) on a non-ok response', async () => {
		const fetchImpl = vi.fn().mockResolvedValue( notOk() );
		expect( await fetchPostExists( SUBJECT.uri, fetchImpl as unknown as typeof fetch ) ).toBeNull();
	} );

	it( 'returns null (undetermined) when the network throws', async () => {
		const fetchImpl = vi.fn().mockRejectedValue( new Error( 'offline' ) );
		expect( await fetchPostExists( SUBJECT.uri, fetchImpl as unknown as typeof fetch ) ).toBeNull();
	} );
} );
