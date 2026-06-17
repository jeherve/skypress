/**
 * Pure builders for the records a SkyPress publish writes (Decision 0005).
 *
 * No `@atproto/*` or network here — just record-shaping, so it's fully unit-testable.
 * Orchestration (createRecord via the Agent) lives in `publisher.ts`.
 */
import type { BlockNode } from '../blocks/render';
import type { BlobRefJson } from '../media/blob';
import { parseBasicTheme, type BasicTheme } from './themes';
import { assemblePostText, type PostFacet } from './post-text';
import { graphemeLength } from './grapheme';
import type { Mention } from './mentions';

/**
 * Public origin for the stored publication + article URLs (and the Bluesky post link).
 * Set `PUBLIC_SITE_URL` to your own domain when self-hosting; it's baked into the build.
 * Must match the origin the app is actually served from.
 */
export const SITE_BASE =
	import.meta.env.PUBLIC_SITE_URL ?? 'https://skypress.blog';

export const CONTENT_TYPE = 'blog.skypress.content.gutenberg';
export const CONTENT_VERSION = 1;

export interface StrongRef {
	uri: string;
	cid: string;
}

/**
 * A publication's `url` — handle-namespaced under SkyPress (Decision 0010):
 * `<site>/@<handle>/<slug>`. The slug is frozen at creation; see `uniquePublicationSlug`.
 */
export function publicationHomeUrl( handle: string, slug: string ): string {
	return `${ SITE_BASE }/@${ handle }/${ slug }`;
}

/**
 * The document `path` (leading slash, per the lexicon). SkyPress addresses documents
 * by their record key (rkey), not a slug — stable across title edits and a direct
 * `getRecord` lookup for the renderer. The path stays publication-relative.
 */
export function articlePath( rkey: string ): string {
	return `/${ rkey }`;
}

/** Canonical article URL = publication url + path = `<base>/@<handle>/<slug>/<rkey>`. */
export function canonicalArticleUrl( handle: string, slug: string, rkey: string ): string {
	return `${ publicationHomeUrl( handle, slug ) }${ articlePath( rkey ) }`;
}

/**
 * The trailing slug segment of a publication `url` (the resolution key, Decision 0010),
 * or null for a slugless/legacy/malformed url. Matching by this segment (rather than the
 * full url) keeps resolution robust if the writer's handle later changes.
 */
export function publicationSlugFromUrl( url: string ): string | null {
	try {
		const segments = new URL( url ).pathname.split( '/' ).filter( Boolean );
		return segments.length >= 2 ? decodeURIComponent( segments[ segments.length - 1 ] ) : null;
	} catch {
		return null;
	}
}

/**
 * Whether a `site.standard.publication` url belongs to SkyPress (its origin === `SITE_BASE`).
 * SkyPress lists/edits/deletes/renders only its OWN publications — a writer may hold records
 * from other tools sharing the lexicon (Leaflet, …) and we must not touch those (Decision 0010).
 */
export function isSkyPressPublicationUrl( url: string ): boolean {
	try {
		return new URL( url ).origin === new URL( SITE_BASE ).origin;
	} catch {
		return false;
	}
}

/**
 * Derive a URL-safe slug from a publication name (Decision 0010): NFKD-normalise (so accents
 * fold to their base letter) → lowercase → trim → spaces to `-` → strip to `[a-z0-9-]` →
 * collapse and trim dashes. Returns '' for empty / emoji-only names; the caller then applies
 * the `pub-{rkey}` fallback.
 */
export function slugify( name: string ): string {
	return name
		.normalize( 'NFKD' )
		.replace( /[\u0300-\u036f]/g, '' )
		.toLowerCase()
		.trim()
		.replace( /\s+/g, '-' )
		.replace( /[^a-z0-9-]/g, '' )
		.replace( /-+/g, '-' )
		.replace( /^-+|-+$/g, '' );
}

/**
 * The frozen slug for a new publication: `slugify(name)`, de-duplicated against the writer's
 * existing SkyPress slugs by appending `-2`, `-3`, … (uniqueness is per-repo only — no global
 * registry, Decision 0010). Returns '' for an unslugifiable name so the caller can fall back
 * to `pub-{rkey}`.
 */
export function uniquePublicationSlug( name: string, existingSlugs: Iterable< string > ): string {
	const base = slugify( name );
	if ( ! base ) {
		return '';
	}
	const taken = new Set( existingSlugs );
	if ( ! taken.has( base ) ) {
		return base;
	}
	for ( let n = 2; ; n++ ) {
		const candidate = `${ base }-${ n }`;
		if ( ! taken.has( candidate ) ) {
			return candidate;
		}
	}
}

