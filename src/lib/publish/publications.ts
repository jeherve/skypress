/**
 * Publication CRUD over `site.standard.publication` records (SP10, Decision 0010).
 *
 * Replaces the old implicit single-pub `ensurePublication`: SkyPress now manages MULTIPLE,
 * user-created publications. Everything resolves from the PDS — no database, no global slug
 * registry. SkyPress only ever lists/edits/deletes publications it OWNS (`isSkyPressPublicationUrl`),
 * never a record some other tool (Leaflet, …) wrote into the same collection.
 */
import type { Agent } from '@atproto/api';
import { TID } from '@atproto/common-web';
import {
	buildPublicationRecord,
	isSkyPressPublicationUrl,
	publicationSlugFromUrl,
	uniquePublicationSlug,
	type PublicationRecord,
} from './records';
import { normalizeBlobRefJson, type BlobRefJson } from '../media/blob';
import { parseBasicTheme, type BasicTheme } from './themes';
import { detectProvider, type ProviderId } from './providers';

const PUBLICATION_COLLECTION = 'site.standard.publication';
const DOCUMENT_COLLECTION = 'site.standard.document';
const POST_COLLECTION = 'app.bsky.feed.post';

/** createRecord/putRecord type `record` as an open index signature; ours are precise. */
function asRecord( value: object ): Record< string, unknown > {
	return value as Record< string, unknown >;
}

/** rkey is the last segment of an AT-URI. */
function rkeyFromUri( uri: string ): string {
	return uri.split( '/' ).pop() ?? '';
}

/** A SkyPress publication, resolved to the shape the dashboard + editor consume. */
export interface Publication {
	uri: string;
	/** Current record cid — needed for the post's `associatedRefs` strongRef (Decision 0013). */
	cid: string;
	rkey: string;
	slug: string;
	name: string;
	description?: string;
	icon?: BlobRefJson;
	basicTheme?: BasicTheme;
}

/** A publication record written by another app sharing the lexicon (Leaflet, …). Read-only. */
export interface ForeignPublication {
	uri: string;
	name: string;
	hostname: string;
	url: string;
	icon?: BlobRefJson;
	/** The app that wrote the record (Leaflet, pckt, …), or null when unrecognised. */
	provider: ProviderId | null;
}

/** Fields a writer can set/change on a publication (the slug is derived, never entered). */
export interface PublicationInput {
	name: string;
	description?: string;
	icon?: BlobRefJson;
	basicTheme?: BasicTheme;
}

/** Map a raw repo record to a Publication, or null if it isn't a usable SkyPress publication. */
function toPublication( record: {
	uri: string;
	cid: string;
	value: unknown;
} ): Publication | null {
	const value = record.value as Partial< PublicationRecord > | undefined;
	if ( ! value?.url || ! isSkyPressPublicationUrl( value.url ) ) {
		return null;
	}
	const slug = publicationSlugFromUrl( value.url );
	if ( ! slug ) {
		return null;
	}
	// The agent deserialises the icon blob into a BlobRef (ref = CID object); normalise back to
	// the portable `{ ref: { $link } }` shape the dashboard + form read from.
	const icon = normalizeBlobRefJson( value.icon );
	const basicTheme = parseBasicTheme( value.basicTheme );
	return {
		uri: record.uri,
		cid: record.cid,
		rkey: rkeyFromUri( record.uri ),
		slug,
		name: value.name ?? slug,
		...( value.description ? { description: value.description } : {} ),
		...( icon ? { icon } : {} ),
		...( basicTheme ? { basicTheme } : {} ),
	};
}

/** Map a raw repo record to a ForeignPublication, or null if its url isn't a usable http(s) link. */
function toForeignPublication( record: {
	uri: string;
	value: unknown;
} ): ForeignPublication | null {
	const value = record.value as Partial< PublicationRecord > | undefined;
	if ( ! value?.url ) {
		return null;
	}
	let parsed: URL;
	try {
		parsed = new URL( value.url );
	} catch {
		return null;
	}
	if ( parsed.protocol !== 'http:' && parsed.protocol !== 'https:' ) {
		return null;
	}
	const icon = normalizeBlobRefJson( value.icon );
	return {
		uri: record.uri,
		name: value.name ?? parsed.hostname,
		hostname: parsed.hostname,
		url: value.url,
		provider: detectProvider( value.url, value ),
		...( icon ? { icon } : {} ),
	};
}

/**
 * Fetch the writer's publication records once and partition them: those SkyPress OWNS
 * (origin === SITE_BASE, with a slug) versus FOREIGN records another app wrote into the same
 * collection (Leaflet, …), which SkyPress only ever displays read-only (Decision 0010).
 */
