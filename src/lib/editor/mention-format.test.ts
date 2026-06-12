import { describe, expect, it, beforeAll } from 'vitest';
import { create, toHTMLString, applyFormat } from '@wordpress/rich-text';
import { registerMentionFormat, MENTION_FORMAT } from './mention-format';

beforeAll( () => {
	registerMentionFormat();
} );

describe( 'skypress/mention format', () => {
	it( 'round-trips an anchor carrying href + data-did, keeping the text', () => {
		// Build a value "@alice.bsky.social" and apply the mention format across it.
		const value = create( { text: '@alice.bsky.social' } );
		const formatted = applyFormat(
			value,
			// The bundled `RichTextFormat` type only models `{ type }`; the runtime
			// `attributes` map is real, so cast to satisfy the incomplete type.
			{
				type: MENTION_FORMAT,
				attributes: {
					url: 'https://bsky.app/profile/alice.bsky.social',
					did: 'did:plc:alice',
				},
			} as unknown as Parameters< typeof applyFormat >[ 1 ],
			0,
			value.text.length
		);
		const html = toHTMLString( { value: formatted } );
		expect( html ).toContain( 'href="https://bsky.app/profile/alice.bsky.social"' );
		expect( html ).toContain( 'data-did="did:plc:alice"' );
		expect( html ).toContain( '@alice.bsky.social' );
		expect( html ).toContain( 'class="skypress-mention"' );
	} );

	it( 'is idempotent — calling register twice does not throw', () => {
		expect( () => registerMentionFormat() ).not.toThrow();
	} );
} );
