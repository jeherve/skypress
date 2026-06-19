import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
	createMentionCompleter,
	replaceAtMentionCompleter,
} from './mention-autocompleter';
import type { ActorPreview } from '../landing/actor-lookup';

const ALICE: ActorPreview = {
	did: 'did:plc:alice',
	handle: 'alice.bsky.social',
	displayName: 'Alice',
	avatar: null,
};

const ALICIA: ActorPreview = {
	did: 'did:plc:alicia',
	handle: 'alicia.blog',
	displayName: 'Alicia',
	avatar: null,
};

describe( 'mention autocompleter', () => {
	it( 'has an @ trigger prefix', () => {
		const completer = createMentionCompleter( async () => [] );
		expect( completer.triggerPrefix ).toBe( '@' );
	} );

	it( 'returns the typeahead search results as options for a partial query', async () => {
		const search = vi.fn( async () => [ ALICE, ALICIA ] );
		const completer = createMentionCompleter( search );
		const options = await completer.options( 'ali' );
		expect( options ).toEqual( [ ALICE, ALICIA ] );
		expect( search ).toHaveBeenCalledWith( 'ali' );
	} );

	it( 'returns no options for an empty query without searching', async () => {
		const search = vi.fn( async () => [ ALICE ] );
		const completer = createMentionCompleter( search );
		expect( await completer.options( '' ) ).toEqual( [] );
		expect( await completer.options( '   ' ) ).toEqual( [] );
		expect( search ).not.toHaveBeenCalled();
	} );

	it( 'completes to a mention anchor element (inserted at the caret, not block-replacing)', () => {
		const completer = createMentionCompleter( async () => [] );
		// The completion is the anchor element itself, so the editor inserts it inline in
		// place of the typed `@query` rather than swapping out the whole block.
		const completion = completer.getOptionCompletion( ALICE );
		const html = renderToString( completion );
		expect( html ).toContain( 'href="https://mu.social/profile/alice.bsky.social"' );
		expect( html ).toContain( 'data-did="did:plc:alice"' );
		expect( html ).toContain( '@alice.bsky.social' );
	} );
} );

describe( 'replaceAtMentionCompleter', () => {
	const mention = createMentionCompleter( async () => [] );

	it( "drops WordPress's built-in @ user completer and appends ours", () => {
		const builtInUser = { name: 'user', triggerPrefix: '@' };
		const blockCompleter = { name: 'block', triggerPrefix: '/' };
		const result = replaceAtMentionCompleter(
			[ builtInUser, blockCompleter ],
			mention
		);
		// The '/' completer survives; the '@' user completer is gone; ours is last.
		expect( result ).toEqual( [ blockCompleter, mention ] );
	} );

	it( 'returns only our completer when the base set is empty or not an array', () => {
		expect( replaceAtMentionCompleter( [], mention ) ).toEqual( [ mention ] );
		expect( replaceAtMentionCompleter( undefined, mention ) ).toEqual( [ mention ] );
	} );
} );
