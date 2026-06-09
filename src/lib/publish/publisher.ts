import type { Agent } from '@atproto/api';
import { TID } from '@atproto/common-web';
import {
	buildDocumentRecord,
	buildBskyPost,
	canonicalArticleUrl,
	type StrongRef,
} from './records';
import { listPublications } from './publications';
import { firstImageBlobRef } from '../media/blob';
import { blocksToText, type BlockNode } from '../blocks/render';

const DOCUMENT_COLLECTION = 'site.standard.document';
const POST_COLLECTION = 'app.bsky.feed.post';

/** createRecord types `record` as an open index signature; our records are precise. */
function asRecord( value: object ): Record< string, unknown > {
	return value as Record< string, unknown >;
}

/** rkey is the last segment of an AT-URI. */
function rkeyFromUri( uri: string ): string {
	return uri.split( '/' ).pop() ?? '';
}

export interface Identity {
	did: string;
	/** Handle for human-readable URLs; falls back to DID if unresolved. */
	handle: string | null;
}

export interface PublishInput {
	title: string;
	blocks: BlockNode[];
	description?: string;
	/** The chosen target publication's AT-URI (Decision 0010 — no more auto-create). */
	publicationUri: string;
	/** Its current cid, for the post's `associatedRefs` strongRef (Decision 0013). */
	publicationCid: string;
	/** Its frozen slug, needed to build the article URL. */
	publicationSlug: string;
}

export interface PublishResult {
	publicationUri: string;
	documentUri: string;
	postUri: string;
	articleUrl: string;
}

/**
 * The publish flow (Decision 0005), targeting a CHOSEN publication (Decision 0010) and embedding
 * the standard.site link card refs in the Bluesky post (Decision 0013).
 *
 * Three writes, in an order that satisfies the mutual references:
 *   1. Create the DOCUMENT (no `bskyPostRef` yet) — yields its strongRef (uri + cid).
 *   2. Create the POST with a link facet + `associatedRefs` to the document & publication.
 *   3. `putRecord` the document to add `bskyPostRef` (kept for unpublish/cascade-delete).
 * Step 3 re-cids the document, so the post's document ref is one version stale — harmless, as the
 * AppView resolves `associatedRefs` by URI (this is how standard.site itself behaves).
 *
 * NOTE: this also creates a PUBLIC Bluesky post. Callers must have made that unmistakable to
 * the user first (brief §10).
 */
export async function publish(
	agent: Agent,
	identity: Identity,
	input: PublishInput
): Promise< PublishResult > {
	const { did } = identity;
	const handle = identity.handle ?? did;
	const now = new Date().toISOString();
	// Generate the document's rkey up front so the article URL (which the Bluesky post
	// embeds) is known before either record is written — no circular dependency.
	const rkey = TID.nextStr();
	const articleUrl = canonicalArticleUrl( handle, input.publicationSlug, rkey );
	const textContent = blocksToText( input.blocks );

	// 1. Document first (no bskyPostRef yet) so the post can embed its strongRef.
	const docRes = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: DOCUMENT_COLLECTION,
		rkey,
		record: asRecord(
			buildDocumentRecord( {
				title: input.title,
				rkey,
				blocks: input.blocks,
				textContent,
				siteUri: input.publicationUri,
				publishedAt: now,
				description: input.description,
			} )
		),
	} );
	const documentRef: StrongRef = { uri: docRes.data.uri, cid: docRes.data.cid };
	const publicationRef: StrongRef = { uri: input.publicationUri, cid: input.publicationCid };

	// 2. Post with the clickable link facet + standard.site associatedRefs (document, publication).
	const postRes = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: POST_COLLECTION,
		record: asRecord(
			buildBskyPost( {
				title: input.title,
				articleUrl,
				description: input.description,
				createdAt: now,
				// Reuse the first uploaded image's in-repo blob as the card thumb (Decision 0014).
				thumb: firstImageBlobRef( input.blocks ),
				associatedRefs: [ documentRef, publicationRef ],
			} )
		),
	} );
	const bskyPostRef: StrongRef = { uri: postRes.data.uri, cid: postRes.data.cid };

	// 3. Point the document back at its companion post (preserved for unpublish/cascade-delete).
	await agent.com.atproto.repo.putRecord( {
		repo: did,
		collection: DOCUMENT_COLLECTION,
		rkey,
		record: asRecord(
			buildDocumentRecord( {
				title: input.title,
				rkey,
				blocks: input.blocks,
				textContent,
				siteUri: input.publicationUri,
				publishedAt: now,
				description: input.description,
				bskyPostRef,
			} )
		),
	} );

	return {
		publicationUri: input.publicationUri,
		documentUri: docRes.data.uri,
		postUri: postRes.data.uri,
		articleUrl,
	};
}

