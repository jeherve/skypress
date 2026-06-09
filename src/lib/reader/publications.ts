/**
 * Reader-side (public, no-auth) resolution of a writer's SkyPress publications (SP10, step F/G).
 *
 * Reads `site.standard.publication` over the public `com.atproto.repo` XRPC (`listRecords`,
 * SSRF-guarded), keeping only publications SkyPress OWNS (`isSkyPressPublicationUrl`) so a
 * record some other tool wrote into the shared collection never renders under a skypress.blog
 * URL. The authed CRUD counterpart lives in `../publish/publications.ts`.
 */
import { listRecords } from './records';
import {
	isSkyPressPublicationUrl,
	publicationSlugFromUrl,
} from '../publish/records';
import type { BlobRefJson } from '../media/blob';
import { parseBasicTheme, type BasicTheme } from '../publish/themes';

export interface ReaderPublication {
	uri: string;
	slug: string;
	name: string;
	description: string | null;
	icon: BlobRefJson | null;
	basicTheme: BasicTheme | null;
}

interface RawPublication {
	url?: string;
	name?: string;
	description?: string;
	icon?: BlobRefJson;
	basicTheme?: unknown;
}

function toReaderPublication( record: { uri: string; value: RawPublication } ): ReaderPublication | null {
	const value = record.value;
	if ( ! value?.url || ! isSkyPressPublicationUrl( value.url ) ) {
		return null;
	}
	const slug = publicationSlugFromUrl( value.url );
	if ( ! slug ) {
		return null;
	}
	return {
		uri: record.uri,
		slug,
		name: value.name ?? slug,
		description: value.description?.trim() || null,
		icon: value.icon ?? null,
		basicTheme: parseBasicTheme( value.basicTheme ),
	};
}

/** All of a writer's SkyPress publications (newest first) — for the author index. */
export async function listReaderPublications(
	pdsUrl: string,
	did: string
): Promise< ReaderPublication[] > {
	const records = await listRecords< RawPublication >(
		pdsUrl,
		did,
		'site.standard.publication',
		100
	);
	return records
		.map( ( record ) => toReaderPublication( record ) )
		.filter( ( pub ): pub is ReaderPublication => pub !== null );
}

/** Resolve one publication by its slug (the publication + document routes), or null. */
export async function resolveReaderPublication(
	pdsUrl: string,
	did: string,
	slug: string
): Promise< ReaderPublication | null > {
	const pubs = await listReaderPublications( pdsUrl, did );
	return pubs.find( ( pub ) => pub.slug === slug ) ?? null;
}
