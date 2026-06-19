/**
 * Linkify a writer's Bluesky bio the way the Bluesky client does.
 *
 * `app.bsky.actor.profile.description` is plain text — profile records carry no `facets`
 * (unlike `app.bsky.feed.post`). bsky.app computes the links at render time via
 * `RichText.detectFacets()`. We do the same with `detectFacetsWithoutResolution()`, which
 * needs no network: we link mentions by handle (not DID), so nothing has to be resolved.
 * That also keeps this off the SSRF-guarded fetch path entirely. (Decision 0015.)
 *
 * Returns ordered segments; the caller renders them with auto-escaping, never `set:html`.
 */
import { RichText } from '@atproto/api';
import { atmosphereProfileUrl, atmosphereHashtagUrl } from '../social/atmosphere-url';

export type BioSegment =
	| { type: 'text'; text: string }
	| { type: 'link'; text: string; href: string };

/**
 * The original `uri` if it is an http(s) URL, else null. `detectFacets` should only ever
 * produce http(s) links, but this guarantees a hostile PDS can't smuggle e.g. a
 * `javascript:` URL through. Returns the raw uri (not a normalised `URL.href`) so display
 * fidelity matches what the writer typed.
 */
export function safeHttpHref( uri: string ): string | null {
	try {
		const { protocol } = new URL( uri );
		return protocol === 'http:' || protocol === 'https:' ? uri : null;
	} catch {
		return null;
	}
}

export function detectBioSegments( description: string ): BioSegment[] {
	if ( ! description.trim() ) {
		return [];
	}

	const richText = new RichText( { text: description } );
	richText.detectFacetsWithoutResolution();

	const segments: BioSegment[] = [];
	for ( const segment of richText.segments() ) {
		let href: string | null = null;

		if ( segment.isLink() && segment.link ) {
			href = safeHttpHref( segment.link.uri );
		} else if ( segment.isMention() ) {
			const handle = segment.text.replace( /^@/, '' );
			href = handle ? atmosphereProfileUrl( handle ) : null;
		} else if ( segment.isTag() ) {
			const tag = segment.text.replace( /^#/, '' );
			href = tag ? atmosphereHashtagUrl( tag ) : null;
		}

		segments.push(
			href
				? { type: 'link', text: segment.text, href }
				: { type: 'text', text: segment.text }
		);
	}

	return segments;
}
