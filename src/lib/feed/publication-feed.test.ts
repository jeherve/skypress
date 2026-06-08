import { describe, expect, it } from 'vitest';
import {
	buildPublicationFeedXml,
	FEED_ITEM_LIMIT,
	type FeedDocumentValue,
} from './publication-feed';
import type { RepoRecord } from '../reader/records';

const PUB_URI = 'at://did:plc:alice/site.standard.publication/pub1';
const OTHER_PUB_URI = 'at://did:plc:alice/site.standard.publication/pub2';

const publication = {
	uri: PUB_URI,
	name: 'My Publication',
	description: 'Notes from the quiet hours',
};

function doc(
	rkey: string,
	value: Partial< FeedDocumentValue >
): RepoRecord< FeedDocumentValue > {
	return {
		uri: `at://did:plc:alice/site.standard.document/${ rkey }`,
		cid: `cid-${ rkey }`,
		value: {
			site: PUB_URI,
			title: `Doc ${ rkey }`,
			publishedAt: '2026-06-01T00:00:00Z',
			content: { blocks: [ { name: 'core/paragraph', attributes: { content: 'Body' } } ] },
			...value,
		},
	};
}

function build( documents: RepoRecord< FeedDocumentValue >[] ): string {
	return buildPublicationFeedXml( {
		handle: 'alice.test',
		slug: 'my-pub',
		pdsUrl: 'https://pds.example',
		did: 'did:plc:alice',
		publication,
		documents,
	} );
}

describe( 'buildPublicationFeedXml', () => {
	it( 'includes only documents belonging to this publication', () => {
		const xml = build( [
			doc( 'mine', { title: 'Mine', site: PUB_URI } ),
			doc( 'theirs', { title: 'Theirs', site: OTHER_PUB_URI } ),
		] );
		expect( xml ).toContain( '<title>Mine</title>' );
		expect( xml ).not.toContain( '<title>Theirs</title>' );
	} );

	it( 'sorts items newest-first by publishedAt', () => {
		const xml = build( [
			doc( 'older', { title: 'Older', publishedAt: '2026-01-01T00:00:00Z' } ),
			doc( 'newer', { title: 'Newer', publishedAt: '2026-12-01T00:00:00Z' } ),
		] );
		expect( xml.indexOf( 'Newer' ) ).toBeLessThan( xml.indexOf( 'Older' ) );
	} );

	it( `caps the feed at the newest ${ FEED_ITEM_LIMIT } items`, () => {
		const documents = Array.from( { length: FEED_ITEM_LIMIT + 5 }, ( _, i ) =>
			doc( `d${ i }`, {
				title: `Doc ${ i }`,
				// Higher index = newer, so the oldest 5 should be dropped.
				publishedAt: `2026-06-${ String( i + 1 ).padStart( 2, '0' ) }T00:00:00Z`,
			} )
		);
		const xml = build( documents );
		expect( ( xml.match( /<item>/g ) ?? [] ).length ).toBe( FEED_ITEM_LIMIT );
		expect( xml ).toContain( '<title>Doc 24</title>' ); // newest kept
		expect( xml ).not.toContain( '<title>Doc 0</title>' ); // oldest dropped
	} );

	it( 'drops documents with no publishedAt (cannot be ordered or dated)', () => {
		const xml = build( [
			doc( 'dated', { title: 'Dated', publishedAt: '2026-06-01T00:00:00Z' } ),
			doc( 'undated', { title: 'Undated', publishedAt: undefined } ),
		] );
		expect( xml ).toContain( '<title>Dated</title>' );
		expect( xml ).not.toContain( '<title>Undated</title>' );
	} );

	it( 'drops documents with an unparseable publishedAt rather than emitting "Invalid Date"', () => {
		// publishedAt is untrusted PDS data — a truthy-but-bad value must not reach Date().
		const xml = build( [
			doc( 'good', { title: 'Good', publishedAt: '2026-06-01T00:00:00Z' } ),
			doc( 'bad', { title: 'Bad', publishedAt: 'not-a-date' } ),
		] );
		expect( xml ).toContain( '<title>Good</title>' );
		expect( xml ).not.toContain( '<title>Bad</title>' );
		expect( xml ).not.toContain( 'Invalid Date' );
	} );

	it( 'renders full article HTML into content:encoded via the reader pipeline', () => {
		const xml = build( [
			doc( 'a', {
				content: {
					blocks: [
						{ name: 'core/heading', attributes: { level: 2, content: 'Section' } },
						{ name: 'core/paragraph', attributes: { content: 'A paragraph.' } },
					],
				},
			} ),
		] );
		expect( xml ).toContain( '<content:encoded><![CDATA[' );
		expect( xml ).toContain( 'A paragraph.' );
		expect( xml ).toContain( 'Section' );
	} );

	it( 'links each item to its canonical article URL and self-references the feed', () => {
		const xml = build( [ doc( 'abc', {} ) ] );
		expect( xml ).toContain(
			'<link>https://skypress.blog/@alice.test/my-pub/abc</link>'
		);
		expect( xml ).toContain(
			'href="https://skypress.blog/@alice.test/my-pub/rss.xml"'
		);
		expect( xml ).toContain( '<link>https://skypress.blog/@alice.test/my-pub</link>' );
	} );

	it( 'falls back to textContent for the item description when none is stored', () => {
		const xml = build( [
			doc( 'a', {
				description: undefined,
				textContent: 'Plain summary text.',
				content: { blocks: [] },
			} ),
		] );
		expect( xml ).toContain( '<description>Plain summary text.</description>' );
	} );

	it( 'produces a valid empty channel when the publication has no articles', () => {
		const xml = build( [] );
		expect( xml ).toContain( '<title>My Publication</title>' );
		expect( xml ).not.toContain( '<item>' );
	} );
} );
