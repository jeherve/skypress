import { describe, expect, it } from 'vitest';
import {
	publicationHomeUrl,
	articlePath,
	canonicalArticleUrl,
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

const BLOCKS: BlockNode[] = [
	{ name: 'core/heading', attributes: { level: 1, content: 'Hi' }, innerBlocks: [] },
	{ name: 'core/paragraph', attributes: { content: 'Body' }, innerBlocks: [] },
];

describe( 'URLs', () => {
	it( 'prefixes the handle with @ and addresses documents by rkey', () => {
		expect( publicationHomeUrl( 'alice.bsky.social' ) ).toBe(
			`${ SITE_BASE }/@alice.bsky.social`
		);
		expect( articlePath( '3kabcrkey' ) ).toBe( '/3kabcrkey' );
		expect( canonicalArticleUrl( 'alice.bsky.social', '3kabcrkey' ) ).toBe(
			`${ SITE_BASE }/@alice.bsky.social/3kabcrkey`
		);
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
	it( 'sets the required url + name', () => {
		const pub = buildPublicationRecord( { handle: 'alice.bsky.social' } );
		expect( pub.$type ).toBe( 'site.standard.publication' );
		expect( pub.url ).toBe( `${ SITE_BASE }/@alice.bsky.social` );
		expect( pub.name ).toBeTruthy();
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
	it( 'creates a post with an external embed pointing at the article', () => {
		const post = buildBskyPost( {
			title: 'Hello, World!',
			articleUrl: 'https://skypress.blog/@alice.bsky.social/3kabcrkey',
			description: 'An excerpt',
			createdAt: '2026-06-08T12:00:00.000Z',
		} );
		expect( post.$type ).toBe( 'app.bsky.feed.post' );
		expect( post.text ).toContain( 'Hello, World!' );
		expect( post.createdAt ).toBe( '2026-06-08T12:00:00.000Z' );
		expect( post.embed.$type ).toBe( 'app.bsky.embed.external' );
		expect( post.embed.external.uri ).toBe(
			'https://skypress.blog/@alice.bsky.social/3kabcrkey'
		);
		expect( post.embed.external.title ).toBe( 'Hello, World!' );
		expect( typeof post.embed.external.description ).toBe( 'string' );
	} );
} );
