/**
 * Read a writer's `app.bsky.actor.profile` straight from their PDS (SP10, step G).
 *
 * The public author index borrows the writer's Bluesky identity (name, bio, avatar, cover) to
 * decorate the page. Per Decision 0010 this comes from the PDS record directly — NOT the
 * Bluesky appview — so the page has no third-party-service dependency. `getRecord` already
 * guards the (DID-doc-derived) PDS host against SSRF and degrades to null on failure.
 *
 * `displayName` is plain text. `description` is plain text in the record, but the author
 * page linkifies it at render via `detectBioSegments` (rich-text.ts), mirroring Bluesky.
 * Neither is ever injected as raw HTML. (Decision 0015.)
 */
import { getRecord } from './records';
import { buildGetBlobUrl, type BlobRefJson } from '../media/blob';

export interface ActorProfile {
	displayName: string | null;
	description: string | null;
	avatar: string | null;
	banner: string | null;
}

interface RawActorProfile {
	displayName?: string;
	description?: string;
	avatar?: BlobRefJson;
	banner?: BlobRefJson;
}

function blobUrl( pdsUrl: string, did: string, blob?: BlobRefJson ): string | null {
	const cid = blob?.ref?.$link;
	return cid ? buildGetBlobUrl( pdsUrl, did, cid ) : null;
}

export async function fetchActorProfile( pdsUrl: string, did: string ): Promise< ActorProfile > {
	const record = await getRecord< RawActorProfile >(
		pdsUrl,
		did,
		'app.bsky.actor.profile',
		'self'
	);
	const value = record?.value ?? {};
	return {
		displayName: value.displayName?.trim() || null,
		description: value.description?.trim() || null,
		avatar: blobUrl( pdsUrl, did, value.avatar ),
		banner: blobUrl( pdsUrl, did, value.banner ),
	};
}
