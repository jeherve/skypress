/**
 * Pure builder for the record a reader's "subscribe" action writes:
 * `site.standard.graph.subscription` (the community follow primitive).
 *
 * No `@atproto/*` or network here — just record-shaping, so it's fully unit-testable.
 * Orchestration (createRecord/deleteRecord via the Agent) lives in `subscriptions.ts`.
 *
 * Unlike the social actions (like/repost), a subscription targets the publication by its
 * bare `at://` URI, NOT a `com.atproto.repo.strongRef`: it follows the publication's
 * identity, so editing the publication (new cid) must never invalidate the subscription.
 */

/** The standard.site follow primitive. Written to the *reader's* repo. */
export const SUBSCRIPTION_COLLECTION = 'site.standard.graph.subscription';

export interface SubscriptionRecord {
	$type: typeof SUBSCRIPTION_COLLECTION;
	/** AT-URI of the `site.standard.publication` being followed. */
	publication: string;
	createdAt: string;
}

/** Shape a subscription record following `publicationUri`. */
export function buildSubscription(
	publicationUri: string,
	createdAt: string
): SubscriptionRecord {
	return {
		$type: SUBSCRIPTION_COLLECTION,
		publication: publicationUri,
		createdAt,
	};
}
