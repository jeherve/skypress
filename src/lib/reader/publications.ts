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

/** A publication record another app wrote into the shared collection (Leaflet, …). Read-only, links out. */
export interface ReaderForeignPublication {
	uri: string;
	name: string;
	url: string;
	icon: BlobRefJson | null;
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

/** Map a raw record to a foreign publication, or null if its url isn't a usable http(s) link. */
function toReaderForeignPublication(
	record: { uri: string; value: RawPublication }
): ReaderForeignPublication | null {
	const value = record.value;
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
	return {
		uri: record.uri,
		name: value.name ?? parsed.hostname,
		url: value.url,
		icon: value.icon ?? null,
	};
}

/**
 * Fetch the writer's publication records once and partition them: those SkyPress OWNS
 * (rendered under skypress.blog URLs) versus FOREIGN records another app wrote into the
 * shared collection (Leaflet, …), which the author index links out to (Decision 0010).
 */
export async function listAllReaderPublications(
	pdsUrl: string,
	did: string
): Promise< { owned: ReaderPublication[]; foreign: ReaderForeignPublication[] } > {
	const records = await listRecords< RawPublication >(
		pdsUrl,
		did,
		'site.standard.publication',
		100
	);
	const owned: ReaderPublication[] = [];
	const foreign: ReaderForeignPublication[] = [];
	for ( const record of records ) {
		if ( record.value?.url && isSkyPressPublicationUrl( record.value.url ) ) {
			const pub = toReaderPublication( record );
			if ( pub ) {
				owned.push( pub );
			}
			continue;
		}
		const fp = toReaderForeignPublication( record );
		if ( fp ) {
			foreign.push( fp );
		}
	}
	return { owned, foreign };
}

