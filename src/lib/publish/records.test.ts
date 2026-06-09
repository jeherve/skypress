import { describe, expect, it } from 'vitest';
import {
	publicationHomeUrl,
	articlePath,
	canonicalArticleUrl,
	publicationSlugFromUrl,
	isSkyPressPublicationUrl,
	slugify,
	uniquePublicationSlug,
	buildContentObject,
	buildPublicationRecord,
	buildDocumentRecord,
	buildBskyPost,
	normalizeBlocks,
	CONTENT_TYPE,
	CONTENT_VERSION,
	SITE_BASE,
} from './records';
import type { BlockNode } from '../blocks/render';
import type { BlobRefJson } from '../media/blob';
import { THEME_PRESETS } from './themes';

const BLOCKS: BlockNode[] = [
	{ name: 'core/heading', attributes: { level: 1, content: 'Hi' }, innerBlocks: [] },
	{ name: 'core/paragraph', attributes: { content: 'Body' }, innerBlocks: [] },
];

describe( 'URLs', () => {
	it( 'namespaces publications under @handle/slug and documents under that', () => {
		expect( publicationHomeUrl( 'alice.bsky.social', 'my-blog' ) ).toBe(
			`${ SITE_BASE }/@alice.bsky.social/my-blog`
		);
		expect( articlePath( '3kabcrkey' ) ).toBe( '/3kabcrkey' );
		expect( canonicalArticleUrl( 'alice.bsky.social', 'my-blog', '3kabcrkey' ) ).toBe(
			`${ SITE_BASE }/@alice.bsky.social/my-blog/3kabcrkey`
		);
	} );
} );

describe( 'publicationSlugFromUrl', () => {
	it( 'returns the trailing slug segment of a publication url', () => {
		expect( publicationSlugFromUrl( `${ SITE_BASE }/@alice.bsky.social/my-blog` ) ).toBe(
			'my-blog'
		);
	} );
	it( 'returns null for a slugless (legacy) or malformed url', () => {
		expect( publicationSlugFromUrl( `${ SITE_BASE }/@alice.bsky.social` ) ).toBeNull();
		expect( publicationSlugFromUrl( 'not a url' ) ).toBeNull();
	} );
} );

describe( 'isSkyPressPublicationUrl', () => {
	it( 'accepts only urls on the SkyPress origin', () => {
		expect( isSkyPressPublicationUrl( `${ SITE_BASE }/@alice.bsky.social/my-blog` ) ).toBe(
			true
		);
		expect( isSkyPressPublicationUrl( 'https://leaflet.pub/lish/did/abc' ) ).toBe( false );
		expect( isSkyPressPublicationUrl( 'garbage' ) ).toBe( false );
	} );
} );

describe( 'slugify', () => {
	it( 'lowercases, dashes spaces, strips to [a-z0-9-] and trims/collapses dashes', () => {
		expect( slugify( '  My  Great Blog! ' ) ).toBe( 'my-great-blog' );
		expect( slugify( 'Hello---World' ) ).toBe( 'hello-world' );
		expect( slugify( '___weird@@@name___' ) ).toBe( 'weirdname' );
	} );
	it( 'normalises accents to their base letters', () => {
		expect( slugify( 'Café Life' ) ).toBe( 'cafe-life' );
	} );
	it( 'returns empty string for empty / emoji-only names', () => {
		expect( slugify( '🎉🎉' ) ).toBe( '' );
		expect( slugify( '   ' ) ).toBe( '' );
	} );
} );

describe( 'uniquePublicationSlug', () => {
	it( 'returns the bare slug when free', () => {
		expect( uniquePublicationSlug( 'My Blog', [] ) ).toBe( 'my-blog' );
	} );
	it( 'appends -2, -3 … on collision within the repo', () => {
		expect( uniquePublicationSlug( 'My Blog', [ 'my-blog' ] ) ).toBe( 'my-blog-2' );
		expect( uniquePublicationSlug( 'My Blog', [ 'my-blog', 'my-blog-2' ] ) ).toBe(
			'my-blog-3'
		);
	} );
	it( 'returns empty string for an unslugifiable name (caller applies pub-{rkey})', () => {
		expect( uniquePublicationSlug( '🎉', [] ) ).toBe( '' );
	} );
} );

describe( 'normalizeBlocks', () => {
	it( 'strips clientId and keeps name/attributes/innerBlocks recursively', () => {
		const live = [
			{
				name: 'core/list',
				clientId: 'abc-123',
				attributes: { ordered: false },
				innerBlocks: [
					{ name: 'core/list-item', clientId: 'def-456', attributes: { content: 'One' }, innerBlocks: [] },
				],
			},
		];
		expect( normalizeBlocks( live ) ).toEqual( [
			{
				name: 'core/list',
				attributes: { ordered: false },
				innerBlocks: [
					{ name: 'core/list-item', attributes: { content: 'One' }, innerBlocks: [] },
				],
			},
		] );
	} );
} );

