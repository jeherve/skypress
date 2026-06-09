import type { APIRoute } from 'astro';
import { resolveAuthor } from '../../../lib/reader/identity';
import { listRecords } from '../../../lib/reader/records';
import { resolveReaderPublication } from '../../../lib/reader/publications';
import {
	buildPublicationFeedXml,
	type FeedDocumentValue,
} from '../../../lib/feed/publication-feed';

/**
 * Full-content RSS 2.0 feed for one publication (Decision 0011): `/@<handle>/<slug>/rss.xml`.
 *
 * A read-through server endpoint (`prerender = false`) like the reading pages it mirrors
 * (Decision 0007): resolve the author + publication, list `site.standard.document` (one
 * SSRF-guarded PDS fetch — no per-article round-trip, since `listRecords` returns each
 * document's full `content.blocks`), then hand off to the pure, test-locked feed builder.
 * 404s on an unresolvable author or unknown publication, matching the publication page.
 */
export const prerender = false;

export const GET: APIRoute = async ( { params } ) => {
	const { author, slug } = params;
	if ( ! author || ! author.startsWith( '@' ) || ! slug ) {
		return new Response( 'Not found', { status: 404 } );
	}
	const handle = author.slice( 1 );

	const resolved = await resolveAuthor( handle );
	if ( ! resolved ) {
		return new Response( `Could not resolve @${ handle }`, { status: 404 } );
	}
	const { did, pdsUrl } = resolved;

	const publication = await resolveReaderPublication( pdsUrl, did, slug );
	if ( ! publication ) {
		return new Response( 'Publication not found', { status: 404 } );
	}

	// Fetch the writer's 100 most recent documents (across all their publications), then
	// `buildPublicationFeedXml` filters to this one and keeps the newest 20. A writer with
	// >100 total documents could thus have older items in this publication omitted from the
	// feed — the same bound the publication page (`index.astro`) already applies.
	const documents = await listRecords< FeedDocumentValue >(
		pdsUrl,
		did,
		'site.standard.document',
		100
	);

	const xml = buildPublicationFeedXml( {
		handle,
		slug,
		pdsUrl,
		did,
		publication,
		documents,
	} );

	return new Response( xml, {
		headers: {
			'content-type': 'application/rss+xml; charset=utf-8',
			'cache-control': 'public, max-age=300',
		},
	} );
};
