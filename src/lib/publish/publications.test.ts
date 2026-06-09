import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import {
	listPublications,
	listAllPublications,
	createPublication,
	updatePublication,
	deletePublication,
} from './publications';
import { SITE_BASE } from './records';
import { THEME_PRESETS } from './themes';
import type { BlobRefJson } from '../media/blob';

const DID = 'did:plc:me';

function pubRecord( rkey: string, url: string, extra: Record< string, unknown > = {} ) {
	return {
		uri: `at://${ DID }/site.standard.publication/${ rkey }`,
		cid: `bafy-${ rkey }`,
		value: { $type: 'site.standard.publication', url, name: `Pub ${ rkey }`, ...extra },
	};
}
function docRecord( rkey: string, site: string, extra: Record< string, unknown > = {} ) {
	return {
		uri: `at://${ DID }/site.standard.document/${ rkey }`,
		cid: `bafy-${ rkey }`,
		value: { $type: 'site.standard.document', site, title: `Doc ${ rkey }`, ...extra },
	};
}

/** A mock Agent whose `com.atproto.repo` records the calls made against it. */
function mockAgent( byCollection: Record< string, unknown[] > = {} ) {
	const created: Array< { collection: string; rkey?: string; record: Record< string, unknown > } > = [];
	const put: Array< { collection: string; rkey: string; record: Record< string, unknown > } > = [];
	const deleted: Array< { collection: string; rkey: string } > = [];
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
							const id = rkey ?? 'generated';
							created.push( { collection, rkey, record } );
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
					deleteRecord: vi.fn(
						async ( { collection, rkey }: { collection: string; rkey: string } ) => {
							deleted.push( { collection, rkey } );
							return {};
						}
					),
				},
			},
		},
	} as unknown as Agent;
	return { agent, created, put, deleted };
}

describe( 'listPublications', () => {
	it( 'returns only SkyPress-origin publications, mapped with their slug', async () => {
		const { agent } = mockAgent( {
			'site.standard.publication': [
				pubRecord( 'a', `${ SITE_BASE }/@me.bsky.social/my-blog`, { description: 'Hi' } ),
				pubRecord( 'b', 'https://leaflet.pub/lish/did:plc:me/xyz' ), // foreign → excluded
				pubRecord( 'c', `${ SITE_BASE }/@me.bsky.social` ), // slugless → excluded
			],
		} );
		const pubs = await listPublications( agent, DID );
		expect( pubs ).toHaveLength( 1 );
		expect( pubs[ 0 ] ).toMatchObject( {
			uri: `at://${ DID }/site.standard.publication/a`,
			rkey: 'a',
			slug: 'my-blog',
			name: 'Pub a',
			description: 'Hi',
		} );
	} );

	it( 'normalises an icon the @atproto/api client deserialised into a BlobRef', async () => {
		// The live agent runs `jsonToLex` over responses, turning the stored icon blob into a
		// BlobRef instance whose `ref` is a CID OBJECT (no `$link`) — not the JSON shape. The
		// dashboard reads `icon.ref.$link`, so an un-normalised icon yields `cid=undefined`.
		const cidObject = { toString: () => 'bafyrealcid' }; // stands in for a multiformats CID
		const { agent } = mockAgent( {
			'site.standard.publication': [
				pubRecord( 'a', `${ SITE_BASE }/@me.bsky.social/my-blog`, {
					icon: { $type: 'blob', ref: cidObject, mimeType: 'image/png', size: 42 },
				} ),
			],
		} );
		const pubs = await listPublications( agent, DID );
		expect( pubs[ 0 ].icon ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafyrealcid' },
			mimeType: 'image/png',
			size: 42,
		} );
	} );

	it( 'keeps an icon already stored in the JSON ($link) shape', async () => {
		const { agent } = mockAgent( {
			'site.standard.publication': [
				pubRecord( 'a', `${ SITE_BASE }/@me.bsky.social/my-blog`, {
					icon: { $type: 'blob', ref: { $link: 'bafyjson' }, mimeType: 'image/png', size: 7 },
				} ),
			],
		} );
		const pubs = await listPublications( agent, DID );
		expect( pubs[ 0 ].icon?.ref.$link ).toBe( 'bafyjson' );
	} );
} );

