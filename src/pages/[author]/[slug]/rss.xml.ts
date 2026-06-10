import type { APIRoute } from 'astro';
import { resolvePublicationContext } from '../../../lib/reader/read-context';
import { buildPublicationFeedXml } from '../../../lib/feed/publication-feed';

/**
 * Full-content RSS 2.0 feed for one publication (Decision 0011): `/@<handle>/<slug>/rss.xml`.
 *
 * A read-through server endpoint (`prerender = false`) like the reading pages it mirrors
 * (Decision 0007): `resolvePublicationContext` resolves the author + publication and lists
 * the publication's documents (SSRF-guarded, one PDS fetch — no per-article round-trip,
 * since each document carries its full `content.blocks`), then hands off to the pure,
 * test-locked feed builder. 404s on an unresolvable author or unknown publication, with
 * the same error mapping as the publication page.
 */
export const prerender = false;

export const GET: APIRoute = async ( { params } ) => {
	const result = await resolvePublicationContext( params.author, params.slug );
	if ( ! result.ok ) {
		return new Response( 'Not found', { status: result.error.status } );
	}
	const { author, publication, documents } = result.context;

	const xml = buildPublicationFeedXml( {
		handle: author.handle,
		slug: publication.slug,
		pdsUrl: author.pdsUrl,
		did: author.did,
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
