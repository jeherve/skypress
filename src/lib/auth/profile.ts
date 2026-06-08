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
