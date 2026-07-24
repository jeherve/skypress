// src/lib/embeds/resolve.ts
/**
 * Resolve recognised `core/embed` URLs into card DATA at read time, attached onto
 * the node as `attributes._skypressEmbed`. Server-side fetches go through
 * `safeFetch` (SSRF guard, AGENTS.md rule 6a); a `fetchImpl` can be injected for
 * tests and for the browser editor preview (CORS-friendly AppView). Any failure
 * resolves to null → the node keeps no payload → `render.ts` falls back to a link.
 * Dependency-free (no `@wordpress/*`).
 */
import type { BlockNode } from '../blocks/render';
import { safeFetch } from '../net/safe-fetch';
import { atmospherePostWebUrl } from '../social/atmosphere-url';
import { detectEmbed, type EmbedKind, type EmbedMatch } from './registry';
import type { AtprotoCardData, AtprotoImage, VideoCardData } from './card';

export type FetchLike = ( url: string ) => Promise< Response >;

const APPVIEW = 'https://public.api.bsky.app';
const defaultFetch: FetchLike = ( url ) => safeFetch( url );

function extractImages( embed: unknown ): AtprotoImage[] {
	type ImageView = { fullsize?: string; thumb?: string; alt?: string };
	const e = embed as { $type?: string; images?: ImageView[]; media?: { images?: ImageView[] } };
	// Direct `images#view` carries `images`; a `recordWithMedia#view` quote-post nests them under `media.images`.
	const images = Array.isArray( e?.images ) ? e.images : Array.isArray( e?.media?.images ) ? e.media.images : null;
	if ( ! images ) {
		return [];
	}
	return images
		.map( ( img ) => ( { src: img.fullsize ?? img.thumb ?? '', alt: img.alt ?? '' } ) )
		.filter( ( img ) => img.src );
}

export async function fetchAtprotoCard(
	match: EmbedMatch,
	fetchImpl: FetchLike = defaultFetch
): Promise< AtprotoCardData | null > {
	try {
		const [ authority, rkey ] = match.id.split( '/' );
		let did = authority;
		if ( ! did.startsWith( 'did:' ) ) {
			const profileRes = await fetchImpl(
				`${ APPVIEW }/xrpc/app.bsky.actor.getProfile?actor=${ encodeURIComponent( authority ) }`
			);
			if ( ! profileRes.ok ) {
				return null;
			}
			const profile = ( await profileRes.json() ) as { did?: string };
			if ( ! profile.did ) {
				return null;
			}
			did = profile.did;
		}

		const uri = `at://${ did }/app.bsky.feed.post/${ rkey }`;
		const res = await fetchImpl(
			`${ APPVIEW }/xrpc/app.bsky.feed.getPosts?uris=${ encodeURIComponent( uri ) }`
		);
		if ( ! res.ok ) {
			return null;
		}
		const data = ( await res.json() ) as { posts?: PostView[] };
		const post = data.posts?.[ 0 ];
		if ( ! post ) {
			return null;
		}
		const handle = post.author?.handle ?? '';
		return {
			kind: 'atproto',
			authorName: post.author?.displayName || `@${ handle }`,
			handle,
			avatar: post.author?.avatar,
			text: post.record?.text ?? '',
			images: extractImages( post.embed ),
			createdAt: post.record?.createdAt,
			viewUrl: atmospherePostWebUrl( uri ),
		};
	} catch {
		return null;
	}
}

interface PostView {
	uri: string;
	author?: { handle?: string; displayName?: string; avatar?: string };
	record?: { text?: string; createdAt?: string };
	embed?: unknown;
}

const OEMBED_ENDPOINTS: Record< 'youtube' | 'vimeo', ( id: string ) => string > = {
	youtube: ( id ) =>
		`https://www.youtube.com/oembed?format=json&url=${ encodeURIComponent(
			`https://www.youtube.com/watch?v=${ id }`
		) }`,
	vimeo: ( id ) => `https://vimeo.com/api/oembed.json?url=${ encodeURIComponent( `https://vimeo.com/${ id }` ) }`,
};

function watchUrl( kind: 'youtube' | 'vimeo', id: string ): string {
	return kind === 'youtube' ? `https://www.youtube.com/watch?v=${ id }` : `https://vimeo.com/${ id }`;
}

export async function fetchVideoCard(
	match: EmbedMatch,
	fetchImpl: FetchLike = defaultFetch
): Promise< VideoCardData | null > {
	if ( match.kind !== 'youtube' && match.kind !== 'vimeo' ) {
		return null;
	}
	try {
		const res = await fetchImpl( OEMBED_ENDPOINTS[ match.kind ]( match.id ) );
		if ( ! res.ok ) {
			return null;
		}
		const data = ( await res.json() ) as { title?: string; thumbnail_url?: string };
		if ( ! data.thumbnail_url ) {
			return null;
		}
		return {
			kind: match.kind,
			id: match.id,
			title: data.title ?? '',
			thumbnail: data.thumbnail_url,
			url: watchUrl( match.kind, match.id ),
		};
	} catch {
		return null;
	}
}

