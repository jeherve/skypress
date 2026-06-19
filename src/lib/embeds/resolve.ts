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
	const e = embed as { $type?: string; images?: { fullsize?: string; thumb?: string; alt?: string }[] };
	if ( ! e || ! Array.isArray( e.images ) ) {
		return [];
	}
	return e.images
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

export async function resolveEmbeds(
	blocks: BlockNode[],
	options: { only?: EmbedKind[]; fetchImpl?: FetchLike } = {}
): Promise< BlockNode[] > {
	const fetchImpl = options.fetchImpl ?? defaultFetch;
	return Promise.all(
		blocks.map( async ( block ) => {
			const innerBlocks = await resolveEmbeds( block.innerBlocks ?? [], options );
			let attributes = { ...block.attributes };
			if ( block.name === 'core/embed' && typeof block.attributes?.url === 'string' ) {
				const data = await resolveOne( block.attributes.url, options.only, fetchImpl );
				if ( data ) {
					attributes = { ...attributes, _skypressEmbed: data };
				}
			}
			return { name: block.name, attributes, innerBlocks };
		} )
	);
}
