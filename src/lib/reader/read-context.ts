/**
 * The read-context module: one deep interface for the public read routes.
 *
 * Every read route used to hand-assemble the same spine — strip the `@` from the
 * URL param, resolve handle → DID → PDS, match a publication by slug, join documents
 * by `value.site === publication.uri`, and map each miss to an error scene. That
 * orchestration (and its caller knowledge: the join key, the fetch cap, the blob-ref
 * shape behind logo URLs) now lives here, once, behind three entry points:
 *
 *   resolveAuthorContext( author )                — `/@handle`
 *   resolvePublicationContext( author, slug )     — `/@handle/{slug}` + rss.xml
 *   resolveArticleContext( author, slug, rkey )   — `/@handle/{slug}/{rkey}`
 *
 * Each returns `{ ok: true, context }` or `{ ok: false, error }` where `error` is
 * ready-made `ErrorSceneCopy` (status + page copy), so routes keep only templates.
 * All PDS fetches stay SSRF-guarded via `records.ts`/`identity.ts` underneath.
 */
import { resolveAuthor } from './identity';
import { getRecord, listRecords } from './records';
import {
	listAllReaderPublications,
	type ReaderPublication,
	type ReaderForeignPublication,
} from './publications';
import { fetchActorProfile, type ActorProfile } from './profile';
import { buildGetBlobUrl } from '../media/blob';
import { errorScene, type ErrorSceneCopy } from './errors';
import type { BlockNode } from '../blocks/render';

const DOCUMENT_COLLECTION = 'site.standard.document';

/**
 * One `listRecords` page of the writer's documents (across all their publications).
 * A writer with more total documents than this could have older items missing from
 * publication pages and feeds — a known, deliberate bound (Decision 0011; the feed
 * additionally keeps only the newest `FEED_ITEM_LIMIT` after the site-join).
 */
const DOCUMENT_FETCH_LIMIT = 100;

export interface ReadAuthor {
	handle: string;
	did: string;
	pdsUrl: string;
}

/** A publication with its logo already resolved to a fetchable URL (or null). */
export type PublicationView = ReaderPublication & { logoUrl: string | null };
export type ForeignPublicationView = ReaderForeignPublication & { logoUrl: string | null };

/** The slice of a `site.standard.document` value the read routes consume. */
export interface SkyDocumentValue {
	title?: string;
	description?: string;
	textContent?: string;
	publishedAt?: string;
	updatedAt?: string;
	site?: string;
	content?: { blocks?: BlockNode[] };
	/** strongRef to the companion `app.bsky.feed.post` — the target of reader actions. */
	bskyPostRef?: { uri: string; cid: string };
}

export interface PublicationDocument {
	uri: string;
	cid: string;
	rkey: string;
	value: SkyDocumentValue;
}

export interface AuthorReadContext {
	author: ReadAuthor;
	profile: ActorProfile;
	publications: PublicationView[];
	foreign: ForeignPublicationView[];
}

export interface PublicationReadContext {
	author: ReadAuthor;
	profile: ActorProfile;
	publication: PublicationView;
	/** This publication's documents only (site-joined), in PDS order (newest first). */
	documents: PublicationDocument[];
}

export interface ArticleReadContext {
	author: ReadAuthor;
	profile: ActorProfile;
	publication: PublicationView;
	document: PublicationDocument;
}

export type ReadContextResult< T > =
	| { ok: true; context: T }
	| { ok: false; error: ErrorSceneCopy };

function notFound< T >( error: ErrorSceneCopy ): ReadContextResult< T > {
	return { ok: false, error };
}

/** The shared spine: validate the `@handle` param and resolve it to a DID + PDS. */
async function resolveReadAuthor(
	authorParam: string | undefined
): Promise< { author: ReadAuthor } | { error: ErrorSceneCopy } > {
	if ( ! authorParam || ! authorParam.startsWith( '@' ) ) {
		return { error: errorScene( 'not-found' ) };
	}
	const handle = authorParam.slice( 1 );
	const resolved = await resolveAuthor( handle );
	if ( ! resolved ) {
		return { error: errorScene( 'writer-not-found', { handle } ) };
	}
	return { author: { handle, did: resolved.did, pdsUrl: resolved.pdsUrl } };
}

