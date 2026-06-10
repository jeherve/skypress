import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import { publish, updateDocument, listAllMyArticles, listPublicationArticles, getMyArticle } from './publisher';
import { SITE_BASE } from './records';
import type { BlockNode } from '../blocks/render';
import { deriveExcerpt } from './excerpt';
import { blocksToText } from '../blocks/render';

const DID = 'did:plc:me';
const HANDLE = 'me.bsky.social';
const BLOCKS: BlockNode[] = [
	{ name: 'core/paragraph', attributes: { content: 'Body' }, innerBlocks: [] },
];

function mockAgent( byCollection: Record< string, unknown[] > = {} ) {
	const created: Array< { collection: string; rkey?: string; record: Record< string, unknown > } > = [];
	const put: Array< { collection: string; rkey: string; record: Record< string, unknown > } > = [];
	const agent = {
		com: {
			atproto: {
				repo: {
					listRecords: vi.fn( async ( { collection }: { collection: string } ) => ( {
						data: { records: byCollection[ collection ] ?? [] },
					} ) ),
					createRecord: vi.fn(
						async ( {
							collection,
							rkey,
							record,
						}: {
							collection: string;
							rkey?: string;
							record: Record< string, unknown >;
						} ) => {
							created.push( { collection, rkey, record } );
							const id = rkey ?? `gen-${ created.length }`;
							return { data: { uri: `at://${ DID }/${ collection }/${ id }`, cid: 'bafy-new' } };
						}
					),
					putRecord: vi.fn(
						async ( {
							collection,
							rkey,
							record,
						}: {
							collection: string;
							rkey: string;
							record: Record< string, unknown >;
						} ) => {
							put.push( { collection, rkey, record } );
							return { data: { uri: `at://${ DID }/${ collection }/${ rkey }`, cid: 'bafy-put' } };
						}
					),
				},
			},
		},
	} as unknown as Agent;
	return { agent, created, put };
}

const TARGET = {
	publicationUri: `at://${ DID }/site.standard.publication/pub1`,
	publicationCid: 'bafy-pub1',
	publicationSlug: 'my-blog',
};