/**
 * Normalise live editor blocks to plain `BlockNode` JSON for storage: keep only
 * `name`/`attributes`/`innerBlocks`, drop the transient `clientId`, and JSON-round-trip
 * attributes so rich-text values serialise to plain strings.
 */
export function normalizeBlocks(
	blocks: ReadonlyArray< { name: string; attributes?: unknown; innerBlocks?: unknown[] } >
): BlockNode[] {
	return blocks.map( ( block ) => ( {
		name: block.name,
		attributes: JSON.parse( JSON.stringify( block.attributes ?? {} ) ),
		innerBlocks: normalizeBlocks(
			( block.innerBlocks ?? [] ) as Parameters< typeof normalizeBlocks >[ 0 ]
		),
	} ) );
}

export interface GutenbergContent {
	$type: typeof CONTENT_TYPE;
	version: number;
	blocks: BlockNode[];
	/**
	 * Optional flat list of accounts this document mentions, derived from the inline
	 * `<a data-did>` anchors. Additive interop hint for other appviews (Decision 0019);
	 * SkyPress's own reader resolves mentions from the anchors, not this field.
	 */
	mentions?: Array< { did: string; handle: string } >;
}

/** Wrap the block tree as the document's `content` union member. */
export function buildContentObject(
	blocks: BlockNode[],
	mentions: Mention[] = []
): GutenbergContent {
	return {
		$type: CONTENT_TYPE,
		version: CONTENT_VERSION,
		blocks,
		...( mentions.length
			? { mentions: mentions.map( ( m ) => ( { did: m.did, handle: m.handle } ) ) }
			: {} ),
	};
}

/**
 * The lexicon's open `preferences` object. SkyPress only sets `showInDiscover` — a hint to
 * standard.site-aware discovery surfaces that the (already wholly public) publication wants
 * to be discoverable (Decision 0020). Other tools (Leaflet, …) add their own keys; we read
 * back only `showInDiscover` and leave the field open.
 */
export interface PublicationPreferences {
	showInDiscover?: boolean;
}

/** Keep only the `showInDiscover` boolean from a stored/incoming preferences object, or undefined. */
export function parsePreferences( value: unknown ): PublicationPreferences | undefined {
	if ( ! value || typeof value !== 'object' ) {
		return undefined;
	}
	const showInDiscover = ( value as { showInDiscover?: unknown } ).showInDiscover;
	return typeof showInDiscover === 'boolean' ? { showInDiscover } : undefined;
}

export interface PublicationRecord {
	$type: 'site.standard.publication';
	url: string;
	name: string;
	description?: string;
	/** The publication logo (≤1MB, image/*) — the lexicon's `icon` blob (Decision 0010). */
	icon?: BlobRefJson;
	/** Optional sky-phase colour theme — the lexicon's `basicTheme` object (Decision 0012). */
	basicTheme?: BasicTheme;
	/** Open `preferences` object; SkyPress sets `showInDiscover` (Decision 0020). */
	preferences?: PublicationPreferences;
}

export function buildPublicationRecord( input: {
	handle: string;
	/** Frozen at creation; preserved verbatim on edit so the url never breaks. */
	slug: string;
	name?: string;
	description?: string;
	icon?: BlobRefJson;
	basicTheme?: BasicTheme;
	preferences?: PublicationPreferences;
} ): PublicationRecord {
	const trimmedName = input.name?.trim();
	const description = input.description?.trim();
	// Validate the theme at the write boundary too (symmetric with the read path): an invalid
	// theme is dropped rather than persisted, so no out-of-range channel can ever reach storage.
	const basicTheme = parseBasicTheme( input.basicTheme );
	const preferences = parsePreferences( input.preferences );
	return {
		$type: 'site.standard.publication',
		url: publicationHomeUrl( input.handle, input.slug ),
		name: trimmedName || input.handle,
		...( description ? { description } : {} ),
		...( input.icon ? { icon: input.icon } : {} ),
		...( basicTheme ? { basicTheme } : {} ),
		...( preferences ? { preferences } : {} ),
	};
}

export interface DocumentRecord {
	$type: 'site.standard.document';
	site: string;
	title: string;
	path: string;
	publishedAt: string;
	textContent: string;
	content: GutenbergContent;
	/** Optional per-article cover (≤1MB, image/*) — the standard.site coverImage field. */
	coverImage?: BlobRefJson;
	description?: string;
	bskyPostRef?: StrongRef;
	updatedAt?: string;
}

