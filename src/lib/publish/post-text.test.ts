import { describe, expect, it } from 'vitest';
import { assemblePostText } from './post-text';

const URL = 'https://skypress.blog/@me/pub/3kabcde12345';

function bytes( s: string ): number {
	return new TextEncoder().encode( s ).length;
}

describe( 'assemblePostText', () => {
	it( 'with no lede or mentions, is title + URL (back-compat)', () => {
		const { text, facets } = assemblePostText( { title: 'Hello', articleUrl: URL } );
		expect( text ).toBe( `Hello\n\n${ URL }` );
		expect( facets ).toHaveLength( 1 );
		const link = facets[ 0 ];
		expect( link.features[ 0 ] ).toEqual( {
			$type: 'app.bsky.richtext.facet#link',
			uri: URL,
		} );
		expect( link.index.byteStart ).toBe( bytes( 'Hello\n\n' ) );
		expect( link.index.byteEnd ).toBe( bytes( 'Hello\n\n' ) + bytes( URL ) );
	} );

	it( 'includes the lede between title and URL when provided', () => {
		const { text } = assemblePostText( {
			title: 'Hello',
			articleUrl: URL,
			bodyLede: 'A short lede.',
		} );
		expect( text ).toBe( `Hello\n\nA short lede.\n\n${ URL }` );
	} );

	it( 'adds a cc line with a mention facet per handle', () => {
		const { text, facets } = assemblePostText( {
			title: 'Hi',
			articleUrl: URL,
			mentions: [
				{ did: 'did:plc:a', handle: 'alice.bsky.social', displayText: '@alice.bsky.social' },
				{ did: 'did:plc:b', handle: 'bob.bsky.social', displayText: '@bob.bsky.social' },
			],
		} );
		expect( text ).toBe( `Hi\n\ncc @alice.bsky.social @bob.bsky.social\n\n${ URL }` );

		const mentions = facets.filter(
			( f ) => f.features[ 0 ].$type === 'app.bsky.richtext.facet#mention'
		);
		expect( mentions ).toHaveLength( 2 );

		const ccPrefix = 'Hi\n\ncc ';
		const aliceStart = bytes( ccPrefix );
		expect( mentions[ 0 ].index ).toEqual( {
			byteStart: aliceStart,
			byteEnd: aliceStart + bytes( '@alice.bsky.social' ),
		} );
		expect( mentions[ 0 ].features[ 0 ] ).toEqual( {
			$type: 'app.bsky.richtext.facet#mention',
			did: 'did:plc:a',
		} );
	} );

	it( 'computes correct byte offsets with a multibyte title (emoji)', () => {
		const title = '🚀 Launch';
		const { text, facets } = assemblePostText( {
			title,
			articleUrl: URL,
			mentions: [
				{ did: 'did:plc:a', handle: 'alice.bsky.social', displayText: '@alice.bsky.social' },
			],
		} );
		const mention = facets.find(
			( f ) => f.features[ 0 ].$type === 'app.bsky.richtext.facet#mention'
		)!;
		const prefix = `${ title }\n\ncc `;
		expect( mention.index.byteStart ).toBe( bytes( prefix ) );
		const buf = new TextEncoder().encode( text );
		const slice = new TextDecoder().decode(
			buf.slice( mention.index.byteStart, mention.index.byteEnd )
		);
		expect( slice ).toBe( '@alice.bsky.social' );
	} );

	it( 'computes correct byte offsets for a multibyte handle', () => {
		const handle = 'señor.bsky.social';
		const { text, facets } = assemblePostText( {
			title: 'Hi',
			articleUrl: URL,
			mentions: [ { did: 'did:plc:s', handle, displayText: `@${ handle }` } ],
		} );
		const mention = facets.find(
			( f ) => f.features[ 0 ].$type === 'app.bsky.richtext.facet#mention'
		)!;
		const buf = new TextEncoder().encode( text );
		const slice = new TextDecoder().decode(
			buf.slice( mention.index.byteStart, mention.index.byteEnd )
		);
		expect( slice ).toBe( `@${ handle }` );
	} );
} );