function withLogoUrl< T extends { icon: ReaderPublication[ 'icon' ] } >(
	author: ReadAuthor,
	publication: T
): T & { logoUrl: string | null } {
	return {
		...publication,
		logoUrl: publication.icon
			? buildGetBlobUrl( author.pdsUrl, author.did, publication.icon.ref.$link )
			: null,
	};
}

function toPublicationDocument(
	record: { uri: string; cid: string; value: SkyDocumentValue }
): PublicationDocument {
	return {
		uri: record.uri,
		cid: record.cid,
		rkey: record.uri.split( '/' ).pop() ?? '',
		value: record.value,
	};
}

export async function resolveAuthorContext(
	authorParam: string | undefined
): Promise< ReadContextResult< AuthorReadContext > > {
	const spine = await resolveReadAuthor( authorParam );
	if ( 'error' in spine ) {
		return notFound( spine.error );
	}
	const { author } = spine;

	const [ profile, allPublications ] = await Promise.all( [
		fetchActorProfile( author.pdsUrl, author.did ),
		listAllReaderPublications( author.pdsUrl, author.did ),
	] );

	return {
		ok: true,
		context: {
			author,
			profile,
			publications: allPublications.owned.map( ( pub ) => withLogoUrl( author, pub ) ),
			foreign: allPublications.foreign.map( ( pub ) => withLogoUrl( author, pub ) ),
		},
	};
}

export async function resolvePublicationContext(
	authorParam: string | undefined,
	slug: string | undefined
): Promise< ReadContextResult< PublicationReadContext > > {
	if ( ! slug ) {
		return notFound( errorScene( 'not-found' ) );
	}
	const spine = await resolveReadAuthor( authorParam );
	if ( 'error' in spine ) {
		return notFound( spine.error );
	}
	const { author } = spine;

	// The publication match, the profile, and the document page are independent
	// fetches — run them together rather than serially like the old pages did.
	const [ profile, allPublications, documentRecords ] = await Promise.all( [
		fetchActorProfile( author.pdsUrl, author.did ),
		listAllReaderPublications( author.pdsUrl, author.did ),
		listRecords< SkyDocumentValue >(
			author.pdsUrl,
			author.did,
			DOCUMENT_COLLECTION,
			DOCUMENT_FETCH_LIMIT
		),
	] );

	const matched = allPublications.owned.find( ( pub ) => pub.slug === slug );
	if ( ! matched ) {
		return notFound( errorScene( 'publication-not-found', { handle: author.handle, slug } ) );
	}
	const publication = withLogoUrl( author, matched );

	const documents = documentRecords
		.filter( ( record ) => record.value.site === publication.uri )
		.map( toPublicationDocument );

	return { ok: true, context: { author, profile, publication, documents } };
}

export async function resolveArticleContext(
	authorParam: string | undefined,
	slug: string | undefined,
	rkey: string | undefined
): Promise< ReadContextResult< ArticleReadContext > > {
	if ( ! slug || ! rkey ) {
		return notFound( errorScene( 'not-found' ) );
	}
	const spine = await resolveReadAuthor( authorParam );
	if ( 'error' in spine ) {
		return notFound( spine.error );
	}
	const { author } = spine;

	const [ profile, allPublications, record ] = await Promise.all( [
		fetchActorProfile( author.pdsUrl, author.did ),
		listAllReaderPublications( author.pdsUrl, author.did ),
		getRecord< SkyDocumentValue >( author.pdsUrl, author.did, DOCUMENT_COLLECTION, rkey ),
	] );

	const matched = allPublications.owned.find( ( pub ) => pub.slug === slug );
	if ( ! matched ) {
		return notFound( errorScene( 'publication-not-found', { handle: author.handle, slug } ) );
	}
	const publication = withLogoUrl( author, matched );

	// The site-join: a document renders under a publication only when it points back
	// at that publication's record. A real record under another publication 404s here.
	if ( ! record?.value || record.value.site !== publication.uri ) {
		return notFound( errorScene( 'article-not-found', { publicationName: publication.name } ) );
	}

	return {
		ok: true,
		context: { author, profile, publication, document: toPublicationDocument( record ) },
	};
}
