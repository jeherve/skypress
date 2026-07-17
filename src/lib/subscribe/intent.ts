/**
 * A signed-out reader who hits "Sign in to subscribe" wants to end up *subscribed*, not merely
 * signed in. Because sign-in is a full-page OAuth redirect (and, from the public publication
 * page, an indirection through the static `/oauth/callback/` route — the page is a dynamic
 * route that can't be a registered redirect URI), the intent has to survive the round-trip.
 *
 * We stash the target publication's AT-URI here before redirecting and, once the reader lands
 * back on the publication page signed-in, `SubscribeButton` consumes it and auto-writes the
 * `site.standard.graph.subscription` record. Single slot, consumed once. `localStorage`
 * survives the excursion (same rationale as `draft-store`). Decision 0020.
 */
const INTENT_KEY = 'skypress:subscribe:intent';

export function saveSubscribeIntent(
	publicationUri: string,
	storage: Storage = window.localStorage
): void {
	storage.setItem( INTENT_KEY, publicationUri );
}

/** Read the pending subscribe target and clear it — non-null at most once per save. */
export function consumeSubscribeIntent( storage: Storage = window.localStorage ): string | null {
	const uri = storage.getItem( INTENT_KEY );
	storage.removeItem( INTENT_KEY );
	return uri;
}
