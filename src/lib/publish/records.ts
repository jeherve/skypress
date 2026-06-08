/**
 * Pure builders for the records a SkyPress publish writes (Decision 0005).
 *
 * No `@atproto/*` or network here — just record-shaping, so it's fully unit-testable.
 * Orchestration (createRecord via the Agent) lives in `publisher.ts`.
 */
import type { BlockNode } from '../blocks/render';

/** Public base origin for canonical article URLs (finalised at deploy, SP7). */
export const SKYPRESS_BASE = 'https://skypress.blog';

export const CONTENT_TYPE = 'blog.skypress.content.gutenberg';
export const CONTENT_VERSION = 1;

export interface StrongRef {
	uri: string;
	cid: string;
}

/**
 * The writer's SkyPress homepage — the publication's `url`. Handles are prefixed
 * with `@` (e.g. `https://skypress.blog/@alice.bsky.social`).
 */
export function publicationHomeUrl( handle: string ): string {
	return `${ SKYPRESS_BASE }/@${ handle }`;
}

/**
 * The document `path` (leading slash, per the lexicon). SkyPress addresses documents
 * by their record key (rkey), not a slug — stable across title edits and a direct
 * `getRecord` lookup for the renderer.
 */
export function articlePath( rkey: string ): string {
	return `/${ rkey }`;
}

/** Canonical article URL = publication url + path = `<base>/@<handle>/<rkey>`. */
export function canonicalArticleUrl( handle: string, rkey: string ): string {
	return `${ publicationHomeUrl( handle ) }${ articlePath( rkey ) }`;
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
}

/** Wrap the block tree as the document's `content` union member. */
export function buildContentObject( blocks: BlockNode[] ): GutenbergContent {
	return { $type: CONTENT_TYPE, version: CONTENT_VERSION, blocks };
}

export interface PublicationRecord {
	$type: 'site.standard.publication';
	url: string;
	name: string;
	description?: string;
}

export function buildPublicationRecord( input: {
	handle: string;
	name?: string;
	description?: string;
} ): PublicationRecord {
	return {
		$type: 'site.standard.publication',
		url: publicationHomeUrl( input.handle ),
		name: input.name ?? input.handle,
		...( input.description ? { description: input.description } : {} ),
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
	description?: string;
	bskyPostRef?: StrongRef;
}

export function buildDocumentRecord( input: {
	title: string;
	rkey: string;
	blocks: BlockNode[];
	textContent: string;
	siteUri: string;
	publishedAt: string;
	description?: string;
	bskyPostRef?: StrongRef;
} ): DocumentRecord {
	return {
		$type: 'site.standard.document',
		site: input.siteUri,
		title: input.title,
		path: articlePath( input.rkey ),
		publishedAt: input.publishedAt,
		textContent: input.textContent,
		content: buildContentObject( input.blocks ),
		...( input.description ? { description: input.description } : {} ),
		...( input.bskyPostRef ? { bskyPostRef: input.bskyPostRef } : {} ),
	};
}

export interface BskyPostRecord {
	$type: 'app.bsky.feed.post';
	text: string;
	createdAt: string;
	embed: {
		$type: 'app.bsky.embed.external';
		external: {
			uri: string;
			title: string;
			description: string;
		};
	};
}

export function buildBskyPost( input: {
	title: string;
	articleUrl: string;
	createdAt: string;
	description?: string;
} ): BskyPostRecord {
	return {
		$type: 'app.bsky.feed.post',
		text: `${ input.title }\n\n${ input.articleUrl }`,
		createdAt: input.createdAt,
		embed: {
			$type: 'app.bsky.embed.external',
			external: {
				uri: input.articleUrl,
				title: input.title,
				description: input.description ?? '',
			},
		},
	};
}
