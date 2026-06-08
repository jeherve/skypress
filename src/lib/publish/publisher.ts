import type { Agent } from '@atproto/api';
import { TID } from '@atproto/common-web';
import {
	buildPublicationRecord,
	buildDocumentRecord,
	buildBskyPost,
	canonicalArticleUrl,
	publicationHomeUrl,
	type StrongRef,
} from './records';
import { blocksToText, type BlockNode } from '../blocks/render';

const PUBLICATION_COLLECTION = 'site.standard.publication';
const DOCUMENT_COLLECTION = 'site.standard.document';
const POST_COLLECTION = 'app.bsky.feed.post';

/** createRecord types `record` as an open index signature; our records are precise. */
function asRecord( value: object ): Record< string, unknown > {
	return value as Record< string, unknown >;
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
}

export interface PublishResult {
	publicationUri: string;
	documentUri: string;
	postUri: string;
	articleUrl: string;
}

/**
 * Find SkyPress's OWN publication (matched by its `url` = the writer's SkyPress
 * homepage), or create one. Returns its `at://` URI.
 *
 * Matching by URL matters: a writer may already have `site.standard.publication`
 * records from OTHER tools (Leaflet, Pocketblog, …). We must not attach SkyPress
 * documents to a foreign publication.
 */
async function ensurePublication(
	agent: Agent,
	did: string,
	handle: string
): Promise< string > {
	const wantUrl = publicationHomeUrl( handle );
	const existing = await agent.com.atproto.repo.listRecords( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		limit: 100,
	} );
	const ours = existing.data.records.find(
		( record ) => ( record.value as { url?: string } )?.url === wantUrl
	);
	if ( ours ) {
		return ours.uri;
	}
	const created = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		record: asRecord( buildPublicationRecord( { handle } ) ),
	} );
	return created.data.uri;
}

/**
 * The two-record publish (Decision 0005). Order avoids a circular dependency:
 * the article URL is known from handle+slug, so we create the Bluesky post first,
 * then the document with `bskyPostRef`.
 *
 * NOTE: this also creates a PUBLIC Bluesky post. Callers must have made that
 * unmistakable to the user first (brief §10).
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
	const articleUrl = canonicalArticleUrl( handle, rkey );
	const textContent = blocksToText( input.blocks );

	const publicationUri = await ensurePublication( agent, did, handle );

	const postRes = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: POST_COLLECTION,
		record: asRecord(
			buildBskyPost( {
				title: input.title,
				articleUrl,
				description: input.description,
				createdAt: now,
			} )
		),
	} );
	const bskyPostRef: StrongRef = {
		uri: postRes.data.uri,
		cid: postRes.data.cid,
	};

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
				siteUri: publicationUri,
				publishedAt: now,
				description: input.description,
				bskyPostRef,
			} )
		),
	} );

	return {
		publicationUri,
		documentUri: docRes.data.uri,
		postUri: postRes.data.uri,
		articleUrl,
	};
}

export interface UpdateInput extends PublishInput {
	/** The existing document's record key (URL stays stable, Decision 0008). */
	rkey: string;
	/** Preserved from the original publish. */
	siteUri: string;
	publishedAt: string;
	bskyPostRef?: StrongRef;
}

/**
 * Edit a published article in place (Decision 0008): `putRecord` on the SAME rkey,
 * stamping `updatedAt` while preserving `publishedAt` + `bskyPostRef`. Does NOT create a
 * new Bluesky post — the original post keeps pointing at the (now-updated) URL.
 */
export async function updateDocument(
	agent: Agent,
	identity: Identity,
	input: UpdateInput
): Promise< { documentUri: string; articleUrl: string } > {
	const { did } = identity;
	const handle = identity.handle ?? did;
	const now = new Date().toISOString();
	const articleUrl = canonicalArticleUrl( handle, input.rkey );

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

/** rkey is the last segment of an AT-URI. */
function rkeyFromUri( uri: string ): string {
	return uri.split( '/' ).pop() ?? '';
}

/**
 * Unpublish an article (Decision 0008): delete the document AND its companion Bluesky
 * post. The publication record is left intact.
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
	siteUri: string;
	bskyPostRef?: StrongRef;
	blocks: BlockNode[];
}

/** List the signed-in writer's own SkyPress articles (scoped to their publication). */
export async function listMyArticles(
	agent: Agent,
	did: string,
	handle: string
): Promise< MyArticle[] > {
	const wantUrl = publicationHomeUrl( handle );
	const pubs = await agent.com.atproto.repo.listRecords( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		limit: 100,
	} );
	const ours = pubs.data.records.find(
		( record ) => ( record.value as { url?: string } )?.url === wantUrl
	);
	if ( ! ours ) {
		return [];
	}
	const docs = await agent.com.atproto.repo.listRecords( {
		repo: did,
		collection: DOCUMENT_COLLECTION,
		limit: 100,
	} );
	return docs.data.records
		.filter( ( record ) => ( record.value as { site?: string } )?.site === ours.uri )
		.map( ( record ) => {
			const value = record.value as {
				title?: string;
				description?: string;
				publishedAt?: string;
				updatedAt?: string;
				site?: string;
				bskyPostRef?: StrongRef;
				content?: { blocks?: BlockNode[] };
			};
			return {
				rkey: rkeyFromUri( record.uri ),
				title: value.title ?? 'Untitled',
				description: value.description,
				publishedAt: value.publishedAt,
				updatedAt: value.updatedAt,
				siteUri: value.site ?? ours.uri,
				bskyPostRef: value.bskyPostRef,
				blocks: value.content?.blocks ?? [],
			};
		} );
}