describe( 'publish', () => {
	it( 'targets the chosen publication and builds a slug-namespaced article url', async () => {
		const { agent, created } = mockAgent();
		const result = await publish(
			agent,
			{ did: DID, handle: HANDLE },
			{ title: 'Hello', blocks: BLOCKS, ...TARGET }
		);

		expect( result.publicationUri ).toBe( TARGET.publicationUri );
		expect( result.articleUrl ).toMatch(
			new RegExp( `^${ SITE_BASE }/@${ HANDLE }/my-blog/` )
		);

		// One post + one document, the document pinned to the chosen publication.
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' );
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' );
		expect( post ).toBeTruthy();
		expect( doc ).toBeTruthy();
		expect( doc!.record.site ).toBe( TARGET.publicationUri );

		// It does NOT auto-create a publication (no ensurePublication anymore).
		expect( created.some( ( c ) => c.collection === 'site.standard.publication' ) ).toBe( false );
	} );

	it( 'sets embed.external.thumb to the first uploaded image blob (Decision 0014)', async () => {
		const thumb = {
			$type: 'blob',
			ref: { $link: 'bafyimg' },
			mimeType: 'image/jpeg',
			size: 5000,
		};
		const blocksWithImage: BlockNode[] = [
			{ name: 'core/paragraph', attributes: { content: 'Intro' }, innerBlocks: [] },
			{ name: 'core/image', attributes: { url: 'getblob://x', skypressBlob: thumb }, innerBlocks: [] },
		];
		const { agent, created } = mockAgent();
		await publish(
			agent,
			{ did: DID, handle: HANDLE },
			{ title: 'Hello', blocks: blocksWithImage, ...TARGET }
		);
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: { thumb?: unknown } };
		};
		expect( post.embed.external.thumb ).toEqual( thumb );
	} );

	it( 'omits thumb when no usable image is present', async () => {
		const { agent, created } = mockAgent();
		await publish( agent, { did: DID, handle: HANDLE }, { title: 'Hello', blocks: BLOCKS, ...TARGET } );
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: Record< string, unknown > };
		};
		expect( 'thumb' in post.embed.external ).toBe( false );
	} );

	it( 'prefers an explicit coverImage over the first content image for the thumb', async () => {
		const auto = {
			$type: 'blob',
			ref: { $link: 'bafyauto' },
			mimeType: 'image/jpeg',
			size: 5000,
		};
		const cover = {
			$type: 'blob',
			ref: { $link: 'bafycover' },
			mimeType: 'image/png',
			size: 9000,
		};
		const blocksWithImage: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'getblob://x', skypressBlob: auto }, innerBlocks: [] },
		];
		const { agent, created } = mockAgent();
		await publish(
			agent,
			{ did: DID, handle: HANDLE },
			{ title: 'Hello', blocks: blocksWithImage, coverImage: cover as never, ...TARGET }
		);
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: { thumb?: { ref: { $link: string } } } };
		};
		expect( post.embed.external.thumb?.ref.$link ).toBe( 'bafycover' );
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record as {
			coverImage?: { ref: { $link: string } };
		};
		expect( doc.coverImage?.ref.$link ).toBe( 'bafycover' );
	} );

	it( 'falls back to the first content image when no cover is set', async () => {
		const auto = {
			$type: 'blob',
			ref: { $link: 'bafyauto' },
			mimeType: 'image/jpeg',
			size: 5000,
		};
		const blocksWithImage: BlockNode[] = [
			{ name: 'core/image', attributes: { url: 'getblob://x', skypressBlob: auto }, innerBlocks: [] },
		];
		const { agent, created } = mockAgent();
		await publish(
			agent,
			{ did: DID, handle: HANDLE },
			{ title: 'Hello', blocks: blocksWithImage, ...TARGET }
		);
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: { thumb?: { ref: { $link: string } } } };
		};
		expect( post.embed.external.thumb?.ref.$link ).toBe( 'bafyauto' );
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record as {
			coverImage?: unknown;
		};
		expect( 'coverImage' in doc ).toBe( false );
	} );

	it( 'writes the document first so the post can embed its strongRef (standard.site card)', async () => {
		const { agent, created, put } = mockAgent();
		await publish( agent, { did: DID, handle: HANDLE }, { title: 'Hello', blocks: BLOCKS, ...TARGET } );

		// 3-write order: document (no ref yet) → post → putRecord document with bskyPostRef.
		expect( created.map( ( c ) => c.collection ) ).toEqual( [
			'site.standard.document',
			'app.bsky.feed.post',
		] );
		expect( created[ 0 ].record.bskyPostRef ).toBeUndefined();

		const docUri = `at://${ DID }/site.standard.document/${ created[ 0 ].rkey }`;
		const postUri = `at://${ DID }/app.bsky.feed.post/gen-2`;

		// The post embeds associatedRefs to the document AND the publication.
		const post = created[ 1 ].record as {
			facets: unknown[];
			embed: { external: { associatedRefs: Array< { uri: string } > } };
		};
		expect( post.embed.external.associatedRefs ).toEqual( [
			{ $type: 'com.atproto.repo.strongRef', uri: docUri, cid: 'bafy-new' },
			{
				$type: 'com.atproto.repo.strongRef',
				uri: TARGET.publicationUri,
				cid: TARGET.publicationCid,
			},
		] );
		// And the link is clickable.
		expect( post.facets ).toHaveLength( 1 );

		// The document is then updated to point back at the post (preserved for unpublish).
		expect( put ).toHaveLength( 1 );
		expect( put[ 0 ].collection ).toBe( 'site.standard.document' );
		expect( put[ 0 ].rkey ).toBe( created[ 0 ].rkey );
		expect( put[ 0 ].record.bskyPostRef ).toEqual( { uri: postUri, cid: 'bafy-new' } );
	} );
} );

