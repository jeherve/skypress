import type { Agent } from '@atproto/api';

/** The signed-in writer's identity, as shown in the home pill and editor bar. */
export interface ViewerProfile {
	did: string;
	handle: string | null;
	displayName: string | null;
	avatar: string | null;
}

/**
 * Fetch the viewer's profile for display. Wraps a single `getProfile` call and
 * never throws: on failure (e.g. the appview is unreachable) it returns the DID
 * with null display fields, so callers always have something to render.
 */
export async function fetchViewerProfile( agent: Agent, did: string ): Promise< ViewerProfile > {
	try {
		const { data } = await agent.getProfile( { actor: did } );
		return {
			did,
			handle: data.handle ?? null,
			displayName: data.displayName ?? null,
			avatar: data.avatar ?? null,
		};
	} catch {
		return { did, handle: null, displayName: null, avatar: null };
	}
}

/** Best display label for a viewer: real name, else handle, else the raw DID. */
export function displayNameFor( profile: ViewerProfile ): string {
	return profile.displayName ?? profile.handle ?? profile.did;
}

/**
 * Public author-page path for a handle (the `/[author]` route requires a leading
 * `@` and resolves by handle). Returns null when no handle is known, so callers
 * can omit the link rather than render a broken one.
 */
export function authorPath( handle: string | null ): string | null {
	return handle ? `/@${ handle }` : null;
}

/** One entry in the signed-in account dropdown. */
export interface MenuItem {
	label: string;
	href: string;
}

/**
 * Dropdown items for a signed-in viewer: Dashboard, Write, then Profile. The
 * Profile entry links to the public author page and is omitted when no handle
 * is known (so we never render a broken link).
 */
export function accountMenuItems( profile: ViewerProfile ): MenuItem[] {
	const items: MenuItem[] = [
		{ label: 'Dashboard', href: '/dashboard' },
		{ label: 'Write', href: '/editor' },
	];
	const profileHref = authorPath( profile.handle );
	if ( profileHref ) {
		items.push( { label: 'Profile', href: profileHref } );
	}
	return items;
}
