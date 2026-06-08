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
	rkey: string;
	slug: string;
	name: string;
	description?: string;
	icon?: BlobRefJson;
}

/** Fields a writer can set/change on a publication (the slug is derived, never entered). */
export interface PublicationInput {
	name: string;
	description?: string;
	icon?: BlobRefJson;
}

/** Map a raw repo record to a Publication, or null if it isn't a usable SkyPress publication. */
function toPublication( record: {
	uri: string;
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
	return {
		uri: record.uri,
		rkey: rkeyFromUri( record.uri ),
		slug,
		name: value.name ?? slug,
		...( value.description ? { description: value.description } : {} ),
		...( icon ? { icon } : {} ),
	};
}

/** List the writer's SkyPress publications (newest first), filtered to this app's origin. */
export async function listPublications( agent: Agent, did: string ): Promise< Publication[] > {
	const res = await agent.com.atproto.repo.listRecords( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		limit: 100,
	} );
	return res.data.records
		.map( ( record ) => toPublication( record ) )
		.filter( ( pub ): pub is Publication => pub !== null );
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
	} );
	const res = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		rkey,
		record: asRecord( record ),
	} );
	return {
		uri: res.data.uri,
		rkey,
		slug,
		name: record.name,
		...( record.description ? { description: record.description } : {} ),
		...( record.icon ? { icon: record.icon } : {} ),
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
	} );
	await agent.com.atproto.repo.putRecord( {
		repo: did,
		collection: PUBLICATION_COLLECTION,
		rkey: existing.rkey,
		record: asRecord( record ),
	} );
	return {
		uri: existing.uri,
		rkey: existing.rkey,
		slug: existing.slug,
		name: record.name,
		...( record.description ? { description: record.description } : {} ),
		...( record.icon ? { icon: record.icon } : {} ),
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
