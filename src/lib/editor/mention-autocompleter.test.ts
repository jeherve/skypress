import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createMentionCompleter } from './mention-autocompleter';
import type { ActorPreview } from '../landing/actor-lookup';

const ALICE: ActorPreview = {
	did: 'did:plc:alice',
	handle: 'alice.bsky.social',
	displayName: 'Alice',
	avatar: null,
};

describe( 'mention autocompleter', () => {
	it( 'has an @ trigger prefix', () => {
		const completer = createMentionCompleter( async () => null );
		expect( completer.triggerPrefix ).toBe( '@' );
	} );

	it( 'returns the looked-up actor as the only option', async () => {
		const lookup = vi.fn( async () => ALICE );
		const completer = createMentionCompleter( lookup );
		const options = await completer.options( 'alice' );
		expect( options ).toEqual( [ ALICE ] );
		expect( lookup ).toHaveBeenCalledWith( 'alice' );
	} );

	it( 'returns no options for an empty query without calling lookup', async () => {
		const lookup = vi.fn( async () => ALICE );
		const completer = createMentionCompleter( lookup );
		expect( await completer.options( '' ) ).toEqual( [] );
		expect( lookup ).not.toHaveBeenCalled();
	} );

	it( 'inserts a mention anchor with href + data-did on completion', () => {
		const completer = createMentionCompleter( async () => null );
		const completion = completer.getOptionCompletion( ALICE );
		expect( completion.action ).toBe( 'replace' );
		const html = renderToString( completion.value );
		expect( html ).toContain( 'href="https://bsky.app/profile/alice.bsky.social"' );
		expect( html ).toContain( 'data-did="did:plc:alice"' );
		expect( html ).toContain( '@alice.bsky.social' );
	} );
} );