describe( 'updateDocument', () => {
	it( 'putRecords the same rkey and keeps the slug-namespaced url', async () => {
		const { agent, put } = mockAgent();
		const res = await updateDocument(
			agent,
			{ did: DID, handle: HANDLE },
			{
				rkey: '3kdoc',
				siteUri: TARGET.publicationUri,
				publicationSlug: 'my-blog',
				publishedAt: '2026-06-08T00:00:00.000Z',
				title: 'Hello again',
				blocks: BLOCKS,
			}
		);
		expect( put ).toHaveLength( 1 );
		expect( put[ 0 ].rkey ).toBe( '3kdoc' );
		expect( put[ 0 ].record.site ).toBe( TARGET.publicationUri );
		expect( res.articleUrl ).toBe( `${ SITE_BASE }/@${ HANDLE }/my-blog/3kdoc` );
	} );

	it( 'writes the coverImage when provided', async () => {
		const cover = {
			$type: 'blob',
			ref: { $link: 'bafycover' },
			mimeType: 'image/png',
			size: 9000,
		};
		const { agent, put } = mockAgent();
		await updateDocument(
			agent,
			{ did: DID, handle: HANDLE },
			{
				rkey: '3kdoc',
				siteUri: TARGET.publicationUri,
				publicationSlug: 'my-blog',
				publishedAt: '2026-06-08T00:00:00.000Z',
				title: 'Hello again',
				blocks: BLOCKS,
				coverImage: cover as never,
			}
		);
		const doc = put.find( ( p ) => p.collection === 'site.standard.document' )!.record as {
			coverImage?: { ref: { $link: string } };
		};
		expect( doc.coverImage?.ref.$link ).toBe( 'bafycover' );
	} );
} );

describe( 'listPublicationArticles', () => {
	it( 'returns the publication’s documents annotated with its slug', async () => {
		const pubUri = `at://${ DID }/site.standard.publication/pub1`;
		const { agent } = mockAgent( {
			'site.standard.document': [
				{
					uri: `at://${ DID }/site.standard.document/d1`,
					value: { title: 'One', site: pubUri, publishedAt: '2026-01-01' },
				},
				{
					uri: `at://${ DID }/site.standard.document/d2`,
					value: { title: 'Two', site: `at://${ DID }/site.standard.publication/other` },
				},
			],
		} );
		const articles = await listPublicationArticles( agent, DID, { uri: pubUri, slug: 'my-blog' } );
		expect( articles ).toHaveLength( 1 );
		expect( articles[ 0 ] ).toMatchObject( { rkey: 'd1', title: 'One', siteSlug: 'my-blog' } );
	} );
} );

describe( 'listAllMyArticles', () => {
	it( 'annotates each article with its publication slug and drops orphans', async () => {
		const { agent } = mockAgent( {
			'site.standard.publication': [
				{
					uri: `at://${ DID }/site.standard.publication/pub1`,
					value: {
						$type: 'site.standard.publication',
						url: `${ SITE_BASE }/@${ HANDLE }/blog-a`,
						name: 'Blog A',
					},
				},
			],
			'site.standard.document': [
				{
					uri: `at://${ DID }/site.standard.document/d1`,
					value: { title: 'In A', site: `at://${ DID }/site.standard.publication/pub1` },
				},
				{
					uri: `at://${ DID }/site.standard.document/d2`,
					value: { title: 'Orphan', site: `at://${ DID }/site.standard.publication/gone` },
				},
			],
		} );
		const articles = await listAllMyArticles( agent, DID );
		expect( articles ).toHaveLength( 1 );
		expect( articles[ 0 ] ).toMatchObject( { rkey: 'd1', siteSlug: 'blog-a' } );
	} );
} );

