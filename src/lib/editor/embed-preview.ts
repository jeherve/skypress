/**
 * Make `core/embed` resolve previews without a WordPress backend. `core/embed`
 * fetches `/oembed/1.0/proxy?url=…` via `@wordpress/api-fetch`; we register a
 * middleware that answers that path from our own embed registry:
 *   - atproto  → a real card (CORS-friendly AppView), reusing the reader's
 *     `fetchAtprotoCard` + `renderEmbedCard` so editor and reader match exactly;
 *   - youtube/vimeo → a placeholder (their oEmbed isn't browser-CORS-reachable);
 *   - anything else → pass through (the URL stays a plain link).
 */
import apiFetch from '@wordpress/api-fetch';
import { detectEmbed } from '../embeds/registry';
import { fetchAtprotoCard, type FetchLike } from '../embeds/resolve';
import { renderEmbedCard } from '../embeds/card';

interface EmbedPreview {
	type: 'rich';
	version: '1.0';
	provider_name: string;
	html: string;
}

const PROVIDER_LABEL: Record< 'youtube' | 'vimeo', string > = {
	youtube: 'YouTube',
	vimeo: 'Vimeo',
};

function placeholder( label: string ): string {
	return (
		`<figure class="wp-block-embed skypress-embed skypress-embed--placeholder">` +
		`<span class="skypress-embed__text">▶ ${ label } — renders on your published page</span>` +
		`</figure>`
	);
}

/**
 * Resolve a candidate embed URL into an oEmbed-shaped preview for `core/embed`.
 *
 * @param url       - The URL `core/embed` is trying to embed.
 * @param fetchImpl - Fetch used for atproto card lookups (injectable for tests).
 * @returns A rich oEmbed-shaped preview, or `null` when the URL is not embeddable.
 */
export async function buildEmbedPreview(
	url: string,
	fetchImpl: FetchLike = ( u ) => fetch( u )
): Promise< EmbedPreview | null > {
	const match = detectEmbed( url );
	if ( ! match ) {
		return null;
	}
	if ( match.kind === 'atproto' ) {
		const card = await fetchAtprotoCard( match, fetchImpl );
		if ( ! card ) {
			return null;
		}
		return { type: 'rich', version: '1.0', provider_name: 'Bluesky', html: renderEmbedCard( card ) };
	}
	return {
		type: 'rich',
		version: '1.0',
		provider_name: PROVIDER_LABEL[ match.kind ],
		html: placeholder( PROVIDER_LABEL[ match.kind ] ),
	};
}

/** Extract the `url` query arg from the embed-proxy apiFetch path. */
function proxyUrl( path?: string ): string | null {
	if ( ! path || ! path.includes( '/oembed/1.0/proxy' ) ) {
		return null;
	}
	const q = path.indexOf( '?' );
	if ( q === -1 ) {
		return null;
	}
	return new URLSearchParams( path.slice( q + 1 ) ).get( 'url' );
}

let registered = false;

/**
 * Register the `@wordpress/api-fetch` middleware that answers `core/embed`'s
 * `/oembed/1.0/proxy` requests from our embed registry. Idempotent — registers once.
 */
export function registerEmbedPreviewMiddleware(): void {
	if ( registered ) {
		return;
	}
	registered = true;
	apiFetch.use( async ( options, next ) => {
		const url = proxyUrl( ( options as { path?: string } ).path );
		if ( ! url ) {
			return next( options );
		}
		const preview = await buildEmbedPreview( url );
		// Resolve with our preview, or surface a 404 so core/embed shows "cannot
		// embed" (a clean link) rather than spinning forever.
		if ( preview ) {
			return preview as unknown as ReturnType< typeof next >;
		}
		throw { code: 'oembed_invalid_url', message: 'Not an embeddable URL' };
	} );
}
