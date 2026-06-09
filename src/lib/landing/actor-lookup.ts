/**
 * Live "find me on the network" lookup for the landing handle input.
 *
 * Calls the PUBLIC Bluesky AppView UNAUTHENTICATED (no OAuth, no secrets) purely to
 * show the writer their own avatar + name as confirmation before sign-in. This runs
 * client-side in a React island, the host is a fixed constant, and `actor` is the only
 * user input — validated by `isValidHandleOrDid` and URL-encoded — so it can't be
 * coerced into a different host or path. Never throws: any failure resolves to `null`
 * ("no preview"), because submission must never depend on this lookup succeeding.
 */
import { isValidHandleOrDid, normalizeHandle } from '../auth/config';

const APPVIEW = 'https://public.api.bsky.app';

export interface ActorPreview {
	did: string;
	handle: string;
	displayName: string | null;
	avatar: string | null;
}

export async function lookupActor(
	input: string,
	fetchImpl: typeof fetch = fetch
): Promise< ActorPreview | null > {
	const value = input.trim();
	if ( ! isValidHandleOrDid( value ) ) {
		return null;
	}
	const actor = value.startsWith( 'did:' ) ? value : normalizeHandle( value );
	try {
		const res = await fetchImpl(
			`${ APPVIEW }/xrpc/app.bsky.actor.getProfile?actor=${ encodeURIComponent( actor ) }`
		);
		if ( ! res.ok ) {
			return null;
		}
		const data = ( await res.json() ) as Partial< ActorPreview >;
		if ( ! data?.did ) {
			return null;
		}
		return {
			did: data.did,
			handle: data.handle ?? actor,
			displayName: data.displayName ?? null,
			avatar: data.avatar ?? null,
		};
	} catch {
		return null;
	}
}