describe( 'getMyArticle', () => {
	function repo() {
		return mockAgent( {
			'site.standard.publication': [
				{
					uri: `at://${ DID }/site.standard.publication/pub1`,
					value: {
						$type: 'site.standard.publication',
						url: `${ SITE_BASE }/@${ HANDLE }/blog-a`,
						name: 'Blog A',
					},
				},
			],
			'site.standard.document': [
				{
					uri: `at://${ DID }/site.standard.document/d1`,
					value: { title: 'In A', site: `at://${ DID }/site.standard.publication/pub1` },
				},
				{
					uri: `at://${ DID }/site.standard.document/d2`,
					value: { title: 'Orphan', site: `at://${ DID }/site.standard.publication/gone` },
				},
			],
		} );
	}

	it( 'returns the writer’s article by rkey, slug-annotated', async () => {
		const { agent } = repo();
		const article = await getMyArticle( agent, DID, 'd1' );
		expect( article ).toMatchObject( { rkey: 'd1', title: 'In A', siteSlug: 'blog-a' } );
	} );

	it( 'returns null for an unknown rkey', async () => {
		const { agent } = repo();
		expect( await getMyArticle( agent, DID, 'nope' ) ).toBeNull();
	} );

	it( 'returns null for a foreign/orphan document', async () => {
		const { agent } = repo();
		expect( await getMyArticle( agent, DID, 'd2' ) ).toBeNull();
	} );

	it( 'round-trips the stored coverImage as a normalized blob ref', async () => {
		const { agent } = mockAgent( {
			'site.standard.publication': [
				{
					uri: `at://${ DID }/site.standard.publication/pub1`,
					value: {
						$type: 'site.standard.publication',
						url: `${ SITE_BASE }/@${ HANDLE }/blog-a`,
						name: 'Blog A',
					},
				},
			],
			'site.standard.document': [
				{
					uri: `at://${ DID }/site.standard.document/d1`,
					value: {
						title: 'In A',
						site: `at://${ DID }/site.standard.publication/pub1`,
						coverImage: {
							$type: 'blob',
							ref: { $link: 'bafycover' },
							mimeType: 'image/png',
							size: 4242,
						},
					},
				},
			],
		} );
		const article = await getMyArticle( agent, DID, 'd1' );
		expect( article?.coverImage ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafycover' },
			mimeType: 'image/png',
			size: 4242,
		} );
	} );
} );

describe( 'publish — description fallback', () => {
	it( 'derives the description from the post text when none is provided', async () => {
		const { agent, created } = mockAgent();
		await publish( agent, { did: DID, handle: HANDLE }, { title: 'Hello', blocks: BLOCKS, ...TARGET } );

		const expected = deriveExcerpt( blocksToText( BLOCKS ) );
		expect( expected.length ).toBeGreaterThan( 0 );
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record;
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: { description: string } };
		};
		expect( doc.description ).toBe( expected );
		expect( post.embed.external.description ).toBe( expected );
	} );

	it( 'uses the provided description verbatim (trimmed) in both records', async () => {
		const { agent, created } = mockAgent();
		await publish(
			agent,
			{ did: DID, handle: HANDLE },
			{ title: 'Hello', blocks: BLOCKS, description: '  Hand-written lede  ', ...TARGET }
		);
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record;
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: { description: string } };
		};
		expect( doc.description ).toBe( 'Hand-written lede' );
		expect( post.embed.external.description ).toBe( 'Hand-written lede' );
	} );

	it( 'omits the document description (and posts empty) when there is no text and no lede', async () => {
		const emptyBlocks: BlockNode[] = [
			{ name: 'core/paragraph', attributes: { content: '' }, innerBlocks: [] },
		];
		const { agent, created } = mockAgent();
		await publish( agent, { did: DID, handle: HANDLE }, { title: 'Hello', blocks: emptyBlocks, ...TARGET } );
		const doc = created.find( ( c ) => c.collection === 'site.standard.document' )!.record;
		const post = created.find( ( c ) => c.collection === 'app.bsky.feed.post' )!.record as {
			embed: { external: Record< string, unknown > };
		};
		expect( 'description' in doc ).toBe( false );
		expect( post.embed.external.description ).toBe( '' );
	} );

	it( 'updateDocument derives the description from the post text when none is provided', async () => {
		const { agent, put } = mockAgent();
		await updateDocument(
			agent,
			{ did: DID, handle: HANDLE },
			{
				rkey: '3kdoc',
				siteUri: TARGET.publicationUri,
				publicationSlug: 'my-blog',
				publishedAt: '2026-06-08T00:00:00.000Z',
				title: 'Hello again',
				blocks: BLOCKS,
			}
		);
		expect( put[ 0 ].record.description ).toBe( deriveExcerpt( blocksToText( BLOCKS ) ) );
	} );
} );