export async function listAllPublications(
	agent: Agent,
	did: string
): Promise< { owned: Publication[]; foreign: ForeignPublication[] } > {
	const res = await agent.com.atproto.repo.listRecords( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		limit: 100,
	} );
	const owned: Publication[] = [];
	const foreign: ForeignPublication[] = [];
	for ( const record of res.data.records ) {
		const url = ( record.value as Partial< PublicationRecord > | undefined )?.url;
		if ( url && isSkyPressPublicationUrl( url ) ) {
			// Ours: owned if it has a slug, otherwise a malformed/legacy own-record we drop entirely.
			const pub = toPublication( record );
			if ( pub ) {
				owned.push( pub );
			}
			continue;
		}
		const fp = toForeignPublication( record );
		if ( fp ) {
			foreign.push( fp );
		}
	}
	return { owned, foreign };
}

/** List the writer's SkyPress publications (newest first), filtered to this app's origin. */
export async function listPublications( agent: Agent, did: string ): Promise< Publication[] > {
	return ( await listAllPublications( agent, did ) ).owned;
}

/**
 * Create a new publication. The slug is derived from the name and de-duplicated against the
 * writer's existing SkyPress slugs; an unslugifiable name falls back to `pub-{rkey}`. The rkey
 * is generated up front so that fallback URL is known before the record is written.
 */
export async function createPublication(
	agent: Agent,
	did: string,
	handle: string,
	input: PublicationInput
): Promise< Publication > {
	const existing = await listPublications( agent, did );
	const rkey = TID.nextStr();
	const slug =
		uniquePublicationSlug(
			input.name,
			existing.map( ( pub ) => pub.slug )
		) || `pub-${ rkey }`;
	const record = buildPublicationRecord( {
		handle,
		slug,
		name: input.name,
		description: input.description,
		icon: input.icon,
		basicTheme: input.basicTheme,
	} );
	const res = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		rkey,
		record: asRecord( record ),
	} );
	return {
		uri: res.data.uri,
		cid: res.data.cid,
		rkey,
		slug,
		name: record.name,
		...( record.description ? { description: record.description } : {} ),
		...( record.icon ? { icon: record.icon } : {} ),
		...( record.basicTheme ? { basicTheme: record.basicTheme } : {} ),
	};
}

/**
 * Update a publication in place (`putRecord` on the same rkey). The slug is FROZEN: it is read
 * back from `existing` and re-baked into the url, so a rename never changes the URL (Decision 0010).
 */
export async function updatePublication(
	agent: Agent,
	did: string,
	handle: string,
	existing: Publication,
	input: PublicationInput
): Promise< Publication > {
	const record = buildPublicationRecord( {
		handle,
		slug: existing.slug,
		name: input.name,
		description: input.description,
		icon: input.icon,
		basicTheme: input.basicTheme,
	} );
	const res = await agent.com.atproto.repo.putRecord( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		rkey: existing.rkey,
		record: asRecord( record ),
	} );
	return {
		uri: existing.uri,
		cid: res.data.cid,
		rkey: existing.rkey,
		slug: existing.slug,
		name: record.name,
		...( record.description ? { description: record.description } : {} ),
		...( record.icon ? { icon: record.icon } : {} ),
		...( record.basicTheme ? { basicTheme: record.basicTheme } : {} ),
	};
}

export interface DeletePublicationResult {
	deletedArticles: number;
	deletedPosts: number;
}

/**
 * Delete a publication and CASCADE (Decision 0010): remove every document under it AND each
 * document's companion `app.bsky.feed.post` (Decision 0008 semantics), then the publication
 * record itself. Documents belonging to OTHER publications are left untouched. Returns counts
 * so the UI can tell the user exactly what was removed.
 *
 * NOTE: lists up to 100 documents without following `cursor` (the codebase-wide cap). A
 * publication with >100 documents would delete the first 100 and then the publication record,
 * orphaning the remainder. v1 has no draft/scale story; revisit with pagination before that
 * becomes reachable.
 */
export async function deletePublication(
	agent: Agent,
	did: string,
	publication: { uri: string; rkey: string }
): Promise< DeletePublicationResult > {
	const docs = await agent.com.atproto.repo.listRecords( {
		repo: did,
		collection: DOCUMENT_COLLECTION,
		limit: 100,
	} );
	const mine = docs.data.records.filter(
		( record ) => ( record.value as { site?: string } )?.site === publication.uri
	);

	let deletedPosts = 0;
	for ( const doc of mine ) {
		await agent.com.atproto.repo.deleteRecord( {
			repo: did,
			collection: DOCUMENT_COLLECTION,
			rkey: rkeyFromUri( doc.uri ),
		} );
		const postUri = ( doc.value as { bskyPostRef?: { uri?: string } } )?.bskyPostRef?.uri;
		if ( postUri ) {
			try {
				await agent.com.atproto.repo.deleteRecord( {
					repo: did,
					collection: POST_COLLECTION,
					rkey: rkeyFromUri( postUri ),
				} );
				deletedPosts++;
			} catch {
				// The post may already be gone; the document deletion is what matters.
			}
		}
	}

	await agent.com.atproto.repo.deleteRecord( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		rkey: publication.rkey,
	} );

	return { deletedArticles: mine.length, deletedPosts };
}