export interface UpdateInput {
	title: string;
	blocks: BlockNode[];
	description?: string;
	/** The existing document's record key (URL stays stable, Decision 0008). */
	rkey: string;
	/** Preserved from the original publish. */
	siteUri: string;
	/** The owning publication's frozen slug, for the article URL. */
	publicationSlug: string;
	publishedAt: string;
	bskyPostRef?: StrongRef;
}

/**
 * Edit a published article in place (Decision 0008): `putRecord` on the SAME rkey, stamping
 * `updatedAt` while preserving `publishedAt` + `bskyPostRef`. Does NOT create a new Bluesky
 * post — the original post keeps pointing at the (now-updated) URL.
 */
export async function updateDocument(
	agent: Agent,
	identity: Identity,
	input: UpdateInput
): Promise< { documentUri: string; articleUrl: string } > {
	const { did } = identity;
	const handle = identity.handle ?? did;
	const now = new Date().toISOString();
	const articleUrl = canonicalArticleUrl( handle, input.publicationSlug, input.rkey );

	const res = await agent.com.atproto.repo.putRecord( {
		repo: did,
		collection: DOCUMENT_COLLECTION,
		rkey: input.rkey,
		record: asRecord(
			buildDocumentRecord( {
				title: input.title,
				rkey: input.rkey,
				blocks: input.blocks,
				textContent: blocksToText( input.blocks ),
				siteUri: input.siteUri,
				publishedAt: input.publishedAt,
				description: input.description,
				bskyPostRef: input.bskyPostRef,
				updatedAt: now,
			} )
		),
	} );
	return { documentUri: res.data.uri, articleUrl };
}

/**
 * Unpublish an article (Decision 0008): delete the document AND its companion Bluesky post.
 * The publication record is left intact.
 */
export async function unpublish(
	agent: Agent,
	did: string,
	input: { rkey: string; bskyPostRef?: StrongRef }
): Promise< void > {
	await agent.com.atproto.repo.deleteRecord( {
		repo: did,
		collection: DOCUMENT_COLLECTION,
		rkey: input.rkey,
	} );
	if ( input.bskyPostRef?.uri ) {
		try {
			await agent.com.atproto.repo.deleteRecord( {
				repo: did,
				collection: POST_COLLECTION,
				rkey: rkeyFromUri( input.bskyPostRef.uri ),
			} );
		} catch {
			// the post may already be gone; the document deletion is what matters
		}
	}
}

export interface MyArticle {
	rkey: string;
	title: string;
	description?: string;
	publishedAt?: string;
	updatedAt?: string;
	/** The owning publication's AT-URI (`doc.site`). */
	siteUri: string;
	/** The owning publication's frozen slug (for building URLs + the update call). */
	siteSlug: string;
	bskyPostRef?: StrongRef;
	blocks: BlockNode[];
}

interface RawDocValue {
	title?: string;
	description?: string;
	publishedAt?: string;
	updatedAt?: string;
	site?: string;
	bskyPostRef?: StrongRef;
	content?: { blocks?: BlockNode[] };
}

function toMyArticle(
	record: { uri: string; value: unknown },
	siteUri: string,
	siteSlug: string
): MyArticle {
	const value = record.value as RawDocValue;
	return {
		rkey: rkeyFromUri( record.uri ),
		title: value.title ?? 'Untitled',
		description: value.description,
		publishedAt: value.publishedAt,
		updatedAt: value.updatedAt,
		siteUri,
		siteSlug,
		bskyPostRef: value.bskyPostRef,
		blocks: value.content?.blocks ?? [],
	};
}

/** List one publication's documents, annotated with its slug (the per-publication Posts tab). */
export async function listPublicationArticles(
	agent: Agent,
	did: string,
	publication: { uri: string; slug: string }
): Promise< MyArticle[] > {
	const docs = await agent.com.atproto.repo.listRecords( {
		repo: did,
		collection: DOCUMENT_COLLECTION,
		limit: 100,
	} );
	return docs.data.records
		.filter( ( record ) => ( record.value as RawDocValue )?.site === publication.uri )
		.map( ( record ) => toMyArticle( record, publication.uri, publication.slug ) );
}

/**
 * List ALL the writer's SkyPress articles across their publications, each annotated with its
 * publication slug. Documents whose `site` isn't one of the writer's known SkyPress
 * publications (orphans, or another tool's) are dropped — the editor only edits its own.
 */
export async function listAllMyArticles( agent: Agent, did: string ): Promise< MyArticle[] > {
	const pubs = await listPublications( agent, did );
	const bySite = new Map( pubs.map( ( pub ) => [ pub.uri, pub ] as const ) );
	const docs = await agent.com.atproto.repo.listRecords( {
		repo: did,
		collection: DOCUMENT_COLLECTION,
		limit: 100,
	} );
	return docs.data.records
		.map( ( record ) => {
			const site = ( record.value as RawDocValue )?.site;
			const pub = site ? bySite.get( site ) : undefined;
			return pub ? toMyArticle( record, pub.uri, pub.slug ) : null;
		} )
		.filter( ( article ): article is MyArticle => article !== null );
}
