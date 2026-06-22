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

/**
 * Self-contained card styles for the editor preview. `core/embed` renders the
 * preview html inside a sandboxed iframe (`<SandBox>`) that has no access to the
 * editor's stylesheet OR the site's theme tokens, so these must be inlined with
 * the html and use literal colors (not `var(--token)`). Kept roughly in sync with
 * `src/styles/embeds.css` — the reader uses that external stylesheet (themed),
 * this is only the in-editor preview approximation.
 */
const PREVIEW_STYLES =
	'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a}' +
	'.skypress-embed{margin:0;border:1px solid #e6e3dd;border-radius:10px;overflow:hidden;background:#faf9f6}' +
	'.skypress-embed--atproto .skypress-embed__link{display:block;padding:1rem 1.2rem;text-decoration:none;color:#1a1a1a}' +
	'.skypress-embed__head{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}' +
	'.skypress-embed__avatar{width:32px;height:32px;border-radius:50%;object-fit:cover}' +
	'.skypress-embed__author{font-weight:600}' +
	'.skypress-embed__handle{color:#6b6b6b;font-size:.92rem}' +
	'.skypress-embed__text{display:block;white-space:pre-wrap;line-height:1.5}' +
	'.skypress-embed__media{display:grid;gap:.4rem;margin-top:.75rem}' +
	'.skypress-embed__image{width:100%;border-radius:8px}' +
	'.skypress-embed__footer{display:block;margin-top:.75rem;font-size:.88rem;color:#6b6b6b}' +
	'.skypress-embed--placeholder .skypress-embed__text{padding:1rem 1.2rem;color:#6b6b6b}';

/** Prepend the inline preview styles so the card renders styled inside the SandBox iframe. */
function withPreviewStyles( html: string ): string {
	return `<style>${ PREVIEW_STYLES }</style>${ html }`;
}

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
	// Raw `fetch` (not `safeFetch`) is correct here: the editor is browser-only and
	// runs post-OAuth against the fixed public AppView host, so there's no SSRF surface.
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
		return { type: 'rich', version: '1.0', provider_name: 'Bluesky', html: withPreviewStyles( renderEmbedCard( card ) ) };
	}
	return {
		type: 'rich',
		version: '1.0',
		provider_name: PROVIDER_LABEL[ match.kind ],
		html: withPreviewStyles( placeholder( PROVIDER_LABEL[ match.kind ] ) ),
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
