/**
 * Agent orchestration for reader social actions: create/delete the like, repost, reply,
 * and quote records on the reader's own PDS, and read the companion post's counts +
 * viewer state from the Bluesky AppView.
 *
 * All writes go browser → the reader's PDS over the authenticated OAuth agent (Decision
 * 0004). Record-shaping is delegated to the pure builders in `records.ts`.
 */
import type { Agent } from '@atproto/api';
import {
	buildLike,
	buildRepost,
	buildReply,
	buildQuote,
	type StrongRef,
} from './records';

const LIKE_COLLECTION = 'app.bsky.feed.like';
const REPOST_COLLECTION = 'app.bsky.feed.repost';
const POST_COLLECTION = 'app.bsky.feed.post';

/** The public, unauthenticated Bluesky AppView (same host as the landing actor lookup). */
const APPVIEW = 'https://public.api.bsky.app';

/** createRecord types `record` as an open index signature; our records are precise. */
function asRecord( value: object ): Record< string, unknown > {
	return value as Record< string, unknown >;
}

/** rkey is the last segment of an AT-URI. */
function rkeyFromUri( uri: string ): string {
	return uri.split( '/' ).pop() ?? '';
}

/** Like the companion post; returns the created like record's AT-URI (for unliking). */
export async function like( agent: Agent, did: string, subject: StrongRef ): Promise< string > {
	const res = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: LIKE_COLLECTION,
		record: asRecord( buildLike( subject, new Date().toISOString() ) ),
	} );
	return res.data.uri;
}

/** Remove a like by deleting its record (atproto has no native "unlike"). */
export async function unlike( agent: Agent, did: string, likeUri: string ): Promise< void > {
	await agent.com.atproto.repo.deleteRecord( {
		repo: did,
		collection: LIKE_COLLECTION,
		rkey: rkeyFromUri( likeUri ),
	} );
}

/** Repost the companion post; returns the created repost record's AT-URI. */
export async function repost( agent: Agent, did: string, subject: StrongRef ): Promise< string > {
	const res = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: REPOST_COLLECTION,
		record: asRecord( buildRepost( subject, new Date().toISOString() ) ),
	} );
	return res.data.uri;
}

/** Undo a repost by deleting its record. */
export async function unrepost( agent: Agent, did: string, repostUri: string ): Promise< void > {
	await agent.com.atproto.repo.deleteRecord( {
		repo: did,
		collection: REPOST_COLLECTION,
		rkey: rkeyFromUri( repostUri ),
	} );
}

/** Reply to the companion post; returns the created post's AT-URI. */
export async function postReply(
	agent: Agent,
	did: string,
	input: { text: string; subject: StrongRef }
): Promise< string > {
	const res = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: POST_COLLECTION,
		record: asRecord(
			buildReply( { text: input.text, subject: input.subject, createdAt: new Date().toISOString() } )
		),
	} );
	return res.data.uri;
}

/** Quote-repost the companion post; returns the created post's AT-URI. */
export async function postQuote(
	agent: Agent,
	did: string,
	input: { text: string; subject: StrongRef }
): Promise< string > {
	const res = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: POST_COLLECTION,
		record: asRecord(
			buildQuote( { text: input.text, subject: input.subject, createdAt: new Date().toISOString() } )
		),
	} );
	return res.data.uri;
}

export interface PostState {
	likeCount: number;
	repostCount: number;
	replyCount: number;
	/** The viewer's own like record URI, or null if they haven't liked it. */
	viewerLikeUri: string | null;
	/** The viewer's own repost record URI, or null if they haven't reposted it. */
	viewerRepostUri: string | null;
}

/**
 * Read the companion post's like/repost/reply counts and the viewer's own like/repost
 * record URIs (so the UI can show active state and toggle by deleting the right record).
 * Returns null if the post can't be found (e.g. deleted, or not yet indexed).
 */
export async function fetchPostState( agent: Agent, postUri: string ): Promise< PostState | null > {
	const res = await agent.app.bsky.feed.getPosts( { uris: [ postUri ] } );
	const post = res.data.posts[ 0 ];
	if ( ! post ) {
		return null;
	}
	return {
		likeCount: post.likeCount ?? 0,
		repostCount: post.repostCount ?? 0,
		replyCount: post.replyCount ?? 0,
		viewerLikeUri: post.viewer?.like ?? null,
		viewerRepostUri: post.viewer?.repost ?? null,
	};
}

/**
 * Does the companion post still exist on Bluesky? An UNAUTHENTICATED read of the public
 * AppView (no OAuth, no agent), so signed-out readers can also tell when a post is gone.
 * Mirrors `landing/actor-lookup.ts`: fixed host, the post AT-URI URL-encoded as the only
 * input, and a deliberate three-state result —
 *
 * - `true`  — the post is present,
 * - `false` — the post is gone (deleted, or not yet indexed),
 * - `null`  — undetermined (network/HTTP error), so callers can fail OPEN and keep the
 *   action bar rather than hide a live post on a transient blip.
 */
export async function fetchPostExists(
	postUri: string,
	fetchImpl: typeof fetch = fetch
): Promise< boolean | null > {
	try {
		const res = await fetchImpl(
			`${ APPVIEW }/xrpc/app.bsky.feed.getPosts?uris=${ encodeURIComponent( postUri ) }`
		);
		if ( ! res.ok ) {
			return null;
		}
		const data = ( await res.json() ) as { posts?: unknown[] };
		return Array.isArray( data?.posts ) && data.posts.length > 0;
	} catch {
		return null;
	}
}