describe( 'buildContentObject', () => {
	it( 'wraps the block tree with the SkyPress content $type + version', () => {
		const content = buildContentObject( BLOCKS );
		expect( content.$type ).toBe( CONTENT_TYPE );
		expect( content.version ).toBe( CONTENT_VERSION );
		expect( content.blocks ).toEqual( BLOCKS );
	} );
} );

describe( 'buildPublicationRecord', () => {
	it( 'bakes the slug into the required url + name', () => {
		const pub = buildPublicationRecord( {
			handle: 'alice.bsky.social',
			slug: 'my-blog',
			name: 'My Blog',
		} );
		expect( pub.$type ).toBe( 'site.standard.publication' );
		expect( pub.url ).toBe( `${ SITE_BASE }/@alice.bsky.social/my-blog` );
		expect( pub.name ).toBe( 'My Blog' );
	} );

	it( 'falls back to the handle when no name is given', () => {
		const pub = buildPublicationRecord( { handle: 'alice.bsky.social', slug: 'pub-x' } );
		expect( pub.name ).toBe( 'alice.bsky.social' );
	} );

	it( 'includes description and icon only when provided', () => {
		const bare = buildPublicationRecord( { handle: 'a.b', slug: 's', name: 'N' } );
		expect( 'description' in bare ).toBe( false );
		expect( 'icon' in bare ).toBe( false );

		const icon: BlobRefJson = {
			$type: 'blob',
			ref: { $link: 'bafyicon' },
			mimeType: 'image/png',
			size: 1234,
		};
		const full = buildPublicationRecord( {
			handle: 'a.b',
			slug: 's',
			name: 'N',
			description: 'A blog',
			icon,
		} );
		expect( full.description ).toBe( 'A blog' );
		expect( full.icon ).toEqual( icon );
	} );

	it( 'includes basicTheme when provided and omits it otherwise', () => {
		const themed = buildPublicationRecord( {
			handle: 'a.b',
			slug: 's',
			name: 'N',
			basicTheme: THEME_PRESETS[ 0 ].colors,
		} );
		expect( themed.basicTheme ).toEqual( THEME_PRESETS[ 0 ].colors );

		const bare = buildPublicationRecord( { handle: 'a.b', slug: 's', name: 'N' } );
		expect( 'basicTheme' in bare ).toBe( false );
	} );

	it( 'drops an invalid basicTheme rather than persisting it (write-boundary validation)', () => {
		const record = buildPublicationRecord( {
			handle: 'a.b',
			slug: 's',
			name: 'N',
			// Out-of-range channel — must never reach storage.
			basicTheme: {
				$type: 'site.standard.theme.basic',
				background: { r: 300, g: 0, b: 0 },
				foreground: { r: 0, g: 0, b: 0 },
				accent: { r: 0, g: 0, b: 0 },
				accentForeground: { r: 0, g: 0, b: 0 },
			} as never,
		} );
		expect( 'basicTheme' in record ).toBe( false );
	} );
} );

describe( 'buildDocumentRecord', () => {
	const base = {
		title: 'Hello, World!',
		rkey: '3kabcrkey',
		blocks: BLOCKS,
		textContent: 'Hi\n\nBody',
		siteUri: 'at://did:plc:abc/site.standard.publication/xyz',
		publishedAt: '2026-06-08T12:00:00.000Z',
	};

	it( 'includes the required fields, content object and textContent', () => {
		const doc = buildDocumentRecord( base );
		expect( doc.$type ).toBe( 'site.standard.document' );
		expect( doc.site ).toBe( base.siteUri );
		expect( doc.title ).toBe( base.title );
		expect( doc.path ).toBe( '/3kabcrkey' );
		expect( doc.publishedAt ).toBe( base.publishedAt );
		expect( doc.textContent ).toBe( base.textContent );
		expect( ( doc.content as { $type: string } ).$type ).toBe( CONTENT_TYPE );
	} );

	it( 'omits bskyPostRef unless provided', () => {
		expect( 'bskyPostRef' in buildDocumentRecord( base ) ).toBe( false );
		const ref = { uri: 'at://did:plc:abc/app.bsky.feed.post/p', cid: 'bafy' };
		expect( buildDocumentRecord( { ...base, bskyPostRef: ref } ).bskyPostRef ).toEqual( ref );
	} );

	it( 'omits updatedAt on first publish, includes it on edit', () => {
		expect( 'updatedAt' in buildDocumentRecord( base ) ).toBe( false );
		const edited = buildDocumentRecord( { ...base, updatedAt: '2026-06-09T09:00:00.000Z' } );
		expect( edited.updatedAt ).toBe( '2026-06-09T09:00:00.000Z' );
		expect( edited.publishedAt ).toBe( base.publishedAt ); // preserved
	} );
} );