async function resolveOne( url: string, only: EmbedKind[] | undefined, fetchImpl: FetchLike ) {
	const match = detectEmbed( url );
	if ( ! match || ( only && ! only.includes( match.kind ) ) ) {
		return null;
	}
	return match.kind === 'atproto'
		? fetchAtprotoCard( match, fetchImpl )
		: fetchVideoCard( match, fetchImpl );
}

/**
 * Read-time bound on how many DISTINCT embed URLs one document may resolve.
 * `content.blocks` is untrusted PDS data with no lexicon cap on its length, and
 * each recognised `core/embed` fires one-to-two outbound fetches (a handle-form
 * atproto URL forces both a getProfile and a getPosts). Without a cap a single
 * small record could carry thousands of embeds and turn one page view into
 * thousands of concurrent subrequests — exhausting the worker's budget and
 * turning SkyPress into a traffic-amplification proxy (CWE-400). Embeds beyond
 * the cap keep no payload → `render.ts` falls back to a plain link, exactly like
 * a failed resolve.
 */
const MAX_EMBEDS_PER_DOCUMENT = 50;

/**
 * How many embed resolutions run at once. Bounds peak concurrent outbound
 * fetches (and in-flight `Response` objects) instead of firing every embed in a
 * single unbounded `Promise.all`.
 */
const EMBED_RESOLUTION_CONCURRENCY = 6;

/** Depth-first walk collecting distinct embed URLs in document order, stopping once `limit` is reached. */
function collectEmbedUrls( blocks: BlockNode[], out: Set< string >, limit: number ): void {
	for ( const block of blocks ) {
		if ( out.size >= limit ) {
			return;
		}
		if ( block.name === 'core/embed' && typeof block.attributes?.url === 'string' ) {
			out.add( block.attributes.url );
		}
		if ( block.innerBlocks?.length ) {
			collectEmbedUrls( block.innerBlocks, out, limit );
		}
	}
}

/** Resolve `urls` through a fixed-size worker pool → a `url → card data` map (misses omitted). */
async function resolveInPool(
	urls: string[],
	only: EmbedKind[] | undefined,
	fetchImpl: FetchLike
): Promise< Map< string, AtprotoCardData | VideoCardData > > {
	const resolved = new Map< string, AtprotoCardData | VideoCardData >();
	let cursor = 0;
	const worker = async (): Promise< void > => {
		while ( cursor < urls.length ) {
			const url = urls[ cursor++ ];
			const data = await resolveOne( url, only, fetchImpl );
			if ( data ) {
				resolved.set( url, data );
			}
		}
	};
	const workers = Math.min( EMBED_RESOLUTION_CONCURRENCY, urls.length );
	await Promise.all( Array.from( { length: workers }, () => worker() ) );
	return resolved;
}

/** Rebuild the tree, attaching resolved card data onto every embed whose URL resolved. */
function attachEmbeds(
	blocks: BlockNode[],
	resolved: Map< string, AtprotoCardData | VideoCardData >
): BlockNode[] {
	return blocks.map( ( block ) => {
		const innerBlocks = attachEmbeds( block.innerBlocks ?? [], resolved );
		let attributes = { ...block.attributes };
		if ( block.name === 'core/embed' && typeof block.attributes?.url === 'string' ) {
			const data = resolved.get( block.attributes.url );
			if ( data ) {
				attributes = { ...attributes, _skypressEmbed: data };
			}
		}
		return { name: block.name, attributes, innerBlocks };
	} );
}

export async function resolveEmbeds(
	blocks: BlockNode[],
	options: { only?: EmbedKind[]; fetchImpl?: FetchLike } = {}
): Promise< BlockNode[] > {
	const fetchImpl = options.fetchImpl ?? defaultFetch;
	// Bound the fan-out over untrusted content: collect at most
	// MAX_EMBEDS_PER_DOCUMENT distinct URLs, resolve them through a fixed-size
	// pool, then attach the results back onto every matching node. Deduplicating
	// and capping the URLs — not the nodes — means repeated or overflow embeds
	// never multiply the outbound fetch count.
	const urls = new Set< string >();
	collectEmbedUrls( blocks, urls, MAX_EMBEDS_PER_DOCUMENT );
	const resolved = await resolveInPool( [ ...urls ], options.only, fetchImpl );
	return attachEmbeds( blocks, resolved );
}

export { MAX_EMBEDS_PER_DOCUMENT, EMBED_RESOLUTION_CONCURRENCY };
