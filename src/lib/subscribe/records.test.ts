import { describe, expect, it } from 'vitest';
import {
	buildSubscription,
	SUBSCRIPTION_COLLECTION,
	type SubscriptionRecord,
} from './records';

const PUB_URI = 'at://did:plc:writer/site.standard.publication/3kpub';

describe( 'SUBSCRIPTION_COLLECTION', () => {
	it( 'is the standard.site graph subscription NSID', () => {
		expect( SUBSCRIPTION_COLLECTION ).toBe( 'site.standard.graph.subscription' );
	} );
} );

describe( 'buildSubscription', () => {
	it( 'shapes a subscription record targeting the publication AT-URI', () => {
		const createdAt = '2026-06-17T00:00:00.000Z';
		const record: SubscriptionRecord = buildSubscription( PUB_URI, createdAt );
		expect( record ).toEqual( {
			$type: 'site.standard.graph.subscription',
			publication: PUB_URI,
			createdAt,
		} );
	} );

	it( 'records the publication as a bare at-uri (not a strongRef)', () => {
		const record = buildSubscription( PUB_URI, '2026-06-17T00:00:00.000Z' );
		// The lexicon takes the publication identity, not a versioned {uri,cid} — a
		// publication edit must never invalidate an existing subscription.
		expect( typeof record.publication ).toBe( 'string' );
		expect( record.publication ).toBe( PUB_URI );
	} );
} );
