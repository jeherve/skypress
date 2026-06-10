/**
 * Assemble a publication's full-content RSS feed (Decision 0011).
 *
 * Pure transform — no network. It renders each item through `renderArticle` — the same
 * deep module the article page uses — so the feed body is the same sanitised HTML a
 * browser would see (AGENTS.md #6b), then hands off to the test-locked `buildRssFeed`.
 * The feed route fetches the records (SSRF-guarded) and calls this; keeping the
 * transform pure makes the sort/cap/filter rules unit-testable.
 */
import type { BlockNode } from '../blocks/render';
import { renderArticle } from '../reader/render-article';
import { canonicalArticleUrl, publicationHomeUrl } from '../publish/records';
import { buildRssFeed, type FeedChannel, type FeedItem } from './rss';
import type { RepoRecord } from '../reader/records';

/** Newest-N cap, matching the brief: the feed carries the 20 most recent articles. */
export const FEED_ITEM_LIMIT = 20;

/** The slice of a `site.standard.document` value the feed needs. */
export interface FeedDocumentValue {
	title?: string;
	description?: string;
	textContent?: string;
	publishedAt?: string;
	site?: string;
	content?: { blocks?: BlockNode[] };
}

export interface PublicationFeedInput {
	handle: string;
	slug: string;
	pdsUrl: string;
	did: string;
	publication: { uri: string; name: string; description: string | null };
	documents: RepoRecord< FeedDocumentValue >[];
}

const DESCRIPTION_FALLBACK_CHARS = 200;

export function buildPublicationFeedXml( input: PublicationFeedInput ): string {
	const { handle, slug, pdsUrl, did, publication, documents } = input;
	const home = publicationHomeUrl( handle, slug );

	const items: FeedItem[] = documents
		// Only this publication's documents (a writer may hold others — Decision 0010).
		.filter( ( record ) => record.value.site === publication.uri )
		// An undated — or undateable — document can't be ordered or given a valid
		// RFC-822 pubDate; skip it. publishedAt is untrusted PDS data, so a truthy
		// but unparseable value must not reach `new Date()` (→ "Invalid Date").
		.filter( ( record ) => {
			const at = record.value.publishedAt;
			return Boolean( at ) && ! Number.isNaN( Date.parse( at as string ) );
		} )
		// Newest first — ISO-8601 strings sort lexicographically by time.
		.sort( ( a, b ) =>
			( b.value.publishedAt as string ).localeCompare( a.value.publishedAt as string )
		)
		.slice( 0, FEED_ITEM_LIMIT )
		.map( ( record ) => {
			const rkey = record.uri.split( '/' ).pop() as string;
			const { html: contentHtml, text } = renderArticle( record.value, { pdsUrl, did } );
			const description =
				record.value.description?.trim() ||
				text.slice( 0, DESCRIPTION_FALLBACK_CHARS ).trim() ||
				undefined;
			return {
				title: record.value.title?.trim() || 'Untitled',
				link: canonicalArticleUrl( handle, slug, rkey ),
				pubDate: new Date( record.value.publishedAt as string ),
				contentHtml,
				description,
			};
		} );

	const channel: FeedChannel = {
		title: publication.name,
		link: home,
		description: publication.description ?? '',
		feedUrl: `${ home }/rss.xml`,
		lastBuildDate: items[ 0 ]?.pubDate,
	};
	return buildRssFeed( channel, items );
}
