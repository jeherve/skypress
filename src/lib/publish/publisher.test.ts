import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import { publish, updateDocument, listAllMyArticles, listPublicationArticles } from './publisher';
import { SITE_BASE } from './records';
import type { BlockNode } from '../blocks/render';

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
