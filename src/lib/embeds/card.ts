// src/lib/embeds/card.ts
/**
 * Build trusted embed-card HTML from resolved data. Dependency-free (no
 * `@wordpress/*`) so the reader path and the editor share one renderer.
 *
 * SECURITY: the card structure is trusted, but every interpolated value comes
 * from a PDS or a provider's oEmbed (UNTRUSTED) and is passed through
 * `escapeHtml`. The video card is a facade — it carries no `<iframe>`; the
 * iframe is injected client-side on a play click, validated against a two-host
 * allowlist (see `playback.ts`). The whole card still passes through
 * `sanitizeArticleHtml` last (Decision 0018).
 */
export interface AtprotoImage { src: string; alt: string }

export interface AtprotoCardData {
	kind: 'atproto';
	authorName: string;
	handle: string;
	avatar?: string;
	text: string;
	images: AtprotoImage[];
	createdAt?: string;
	viewUrl: string;
}

export interface VideoCardData {
	kind: 'youtube' | 'vimeo';
	id: string;
	title: string;
	thumbnail: string;
	url: string;
}

export type EmbedData = AtprotoCardData | VideoCardData;

/** Allow only http(s) URLs in href/src; anything else (javascript:, data:, …) → ''. */
function safeHttpUrl( value: string ): string {
	try {
		const protocol = new URL( value ).protocol;
		return protocol === 'https:' || protocol === 'http:' ? value : '';
	} catch {
		return '';
	}
}

export function escapeHtml( value: string ): string {
	return value
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' )
		.replace( /'/g, '&#39;' );
}

function atprotoCard( d: AtprotoCardData ): string {
	const avatar = d.avatar
		? `<img class="skypress-embed__avatar" src="${ escapeHtml( safeHttpUrl( d.avatar ) ) }" alt=""/>`
		: '';
	const images = d.images
		.map(
			( img ) =>
				`<img class="skypress-embed__image" src="${ escapeHtml( safeHttpUrl( img.src ) ) }" alt="${ escapeHtml( img.alt ) }"/>`
		)
		.join( '' );
	const text = escapeHtml( d.text ).replace( /\n/g, '<br/>' );
	return (
		`<figure class="wp-block-embed skypress-embed skypress-embed--atproto">` +
		`<a class="skypress-embed__link" href="${ escapeHtml( safeHttpUrl( d.viewUrl ) ) }">` +
		`<span class="skypress-embed__head">${ avatar }` +
		`<span class="skypress-embed__author">${ escapeHtml( d.authorName ) }</span>` +
		`<span class="skypress-embed__handle">@${ escapeHtml( d.handle ) }</span></span>` +
		`<span class="skypress-embed__text">${ text }</span>` +
		( images ? `<span class="skypress-embed__media">${ images }</span>` : '' ) +
		`<span class="skypress-embed__footer">🌀 View on the ATmosphere</span>` +
		`</a></figure>`
	);
}

function videoCard( d: VideoCardData ): string {
	return (
		`<figure class="wp-block-embed skypress-embed skypress-embed--video">` +
		`<button type="button" class="skypress-embed__play" data-embed-provider="${ escapeHtml( d.kind ) }" data-embed-id="${ escapeHtml( d.id ) }">` +
		`<img class="skypress-embed__thumb" src="${ escapeHtml( safeHttpUrl( d.thumbnail ) ) }" alt=""/>` +
		`<span class="skypress-embed__playicon" aria-hidden="true">▶</span>` +
		`<span class="skypress-embed__title">${ escapeHtml( d.title ) }</span>` +
		`</button>` +
		`<a class="skypress-embed__fallback" href="${ escapeHtml( safeHttpUrl( d.url ) ) }">Watch on ${ d.kind === 'youtube' ? 'YouTube' : 'Vimeo' }</a>` +
		`</figure>`
	);
}

export function renderEmbedCard( data: EmbedData ): string {
	return data.kind === 'atproto' ? atprotoCard( data ) : videoCard( data );
}
