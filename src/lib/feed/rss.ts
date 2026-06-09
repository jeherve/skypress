/**
 * Hand-rolled, dependency-free RSS 2.0 builder (Decision 0011).
 *
 * DEPENDENCY-FREE BY DESIGN, like `src/lib/blocks/render.ts`: the read path keeps the
 * editor's weight (and any `@astrojs/rss` transitive deps) off the public feed route, and
 * the XML escaping is test-locked so untrusted, PDS-sourced titles/HTML cannot break out of
 * their elements. Full-content feeds carry the already-sanitised article HTML in
 * `<content:encoded>` (the same HTML the reader injects — see AGENTS.md #6b).
 */

export interface FeedChannel {
	/** Publication name. */
	title: string;
	/** The publication's public home URL. */
	link: string;
	/** Publication description (plain text; '' when absent). */
	description: string;
	/** The feed's own URL, emitted as a self-referencing `atom:link`. */
	feedUrl?: string;
	/** Newest item's date, for `lastBuildDate`. */
	lastBuildDate?: Date;
}

export interface FeedItem {
	title: string;
	/** Canonical article URL — also the default `guid`. */
	link: string;
	pubDate: Date;
	/** Full, already-sanitised article HTML for `<content:encoded>`. */
	contentHtml: string;
	/** Optional plain-text summary for `<description>`. */
	description?: string;
}

/**
 * Drop characters that are illegal in XML 1.0 even inside CDATA (the C0 controls except
 * the three legal whitespace ones: tab `\x09`, newline `\x0A`, carriage return `\x0D`).
 * Untrusted, PDS-sourced titles/HTML can carry a stray control byte, and a single one would
 * make the whole feed unparseable for every subscriber — so strip them before anything else.
 */
function stripControlChars( value: string ): string {
	return value.replace( /[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '' );
}

/** Escape element-content text (`& < >`) so it can never break out of its element. */
function escapeXml( value: string ): string {
	return stripControlChars( value )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' );
}

/** Escape attribute-value text — element escaping plus quotes, which would close the attribute. */
function escapeAttr( value: string ): string {
	return escapeXml( value ).replace( /"/g, '&quot;' ).replace( /'/g, '&apos;' );
}

/**
 * Wrap arbitrary HTML in a CDATA section. A literal `]]>` would close the section early
 * (and is the one sequence CDATA cannot contain), so split it into two sections.
 */
function cdata( html: string ): string {
	const safe = stripControlChars( html ).replace( /]]>/g, ']]]]><![CDATA[>' );
	return `<![CDATA[${ safe }]]>`;
}

/** RFC-822 date (RSS pubDate format). `toUTCString()` yields a conformant `… GMT` string. */
function rfc822( date: Date ): string {
	return date.toUTCString();
}

function renderItem( entry: FeedItem ): string {
	const parts = [
		`<title>${ escapeXml( entry.title ) }</title>`,
		`<link>${ escapeXml( entry.link ) }</link>`,
		`<guid isPermaLink="true">${ escapeXml( entry.link ) }</guid>`,
		`<pubDate>${ rfc822( entry.pubDate ) }</pubDate>`,
	];
	if ( entry.description ) {
		parts.push( `<description>${ escapeXml( entry.description ) }</description>` );
	}
	parts.push( `<content:encoded>${ cdata( entry.contentHtml ) }</content:encoded>` );
	return `<item>${ parts.join( '' ) }</item>`;
}

/** Build a full-content RSS 2.0 feed document from channel metadata and items (in order). */
export function buildRssFeed( channel: FeedChannel, items: FeedItem[] ): string {
	const channelParts = [
		`<title>${ escapeXml( channel.title ) }</title>`,
		`<link>${ escapeXml( channel.link ) }</link>`,
		`<description>${ escapeXml( channel.description ) }</description>`,
	];
	if ( channel.feedUrl ) {
		channelParts.push(
			`<atom:link href="${ escapeAttr( channel.feedUrl ) }" rel="self" type="application/rss+xml"/>`
		);
	}
	if ( channel.lastBuildDate ) {
		channelParts.push( `<lastBuildDate>${ rfc822( channel.lastBuildDate ) }</lastBuildDate>` );
	}
	const body = channelParts.join( '' ) + items.map( renderItem ).join( '' );
	return (
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<rss version="2.0" ' +
		'xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
		'xmlns:atom="http://www.w3.org/2005/Atom">' +
		`<channel>${ body }</channel>` +
		'</rss>'
	);
}
