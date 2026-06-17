/**
 * Agent orchestration for the reader "subscribe to a publication" action: create/delete a
 * `site.standard.graph.subscription` record on the reader's OWN PDS, and read it back to
 * toggle the button.
 *
 * All writes go browser → the reader's PDS over the authenticated OAuth agent (Decision
 * 0004), exactly like the social actions (`social/interactions.ts`). Reads touch only the
 * reader's own repo — no AppView, no cross-PDS aggregation. SkyPress is not a relay, so it
 * deliberately does NOT count subscribers or assemble a following feed (design
 * 2026-06-17-publication-subscriptions). Record-shaping is delegated to `records.ts`.
 */
import type { Agent } from '@atproto/api';
import { buildSubscription, SUBSCRIPTION_COLLECTION, type SubscriptionRecord } from './records';

/** createRecord types `record` as an open index signature; ours is precise. */
function asRecord( value: object ): Record< string, unknown > {
	return value as Record< string, unknown >;
}

/** rkey is the last segment of an AT-URI. */
function rkeyFromUri( uri: string ): string {
	return uri.split( '/' ).pop() ?? '';
}

/** Subscribe to a publication; returns the created subscription record's AT-URI (for unsubscribing). */
export async function subscribe(
	agent: Agent,
	did: string,
	publicationUri: string
): Promise< string > {
	const res = await agent.com.atproto.repo.createRecord( {
		repo: did,
		collection: SUBSCRIPTION_COLLECTION,
		record: asRecord( buildSubscription( publicationUri, new Date().toISOString() ) ),
	} );
	return res.data.uri;
}

/** Unsubscribe by deleting the subscription record (atproto has no native "unfollow"). */
export async function unsubscribe(
	agent: Agent,
	did: string,
	subscriptionUri: string
): Promise< void > {
	await agent.com.atproto.repo.deleteRecord( {
		repo: did,
		collection: SUBSCRIPTION_COLLECTION,
		rkey: rkeyFromUri( subscriptionUri ),
	} );
}

/**
 * Find the reader's existing subscription to `publicationUri`, or null. Lists the reader's
 * own subscription records (limit 100 — the codebase-wide cap; a reader following >100
 * publications would miss the tail, acceptable until that's reachable) and matches by the
 * `publication` AT-URI.
 */
export async function fetchSubscriptionUri(
	agent: Agent,
	did: string,
	publicationUri: string
): Promise< string | null > {
	const res = await agent.com.atproto.repo.listRecords( {
		repo: did,
		collection: SUBSCRIPTION_COLLECTION,
		limit: 100,
	} );
	const match = res.data.records.find(
		( record ) =>
			( record.value as Partial< SubscriptionRecord > | undefined )?.publication === publicationUri
	);
	return match?.uri ?? null;
}