describe( 'buildBskyPost', () => {
	const ARTICLE_URL = 'https://skypress.blog/@alice.bsky.social/my-blog/3kabcrkey';

	it( 'creates a post with an external embed pointing at the article', () => {
		const post = buildBskyPost( {
			title: 'Hello, World!',
			articleUrl: ARTICLE_URL,
			description: 'An excerpt',
			createdAt: '2026-06-08T12:00:00.000Z',
		} );
		expect( post.$type ).toBe( 'app.bsky.feed.post' );
		expect( post.text ).toContain( 'Hello, World!' );
		expect( post.createdAt ).toBe( '2026-06-08T12:00:00.000Z' );
		expect( post.embed.$type ).toBe( 'app.bsky.embed.external' );
		expect( post.embed.external.uri ).toBe( ARTICLE_URL );
		expect( post.embed.external.title ).toBe( 'Hello, World!' );
		expect( typeof post.embed.external.description ).toBe( 'string' );
	} );

	it( 'marks the article URL as a clickable link facet over its byte range', () => {
		const post = buildBskyPost( {
			title: 'Hello, World!',
			articleUrl: ARTICLE_URL,
			createdAt: '2026-06-08T12:00:00.000Z',
		} );
		const bytes = ( s: string ) => new TextEncoder().encode( s ).length;
		const byteStart = bytes( `Hello, World!\n\n` );
		expect( post.facets ).toEqual( [
			{
				$type: 'app.bsky.richtext.facet',
				index: { byteStart, byteEnd: byteStart + bytes( ARTICLE_URL ) },
				features: [ { $type: 'app.bsky.richtext.facet#link', uri: ARTICLE_URL } ],
			},
		] );
	} );

	it( 'computes facet byte offsets in UTF-8 (multibyte title)', () => {
		const post = buildBskyPost( {
			title: '🍔 Burgers',
			articleUrl: ARTICLE_URL,
			createdAt: '2026-06-08T12:00:00.000Z',
		} );
		const bytes = ( s: string ) => new TextEncoder().encode( s ).length;
		// The emoji is 4 UTF-8 bytes, so the link starts well past its JS string index.
		expect( post.facets[ 0 ].index.byteStart ).toBe( bytes( '🍔 Burgers\n\n' ) );
		expect( post.facets[ 0 ].index.byteEnd ).toBe(
			bytes( '🍔 Burgers\n\n' ) + bytes( ARTICLE_URL )
		);
	} );

	it( 'embeds associatedRefs (document, publication strongRefs) when provided', () => {
		const documentRef = { uri: 'at://did:plc:abc/site.standard.document/d1', cid: 'bafydoc' };
		const publicationRef = {
			uri: 'at://did:plc:abc/site.standard.publication/p1',
			cid: 'bafypub',
		};
		const post = buildBskyPost( {
			title: 'Hello, World!',
			articleUrl: ARTICLE_URL,
			createdAt: '2026-06-08T12:00:00.000Z',
			associatedRefs: [ documentRef, publicationRef ],
		} );
		expect( post.embed.external.associatedRefs ).toEqual( [
			{ $type: 'com.atproto.repo.strongRef', ...documentRef },
			{ $type: 'com.atproto.repo.strongRef', ...publicationRef },
		] );
	} );

	it( 'omits associatedRefs when none are provided', () => {
		const post = buildBskyPost( {
			title: 'Hello, World!',
			articleUrl: ARTICLE_URL,
			createdAt: '2026-06-08T12:00:00.000Z',
		} );
		expect( 'associatedRefs' in post.embed.external ).toBe( false );
	} );

	it( 'includes embed.external.thumb only when a blob ref is provided (Decision 0014)', () => {
		const base = {
			title: 'Hello, World!',
			articleUrl: ARTICLE_URL,
			createdAt: '2026-06-08T12:00:00.000Z',
		};
		expect( 'thumb' in buildBskyPost( base ).embed.external ).toBe( false );

		const thumb: BlobRefJson = {
			$type: 'blob',
			ref: { $link: 'bafythumb' },
			mimeType: 'image/png',
			size: 4242,
		};
		expect( buildBskyPost( { ...base, thumb } ).embed.external.thumb ).toEqual( thumb );
	} );
} );