describe( 'listAllPublications', () => {
	it( 'partitions owned publications from foreign ones', async () => {
		const { agent } = mockAgent( {
			'site.standard.publication': [
				pubRecord( 'a', `${ SITE_BASE }/@me.bsky.social/my-blog` ),
				pubRecord( 'b', 'https://leaflet.pub/lish/did:plc:me/xyz' ),
			],
		} );
		const { owned, foreign } = await listAllPublications( agent, DID );
		expect( owned ).toHaveLength( 1 );
		expect( owned[ 0 ] ).toMatchObject( { rkey: 'a', slug: 'my-blog' } );
		expect( foreign ).toHaveLength( 1 );
		expect( foreign[ 0 ] ).toMatchObject( {
			uri: `at://${ DID }/site.standard.publication/b`,
			name: 'Pub b',
			hostname: 'leaflet.pub',
			url: 'https://leaflet.pub/lish/did:plc:me/xyz',
		} );
	} );

	it( 'drops a slugless SkyPress-origin record from BOTH buckets', async () => {
		const { agent } = mockAgent( {
			'site.standard.publication': [ pubRecord( 'c', `${ SITE_BASE }/@me.bsky.social` ) ],
		} );
		const { owned, foreign } = await listAllPublications( agent, DID );
		expect( owned ).toHaveLength( 0 );
		expect( foreign ).toHaveLength( 0 );
	} );

	it( 'excludes records with a missing or non-http(s) url from foreign', async () => {
		const { agent } = mockAgent( {
			'site.standard.publication': [
				pubRecord( 'd', 'at://did:plc:other/site.standard.publication/d' ),
				{
					uri: `at://${ DID }/site.standard.publication/e`,
					cid: 'bafy-e',
					value: { $type: 'site.standard.publication', name: 'No URL' },
				},
			],
		} );
		const { owned, foreign } = await listAllPublications( agent, DID );
		expect( owned ).toHaveLength( 0 );
		expect( foreign ).toHaveLength( 0 );
	} );

	it( 'normalises a foreign icon to the portable $link shape', async () => {
		const cidObject = { toString: () => 'bafyforeign' };
		const { agent } = mockAgent( {
			'site.standard.publication': [
				pubRecord( 'f', 'https://leaflet.pub/lish/did:plc:me/abc', {
					icon: { $type: 'blob', ref: cidObject, mimeType: 'image/png', size: 9 },
				} ),
			],
		} );
		const { foreign } = await listAllPublications( agent, DID );
		expect( foreign[ 0 ].icon ).toEqual( {
			$type: 'blob',
			ref: { $link: 'bafyforeign' },
			mimeType: 'image/png',
			size: 9,
		} );
	} );
} );

describe( 'createPublication', () => {
	it( 'derives the slug from the name and writes the record under a fresh rkey', async () => {
		const { agent, created } = mockAgent();
		const pub = await createPublication( agent, DID, 'me.bsky.social', { name: 'My Blog' } );
		expect( pub.slug ).toBe( 'my-blog' );
		expect( created ).toHaveLength( 1 );
		expect( created[ 0 ].collection ).toBe( 'site.standard.publication' );
		expect( created[ 0 ].rkey ).toBeTruthy(); // rkey generated up front
		expect( created[ 0 ].record.url ).toBe( `${ SITE_BASE }/@me.bsky.social/my-blog` );
	} );

	it( 'de-duplicates the slug against the writer’s existing publications', async () => {
		const { agent } = mockAgent( {
			'site.standard.publication': [ pubRecord( 'a', `${ SITE_BASE }/@me.bsky.social/my-blog` ) ],
		} );
		const pub = await createPublication( agent, DID, 'me.bsky.social', { name: 'My Blog' } );
		expect( pub.slug ).toBe( 'my-blog-2' );
	} );

	it( 'falls back to pub-{rkey} for an unslugifiable name', async () => {
		const { agent, created } = mockAgent();
		const pub = await createPublication( agent, DID, 'me.bsky.social', { name: '🎉' } );
		expect( pub.slug ).toBe( `pub-${ created[ 0 ].rkey }` );
		expect( pub.slug ).toMatch( /^pub-/ );
	} );

	it( 'stores the icon blob when provided', async () => {
		const { agent, created } = mockAgent();
		const icon: BlobRefJson = {
			$type: 'blob',
			ref: { $link: 'bafyicon' },
			mimeType: 'image/png',
			size: 10,
		};
		await createPublication( agent, DID, 'me.bsky.social', { name: 'Logo Blog', icon } );
		expect( created[ 0 ].record.icon ).toEqual( icon );
	} );

	it( 'writes and returns basicTheme when provided', async () => {
		const { agent, created } = mockAgent();
		const pub = await createPublication( agent, DID, 'me.bsky.social', {
			name: 'Themed Blog',
			basicTheme: THEME_PRESETS[ 4 ].colors, // twilight
		} );
		expect( created[ 0 ].record.basicTheme ).toEqual( THEME_PRESETS[ 4 ].colors );
		expect( pub.basicTheme ).toEqual( THEME_PRESETS[ 4 ].colors );
	} );

	it( 'omits basicTheme when none is chosen', async () => {
		const { agent, created } = mockAgent();
		const pub = await createPublication( agent, DID, 'me.bsky.social', { name: 'Plain Blog' } );
		expect( 'basicTheme' in created[ 0 ].record ).toBe( false );
		expect( pub.basicTheme ).toBeUndefined();
	} );
} );

