import { describe, expect, it } from 'vitest';
import { buildRssFeed, type FeedChannel, type FeedItem } from './rss';

const channel: FeedChannel = {
	title: 'My Publication',
	link: 'https://skypress.blog/@alice.test/my-pub',
	description: 'Notes from the quiet hours',
	feedUrl: 'https://skypress.blog/@alice.test/my-pub/rss.xml',
};

function item( overrides: Partial< FeedItem > = {} ): FeedItem {
	return {
		title: 'Hello world',
		link: 'https://skypress.blog/@alice.test/my-pub/abc123',
		pubDate: new Date( '2026-06-09T12:00:00Z' ),
		contentHtml: '<p>Hello world</p>',
		...overrides,
	};
}

describe( 'buildRssFeed', () => {
	it( 'emits a well-formed RSS 2.0 document with the content namespace', () => {
		const xml = buildRssFeed( channel, [ item() ] );
		expect( xml.startsWith( '<?xml version="1.0" encoding="UTF-8"?>' ) ).toBe( true );
		expect( xml ).toContain( '<rss version="2.0"' );
		expect( xml ).toContain(
			'xmlns:content="http://purl.org/rss/1.0/modules/content/"'
		);
		expect( xml ).toContain( '<channel>' );
		expect( xml ).toContain( '</channel>' );
		expect( xml.trimEnd().endsWith( '</rss>' ) ).toBe( true );
	} );

	it( 'renders channel metadata, including a self-referencing atom:link', () => {
		const xml = buildRssFeed( channel, [] );
		expect( xml ).toContain( '<title>My Publication</title>' );
		expect( xml ).toContain(
			'<link>https://skypress.blog/@alice.test/my-pub</link>'
		);
		expect( xml ).toContain(
			'<description>Notes from the quiet hours</description>'
		);
		expect( xml ).toContain(
			'<atom:link href="https://skypress.blog/@alice.test/my-pub/rss.xml" rel="self" type="application/rss+xml"/>'
		);
		expect( xml ).toContain(
			'xmlns:atom="http://www.w3.org/2005/Atom"'
		);
	} );

	it( 'carries the full HTML inside a content:encoded CDATA section', () => {
		const xml = buildRssFeed( channel, [
			item( { contentHtml: '<p>Body with <a href="https://x.test">a link</a>.</p>' } ),
		] );
		expect( xml ).toContain(
			'<content:encoded><![CDATA[<p>Body with <a href="https://x.test">a link</a>.</p>]]></content:encoded>'
		);
	} );

	it( 'XML-escapes text fields so markup in a title cannot break the feed', () => {
		const xml = buildRssFeed( channel, [
			item( { title: 'Tom & Jerry <3 "quotes"' } ),
		] );
		expect( xml ).toContain(
			'<title>Tom &amp; Jerry &lt;3 "quotes"</title>'
		);
		expect( xml ).not.toContain( '<3' );
	} );

	it( 'escapes quotes in attribute values so a value cannot break out of the attribute', () => {
		const xml = buildRssFeed(
			{ ...channel, feedUrl: 'https://x.test/a"b/rss.xml' },
			[]
		);
		expect( xml ).toContain( 'href="https://x.test/a&quot;b/rss.xml"' );
		// The raw quote must not survive inside the attribute.
		expect( xml ).not.toContain( 'a"b/rss.xml"' );
	} );

	it( 'splits a CDATA terminator in the body so it cannot close the section early', () => {
		const xml = buildRssFeed( channel, [
			item( { contentHtml: '<p>if (a[b]]> c) {}</p>' } ),
		] );
		// The raw "]]>" must not survive verbatim inside the CDATA section.
		expect( xml ).toContain( ']]]]><![CDATA[>' );
		expect( xml ).not.toContain( 'a[b]]> c' );
	} );

	it( 'strips XML-1.0-illegal control characters from text fields and body', () => {
		// Untrusted PDS content could carry control bytes that are illegal in XML 1.0
		// even inside CDATA; a single one would make the whole feed unparseable.
		const xml = buildRssFeed( channel, [
			item( {
				title: 'Be\x00fo\x01re\x08af\x1Fter',
				description: 'Sum\x0Cmary',
				contentHtml: '<p>Bo\x00dy</p>',
			} ),
		] );
		expect( xml ).toContain( '<title>Beforeafter</title>' );
		expect( xml ).toContain( '<description>Summary</description>' );
		expect( xml ).toContain( '<![CDATA[<p>Body</p>]]>' );
		// No raw control byte survives anywhere in the document.
		expect( /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test( xml ) ).toBe( false );
	} );

	it( 'preserves legal whitespace (tab, newline, carriage return) in content', () => {
		const xml = buildRssFeed( channel, [
			item( { contentHtml: '<pre>a\tb\nc\rd</pre>' } ),
		] );
		expect( xml ).toContain( '<![CDATA[<pre>a\tb\nc\rd</pre>]]>' );
	} );

	it( 'formats pubDate as an RFC-822 date', () => {
		const xml = buildRssFeed( channel, [ item() ] );
		expect( xml ).toContain( '<pubDate>Tue, 09 Jun 2026 12:00:00 GMT</pubDate>' );
	} );

	it( 'uses the item link as the guid by default and marks it as a permalink', () => {
		const xml = buildRssFeed( channel, [ item() ] );
		expect( xml ).toContain(
			'<guid isPermaLink="true">https://skypress.blog/@alice.test/my-pub/abc123</guid>'
		);
	} );

	it( 'preserves item order and emits one <item> per entry', () => {
		const xml = buildRssFeed( channel, [
			item( { title: 'First', link: 'https://skypress.blog/@alice.test/my-pub/1' } ),
			item( { title: 'Second', link: 'https://skypress.blog/@alice.test/my-pub/2' } ),
		] );
		expect( ( xml.match( /<item>/g ) ?? [] ).length ).toBe( 2 );
		expect( xml.indexOf( 'First' ) ).toBeLessThan( xml.indexOf( 'Second' ) );
	} );

	it( 'emits a valid, item-less channel when there are no articles', () => {
		const xml = buildRssFeed( channel, [] );
		expect( xml ).toContain( '<channel>' );
		expect( xml ).not.toContain( '<item>' );
	} );

	it( 'includes an optional plain-text description per item when provided', () => {
		const xml = buildRssFeed( channel, [
			item( { description: 'A short summary & teaser' } ),
		] );
		expect( xml ).toContain(
			'<description>A short summary &amp; teaser</description>'
		);
	} );
} );
