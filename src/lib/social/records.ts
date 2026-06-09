/**
 * Pure builders for the records a reader's social action writes: like, repost, reply,
 * and quote-repost (design 2026-06-09-social-actions-on-posts).
 *
 * No `@atproto/*` or network here — just record-shaping, so it's fully unit-testable.
 * Orchestration (createRecord/deleteRecord via the Agent) lives in `interactions.ts`.
 *
 * All four actions target the article's companion `app.bsky.feed.post` (Decision 0013) by
 * its `com.atproto.repo.strongRef`. Only `app.bsky.*` records thread/federate on Bluesky,
 * which is why replies are posts (not a `site.standard.*` record) and are capped at 300
 * graphemes — there is no threaded longform on Bluesky.
 */

/** A `com.atproto.repo.strongRef` — a URI plus its content-hash fingerprint. */
export interface StrongRef {
	uri: string;
	cid: string;
}

/** Bluesky's user-facing post-text limit is 300 graphemes (not bytes/codepoints). */
export const MAX_REPLY_GRAPHEMES = 300;

export interface LikeRecord {
	$type: 'app.bsky.feed.like';
	subject: StrongRef;
	createdAt: string;
}

export interface RepostRecord {
	$type: 'app.bsky.feed.repost';
	subject: StrongRef;
	createdAt: string;
}

export interface ReplyRecord {
	$type: 'app.bsky.feed.post';
	text: string;
	createdAt: string;
	reply: { root: StrongRef; parent: StrongRef };
}

export interface QuoteRecord {
	$type: 'app.bsky.feed.post';
	text: string;
	createdAt: string;
	embed: { $type: 'app.bsky.embed.record'; record: StrongRef };
}

/** Strip a strongRef down to the exact `{ uri, cid }` shape the lexicon expects. */
function ref( subject: StrongRef ): StrongRef {
	return { uri: subject.uri, cid: subject.cid };
}

/** `app.bsky.feed.like` over the companion post. */
export function buildLike( subject: StrongRef, createdAt: string ): LikeRecord {
	return { $type: 'app.bsky.feed.like', subject: ref( subject ), createdAt };
}

/** `app.bsky.feed.repost` over the companion post. */
export function buildRepost( subject: StrongRef, createdAt: string ): RepostRecord {
	return { $type: 'app.bsky.feed.repost', subject: ref( subject ), createdAt };
}

/**
 * A reply `app.bsky.feed.post`. The companion post is the thread origin, so both `root`
 * and `parent` are that post — a reader replies directly to the article's post.
 */
export function buildReply( input: {
	text: string;
	subject: StrongRef;
	createdAt: string;
} ): ReplyRecord {
	return {
		$type: 'app.bsky.feed.post',
		text: input.text,
		createdAt: input.createdAt,
		reply: { root: ref( input.subject ), parent: ref( input.subject ) },
	};
}

/**
 * A quote-repost: a standalone `app.bsky.feed.post` embedding the companion post via
 * `app.bsky.embed.record`. Not a reply — it does not thread under the post.
 */
export function buildQuote( input: {
	text: string;
	subject: StrongRef;
	createdAt: string;
} ): QuoteRecord {
	return {
		$type: 'app.bsky.feed.post',
		text: input.text,
		createdAt: input.createdAt,
		embed: { $type: 'app.bsky.embed.record', record: ref( input.subject ) },
	};
}

/**
 * The bsky.app web URL for a post AT-URI, for "view thread on Bluesky" links.
 * `at://<did>/app.bsky.feed.post/<rkey>` → `https://bsky.app/profile/<did>/post/<rkey>`.
 * Falls back to the bsky.app home for an unparseable URI.
 */
export function bskyPostWebUrl( postUri: string ): string {
	const match = postUri.match( /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/ );
	return match ? `https://bsky.app/profile/${ match[ 1 ] }/post/${ match[ 2 ] }` : 'https://bsky.app';
}

/**
 * Count user-perceived characters (grapheme clusters), matching Bluesky's 300-grapheme
 * rule. `Intl.Segmenter` is browser-native and counts ZWJ emoji / flags as one each, so
 * a family emoji costs one toward the cap — not the number of underlying codepoints.
 */
export function graphemeLength( text: string ): number {
	const segmenter = new Intl.Segmenter( undefined, { granularity: 'grapheme' } );
	let count = 0;
	for ( const _ of segmenter.segment( text ) ) {
		count++;
	}
	return count;
}

export interface ReplyValidation {
	ok: boolean;
	graphemes: number;
}

/**
 * A reply/quote body must be within the grapheme cap. A reply must also be non-empty;
 * a quote may have no commentary (`allowEmpty`), matching Bluesky's bare quote-repost.
 */
export function validateReplyText(
	text: string,
	options: { allowEmpty?: boolean } = {}
): ReplyValidation {
	const graphemes = graphemeLength( text );
	const hasBody = options.allowEmpty || text.trim().length > 0;
	return { ok: hasBody && graphemes <= MAX_REPLY_GRAPHEMES, graphemes };
}
