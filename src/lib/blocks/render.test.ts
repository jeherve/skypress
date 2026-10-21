import { beforeAll, describe, expect, it } from 'vitest';
import { createBlock } from '@wordpress/blocks';
import { registerSkyPressBlocks, serializeBlocks } from './serialize';
import { renderBlocks, blocksToText } from './render';

/** Strip Gutenberg block-delimiter comments, leaving the frontend HTML. */
function stripDelimiters( markup: string ): string {
	return markup.replace( /<!--\s*\/?wp:[\s\S]*?-->/g, '' );
}

/** Collapse insignificant whitespace so structural comparisons are stable. */
function normalize( html: string ): string {
	return html
		.replace( />\s+</g, '><' )
		.replace( /\s+/g, ' ' )
		.trim();
}

beforeAll( () => {
	registerSkyPressBlocks();
} );

describe( 'renderBlocks — fidelity vs @wordpress/blocks.serialize()', () => {
	it( 'reproduces the save-HTML of the curated sample blocks', () => {
		// The dependency-free renderer must produce the SAME frontend HTML that
		// Gutenberg's own save functions produce (the oracle). This locks the light
		// reader renderer to the real packages without importing them at runtime.
		const tree = [
			createBlock( 'core/heading', {
				level: 1,
				content: "The open sky meets the typesetter's bench",
			} ),
			createBlock( 'core/paragraph', {
				content: 'You write in <strong>blocks</strong> &amp; own your words.',
			} ),
			createBlock( 'core/list', {}, [
				createBlock( 'core/list-item', { content: 'Your data lives on your PDS.' } ),
				createBlock( 'core/list-item', { content: 'Rendered with the same packages.' } ),
			] ),
			createBlock( 'core/quote', {}, [
				createBlock( 'core/paragraph', { content: 'A place to write things worth keeping.' } ),
			] ),
			createBlock( 'core/code', {
				content: 'agent.com.atproto.repo.createRecord( { collection, record } )',
			} ),
			createBlock( 'core/separator' ),
		];

		const expected = normalize( stripDelimiters( serializeBlocks( tree ) ) );
		const actual = normalize( renderBlocks( tree ) );

		expect( actual ).toBe( expected );
	} );

	it( 'reproduces a paragraph containing a skypress mention', async () => {
		// Registering the mention format teaches @wordpress/blocks how to serialize the
		// anchor (incl. data-did). Without it, serialize() would drop the attribute.
		const { registerMentionFormat } = await import( '../editor/mention-format' );
		registerMentionFormat();

		const tree = [
			createBlock( 'core/paragraph', {
				content:
					'Thanks <a class="skypress-mention" href="https://bsky.app/profile/alice.bsky.social" data-did="did:plc:alice">@alice.bsky.social</a>!',
			} ),
		];

		const expected = normalize( stripDelimiters( serializeBlocks( tree ) ) );
		const actual = normalize( renderBlocks( tree ) );

		expect( actual ).toBe( expected );
	} );

	it( 'reproduces nested lists inside list items', () => {
		const tree = [
			createBlock( 'core/list', {}, [
				createBlock( 'core/list-item', { content: 'First' } ),
				createBlock( 'core/list-item', { content: 'Second' }, [
					createBlock( 'core/list', { ordered: true }, [
						createBlock( 'core/list-item', { content: 'Nested one' } ),
						createBlock( 'core/list-item', { content: 'Nested two' } ),
					] ),
				] ),
			] ),
		];

		const expected = normalize( stripDelimiters( serializeBlocks( tree ) ) );
		const actual = normalize( renderBlocks( tree ) );

		expect( actual ).toContain( 'Nested two' );
		expect( actual ).toBe( expected );
	} );

	it( 'reproduces a gallery of captioned images', () => {
		const tree = [
			createBlock( 'core/gallery', { caption: 'Three screens' }, [
				createBlock( 'core/image', {
					url: 'https://example.com/a.png',
					alt: 'First screen',
					caption: 'Writing',
				} ),
				createBlock( 'core/image', { url: 'https://example.com/b.png', alt: 'Second screen' } ),
			] ),
		];

		const expected = normalize( stripDelimiters( serializeBlocks( tree ) ) );
		const actual = normalize( renderBlocks( tree ) );

		expect( actual ).toContain( 'https://example.com/b.png' );
		expect( actual ).toBe( expected );
	} );

	it( 'renders an ordered list as <ol>', () => {
		const tree = [
			createBlock( 'core/list', { ordered: true }, [
				createBlock( 'core/list-item', { content: 'First' } ),
			] ),
		];
		expect( renderBlocks( tree ) ).toContain( '<ol' );
	} );
} );

describe( 'blocksToText (textContent extraction)', () => {
	it( 'yields clean plain text in document order, stripping inline markup', () => {
		const blocks = [
			createBlock( 'core/heading', { level: 2, content: 'Welcome' } ),
			createBlock( 'core/paragraph', {
				content: 'Hello <strong>world</strong> &amp; friends',
			} ),
		];
		expect( blocksToText( blocks ) ).toBe( 'Welcome\n\nHello world & friends' );
	} );

	it( 'recurses into inner blocks (list items)', () => {
		const blocks = [
			createBlock( 'core/list', {}, [
				createBlock( 'core/list-item', { content: 'First' } ),
				createBlock( 'core/list-item', { content: 'Second' } ),
			] ),
		];
		expect( blocksToText( blocks ) ).toBe( 'First\n\nSecond' );
	} );

	it( 'ignores blocks without text (separator) without leaving blank gaps', () => {
		const blocks = [
			createBlock( 'core/paragraph', { content: 'Before' } ),
			createBlock( 'core/separator' ),
			createBlock( 'core/paragraph', { content: 'After' } ),
		];
		expect( blocksToText( blocks ) ).toBe( 'Before\n\nAfter' );
	} );
} );

describe( 'core/embed', () => {
	it( 'renders the resolved card when a payload is attached', () => {
		const html = renderBlocks( [
			{
				name: 'core/embed',
				attributes: {
					url: 'https://bsky.app/profile/a/post/b',
					_skypressEmbed: {
						kind: 'atproto',
						authorName: 'A',
						handle: 'a.bsky.social',
						text: 'hi',
						images: [],
						viewUrl: 'https://mu.social/profile/did:plc:a/post/b',
					},
				},
			},
		] );
		expect( html ).toContain( 'skypress-embed--atproto' );
		expect( html ).toContain( 'hi' );
	} );

	it( 'falls back to a plain link when there is no payload', () => {
		const html = renderBlocks( [
			{ name: 'core/embed', attributes: { url: 'https://example.com/x' } },
		] );
		expect( html ).toContain( '<a' );
		expect( html ).toContain( 'https://example.com/x' );
		expect( html ).not.toContain( 'skypress-embed' );
	} );

	it( 'renders nothing for an embed with no url and no payload', () => {
		expect( renderBlocks( [ { name: 'core/embed', attributes: {} } ] ) ).toBe( '' );
	} );
} );
