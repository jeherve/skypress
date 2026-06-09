import { describe, expect, it } from 'vitest';
import {
	buildLike,
	buildRepost,
	buildReply,
	buildQuote,
	graphemeLength,
	validateReplyText,
	bskyPostWebUrl,
	MAX_REPLY_GRAPHEMES,
	type StrongRef,
} from './records';

const SUBJECT: StrongRef = {
	uri: 'at://did:plc:writer/app.bsky.feed.post/3kpost',
	cid: 'bafypost',
};
const CREATED_AT = '2026-06-09T12:00:00.000Z';

describe( 'buildLike', () => {
	it( 'emits an app.bsky.feed.like targeting the subject', () => {
		expect( buildLike( SUBJECT, CREATED_AT ) ).toEqual( {
			$type: 'app.bsky.feed.like',
			subject: { uri: SUBJECT.uri, cid: SUBJECT.cid },
			createdAt: CREATED_AT,
		} );
	} );
} );

describe( 'buildRepost', () => {
	it( 'emits an app.bsky.feed.repost targeting the subject', () => {
		expect( buildRepost( SUBJECT, CREATED_AT ) ).toEqual( {
			$type: 'app.bsky.feed.repost',
			subject: { uri: SUBJECT.uri, cid: SUBJECT.cid },
			createdAt: CREATED_AT,
		} );
	} );
} );

describe( 'buildReply', () => {
	it( 'emits a post with reply.root and reply.parent both the companion post', () => {
		// The companion post is the thread origin, so root === parent === subject.
		expect(
			buildReply( { text: 'Nice piece!', subject: SUBJECT, createdAt: CREATED_AT } )
		).toEqual( {
			$type: 'app.bsky.feed.post',
			text: 'Nice piece!',
			createdAt: CREATED_AT,
			reply: {
				root: { uri: SUBJECT.uri, cid: SUBJECT.cid },
				parent: { uri: SUBJECT.uri, cid: SUBJECT.cid },
			},
		} );
	} );

	it( 'does not carry an embed', () => {
		const record = buildReply( { text: 'hi', subject: SUBJECT, createdAt: CREATED_AT } );
		expect( record ).not.toHaveProperty( 'embed' );
	} );
} );

describe( 'buildQuote', () => {
	it( 'emits a standalone post embedding the subject via app.bsky.embed.record', () => {
		expect(
			buildQuote( { text: 'Worth a read:', subject: SUBJECT, createdAt: CREATED_AT } )
		).toEqual( {
			$type: 'app.bsky.feed.post',
			text: 'Worth a read:',
			createdAt: CREATED_AT,
			embed: {
				$type: 'app.bsky.embed.record',
				record: { uri: SUBJECT.uri, cid: SUBJECT.cid },
			},
		} );
	} );

	it( 'is not a reply (no reply field) — a quote is a standalone post', () => {
		const record = buildQuote( { text: 'hi', subject: SUBJECT, createdAt: CREATED_AT } );
		expect( record ).not.toHaveProperty( 'reply' );
	} );

	it( 'allows empty commentary text', () => {
		expect( buildQuote( { text: '', subject: SUBJECT, createdAt: CREATED_AT } ).text ).toBe( '' );
	} );
} );

describe( 'graphemeLength', () => {
	it( 'counts plain ASCII by character', () => {
		expect( graphemeLength( 'hello' ) ).toBe( 5 );
		expect( graphemeLength( '' ) ).toBe( 0 );
	} );

	it( 'counts a multi-codepoint emoji as one grapheme', () => {
		// Family emoji = several codepoints joined with ZWJ, but one user-perceived character.
		expect( graphemeLength( '👨‍👩‍👧‍👦' ) ).toBe( 1 );
		// Flag = two regional-indicator codepoints, one grapheme.
		expect( graphemeLength( '🇫🇷' ) ).toBe( 1 );
	} );
} );

describe( 'bskyPostWebUrl', () => {
	it( 'maps an at:// post uri to its bsky.app profile/post URL', () => {
		expect( bskyPostWebUrl( SUBJECT.uri ) ).toBe(
			'https://bsky.app/profile/did:plc:writer/post/3kpost'
		);
	} );

	it( 'falls back to bsky.app for an unparseable uri', () => {
		expect( bskyPostWebUrl( 'not-an-at-uri' ) ).toBe( 'https://bsky.app' );
	} );
} );

describe( 'validateReplyText', () => {
	it( 'rejects empty / whitespace-only text', () => {
		expect( validateReplyText( '' ).ok ).toBe( false );
		expect( validateReplyText( '   \n ' ).ok ).toBe( false );
	} );

	it( 'accepts text up to the grapheme cap', () => {
		expect( validateReplyText( 'a'.repeat( MAX_REPLY_GRAPHEMES ) ).ok ).toBe( true );
	} );

	it( 'rejects text over the grapheme cap', () => {
		expect( validateReplyText( 'a'.repeat( MAX_REPLY_GRAPHEMES + 1 ) ).ok ).toBe( false );
	} );
} );