export function buildDocumentRecord( input: {
	title: string;
	rkey: string;
	blocks: BlockNode[];
	textContent: string;
	siteUri: string;
	publishedAt: string;
	/** Optional per-article cover blob ref to persist (design 2026-06-10). */
	coverImage?: BlobRefJson;
	description?: string;
	bskyPostRef?: StrongRef;
	/** Set on edit (Decision 0008); preserves publishedAt + bskyPostRef. */
	updatedAt?: string;
	/** Flat mention list to record on the content object (additive interop hint). */
	mentions?: Mention[];
} ): DocumentRecord {
	return {
		$type: 'site.standard.document',
		site: input.siteUri,
		title: input.title,
		path: articlePath( input.rkey ),
		publishedAt: input.publishedAt,
		textContent: input.textContent,
		content: buildContentObject( input.blocks, input.mentions ),
		...( input.coverImage ? { coverImage: input.coverImage } : {} ),
		...( input.description ? { description: input.description } : {} ),
		...( input.bskyPostRef ? { bskyPostRef: input.bskyPostRef } : {} ),
		...( input.updatedAt ? { updatedAt: input.updatedAt } : {} ),
	};
}

/** A `com.atproto.repo.strongRef` as embedded in `external.associatedRefs` (Decision 0013). */
export interface AssociatedRef extends StrongRef {
	$type: 'com.atproto.repo.strongRef';
}

export interface BskyPostRecord {
	$type: 'app.bsky.feed.post';
	text: string;
	createdAt: string;
	/** Marks the article URL as a clickable link, plus a #mention facet per cc-ed account (Decision 0013). */
	facets: PostFacet[];
	embed: {
		$type: 'app.bsky.embed.external';
		external: {
			uri: string;
			title: string;
			description: string;
			/** An image blob (≤1MB, image/*) shown on the link card — the og:image fallback (Decision 0014). */
			thumb?: BlobRefJson;
			/** strongRefs to the document + publication; drives the standard.site link card. */
			associatedRefs?: AssociatedRef[];
		};
	};
}

/** Bluesky rejects posts longer than this many graphemes. */
export const BSKY_POST_MAX_GRAPHEMES = 300;

/**
 * Throw if the companion post would exceed Bluesky's grapheme limit. Call this as a
 * PRE-FLIGHT in `publish()` (before any record is written) so the guard can't leave an
 * orphaned document; `buildBskyPost` also calls it as a final backstop. Inputs match
 * `assemblePostText`, so the assembled text is identical to what gets published.
 */
export function assertBskyPostWithinLimit( input: {
	title: string;
	articleUrl: string;
	bodyLede?: string;
	mentions?: Mention[];
} ): void {
	const { text } = assemblePostText( input );
	const length = graphemeLength( text );
	if ( length > BSKY_POST_MAX_GRAPHEMES ) {
		throw new Error(
			`Bluesky post is ${ length } characters; the limit is ${ BSKY_POST_MAX_GRAPHEMES }. Shorten the subtitle or remove a mention.`
		);
	}
}

/**
 * Build the companion Bluesky post (Decision 0005). Body text + facets come from
 * `assemblePostText` (shared with the editor's live counter): the body is
 * `title + lede + cc line + URL` (lede and cc line omitted when empty), and `facets` carries
 * the article-URL link facet plus a `#mention` facet per cc-ed account. `description`
 * populates ONLY the embed card subtitle; the writer-typed lede goes in the body via
 * `bodyLede`. `associatedRefs` drive the standard.site rich card (Decision 0013).
 */
export function buildBskyPost( input: {
	title: string;
	articleUrl: string;
	createdAt: string;
	description?: string;
	/** The writer-typed lede, placed in the post body (omitted when blank). */
	bodyLede?: string;
	/** Accounts to cc + notify via #mention facets. */
	mentions?: Mention[];
	/** Optional image blob for the card's `thumb` (the og:image fallback, Decision 0014). */
	thumb?: BlobRefJson;
	/** Document + publication strongRefs, in that order, for the standard.site card. */
	associatedRefs?: StrongRef[];
} ): BskyPostRecord {
	const { text, facets } = assemblePostText( {
		title: input.title,
		articleUrl: input.articleUrl,
		bodyLede: input.bodyLede,
		mentions: input.mentions,
	} );

	// Backstop: `publish()` already pre-flights this before writing any record.
	assertBskyPostWithinLimit( {
		title: input.title,
		articleUrl: input.articleUrl,
		bodyLede: input.bodyLede,
		mentions: input.mentions,
	} );

	return {
		$type: 'app.bsky.feed.post',
		text,
		createdAt: input.createdAt,
		facets,
		embed: {
			$type: 'app.bsky.embed.external',
			external: {
				uri: input.articleUrl,
				title: input.title,
				description: input.description ?? '',
				...( input.thumb ? { thumb: input.thumb } : {} ),
				...( input.associatedRefs && input.associatedRefs.length
					? {
							associatedRefs: input.associatedRefs.map( ( ref ) => ( {
								$type: 'com.atproto.repo.strongRef' as const,
								uri: ref.uri,
								cid: ref.cid,
							} ) ),
					  }
					: {} ),
			},
		},
	};
}
