import { describe, expect, it } from 'vitest';
import { collectMentions } from './mentions';
import type { BlockNode } from '../blocks/render';

function para( content: string ): BlockNode {
	return { name: 'core/paragraph', attributes: { content }, innerBlocks: [] };
}

const MENTION = (
	handle: string,
	did: string
) => `<a class="skypress-mention" href="https://bsky.app/profile/${ handle }" data-did="${ did }">@${ handle }</a>`;

describe( 'collectMentions', () => {
	it( 'extracts did, handle, and display text from a mention anchor', () => {
		const blocks = [ para( `Thanks ${ MENTION( 'alice.bsky.social', 'did:plc:alice' ) }!` ) ];
		expect( collectMentions( blocks ) ).toEqual( [
			{ did: 'did:plc:alice', handle: 'alice.bsky.social', displayText: '@alice.bsky.social' },
		] );
	} );

	it( 'ignores ordinary links that are not mentions', () => {
		const blocks = [ para( 'See <a href="https://example.com">the docs</a>.' ) ];
		expect( collectMentions( blocks ) ).toEqual( [] );
	} );

	it( 'dedupes by DID, keeping first-appearance order', () => {
		const blocks = [
			para( `${ MENTION( 'bob.bsky.social', 'did:plc:bob' ) }` ),
			para( `${ MENTION( 'alice.bsky.social', 'did:plc:alice' ) }` ),
			para( `again ${ MENTION( 'bob.bsky.social', 'did:plc:bob' ) }` ),
		];
		expect( collectMentions( blocks ).map( ( m ) => m.handle ) ).toEqual( [
			'bob.bsky.social',
			'alice.bsky.social',
		] );
	} );

	it( 'recurses into innerBlocks', () => {
		const blocks: BlockNode[] = [
			{
				name: 'core/quote',
				attributes: {},
				innerBlocks: [ para( `${ MENTION( 'carol.bsky.social', 'did:plc:carol' ) }` ) ],
			},
		];
		expect( collectMentions( blocks ).map( ( m ) => m.did ) ).toEqual( [ 'did:plc:carol' ] );
	} );

	it( 'returns [] when there are no blocks', () => {
		expect( collectMentions( [] ) ).toEqual( [] );
	} );
} );
