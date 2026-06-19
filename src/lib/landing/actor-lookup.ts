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

/** Default cap for typeahead results — short enough to stay a quick pick list. */
const SEARCH_LIMIT = 8;

export interface ActorPreview {
	did: string;
	handle: string;
	displayName: string | null;
	avatar: string | null;
}

/** Subset of an `app.bsky.actor.searchActorsTypeahead` result we care about. */
interface TypeaheadActor {
	did?: string;
	handle?: string;
	displayName?: string;
	avatar?: string;
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

/**
 * Typeahead search for the editor's `@mention` autocompleter. Unlike `lookupActor`
 * (which resolves ONE exact handle/DID), this returns a short list of accounts matching
 * a partial query, so the suggestion menu appears as the writer types.
 *
 * Same safety posture as `lookupActor`: PUBLIC AppView, UNAUTHENTICATED, fixed host
 * constant, `q` is the only user input and is URL-encoded. Deliberately NOT gated by
 * `isValidHandleOrDid` — the whole point is partial input ("ria"), which isn't a valid
 * handle yet. Never throws: any failure resolves to `[]` so the editor keeps working
 * when search is down.
 */
export async function searchActors(
	query: string,
	fetchImpl: typeof fetch = fetch,
	limit: number = SEARCH_LIMIT
): Promise< ActorPreview[] > {
	const q = query.trim();
	if ( ! q ) {
		return [];
	}
	try {
		const res = await fetchImpl(
			`${ APPVIEW }/xrpc/app.bsky.actor.searchActorsTypeahead?q=${ encodeURIComponent(
				q
			) }&limit=${ limit }`
		);
		if ( ! res.ok ) {
			return [];
		}
		const data = ( await res.json() ) as { actors?: TypeaheadActor[] };
		const actors = Array.isArray( data?.actors ) ? data.actors : [];
		return actors
			.filter(
				( a ): a is TypeaheadActor & { did: string; handle: string } =>
					Boolean( a?.did && a?.handle )
			)
			.map( ( a ) => ( {
				did: a.did,
				handle: a.handle,
				displayName: a.displayName ?? null,
				avatar: a.avatar ?? null,
			} ) );
	} catch {
		return [];
	}
}