describe( 'updatePublication', () => {
	it( 'preserves the frozen slug while updating name/description', async () => {
		const { agent, put } = mockAgent();
		const existing = {
			uri: `at://${ DID }/site.standard.publication/a`,
			cid: 'bafy-a',
			rkey: 'a',
			slug: 'my-blog',
			name: 'My Blog',
		};
		const updated = await updatePublication( agent, DID, 'me.bsky.social', existing, {
			name: 'Renamed Blog',
			description: 'Now with a description',
		} );
		expect( put ).toHaveLength( 1 );
		expect( put[ 0 ].rkey ).toBe( 'a' );
		// URL (and thus slug) unchanged despite the rename.
		expect( put[ 0 ].record.url ).toBe( `${ SITE_BASE }/@me.bsky.social/my-blog` );
		expect( updated.slug ).toBe( 'my-blog' );
		expect( updated.name ).toBe( 'Renamed Blog' );
		expect( updated.description ).toBe( 'Now with a description' );
	} );

	it( 'writes and returns a newly chosen basicTheme', async () => {
		const { agent, put } = mockAgent();
		const existing = {
			uri: `at://${ DID }/site.standard.publication/a`,
			cid: 'bafy-a',
			rkey: 'a',
			slug: 'my-blog',
			name: 'My Blog',
		};
		const updated = await updatePublication( agent, DID, 'me.bsky.social', existing, {
			name: 'My Blog',
			basicTheme: THEME_PRESETS[ 1 ].colors, // noon
		} );
		expect( put[ 0 ].record.basicTheme ).toEqual( THEME_PRESETS[ 1 ].colors );
		expect( updated.basicTheme ).toEqual( THEME_PRESETS[ 1 ].colors );
	} );
} );

describe( 'toPublication basicTheme', () => {
	it( 'surfaces a valid stored basicTheme and drops a malformed one', async () => {
		const good = THEME_PRESETS[ 2 ].colors; // dusk
		const { agent } = mockAgent( {
			'site.standard.publication': [
				pubRecord( 'a', `${ SITE_BASE }/@me.bsky.social/a`, { basicTheme: good } ),
				pubRecord( 'b', `${ SITE_BASE }/@me.bsky.social/b`, {
					basicTheme: { background: { r: 999 } },
				} ),
			],
		} );
		const pubs = await listPublications( agent, DID );
		expect( pubs.find( ( p ) => p.slug === 'a' )?.basicTheme ).toEqual( good );
		expect( pubs.find( ( p ) => p.slug === 'b' )?.basicTheme ).toBeUndefined();
	} );
} );

describe( 'deletePublication', () => {
	it( 'cascades: deletes the publication’s documents, their posts, then the record', async () => {
		const pubUri = `at://${ DID }/site.standard.publication/a`;
		const { agent, deleted } = mockAgent( {
			'site.standard.document': [
				docRecord( 'd1', pubUri, {
					bskyPostRef: { uri: `at://${ DID }/app.bsky.feed.post/p1`, cid: 'c' },
				} ),
				docRecord( 'd2', pubUri ), // no companion post
				docRecord( 'd3', `at://${ DID }/site.standard.publication/other` ), // other pub → untouched
			],
		} );
		const result = await deletePublication( agent, DID, { uri: pubUri, rkey: 'a' } );
		expect( result ).toEqual( { deletedArticles: 2, deletedPosts: 1 } );

		const collectionsDeleted = deleted.map( ( d ) => `${ d.collection }/${ d.rkey }` );
		expect( collectionsDeleted ).toContain( 'site.standard.document/d1' );
		expect( collectionsDeleted ).toContain( 'site.standard.document/d2' );
		expect( collectionsDeleted ).toContain( 'app.bsky.feed.post/p1' );
		expect( collectionsDeleted ).toContain( 'site.standard.publication/a' );
		expect( collectionsDeleted ).not.toContain( 'site.standard.document/d3' );
	} );
} );
