import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	resolveAuthorContext,
	resolvePublicationContext,
	resolveArticleContext,
} from './read-context';
import { resolveAuthor } from './identity';
import { getRecord, listRecords } from './records';
import { buildGetBlobUrl } from '../media/blob';
import { SITE_BASE } from '../publish/records';

vi.mock( './identity', () => ( { resolveAuthor: vi.fn() } ) );
vi.mock( './records', () => ( { getRecord: vi.fn(), listRecords: vi.fn() } ) );

const mockedResolveAuthor = resolveAuthor as unknown as ReturnType< typeof vi.fn >;
const mockedGetRecord = getRecord as unknown as ReturnType< typeof vi.fn >;
const mockedListRecords = listRecords as unknown as ReturnType< typeof vi.fn >;

const PDS = 'https://pds.example';
const DID = 'did:plc:me';
const HANDLE = 'me.bsky.social';
const ICON = { $type: 'blob', ref: { $link: 'bafyicon' }, mimeType: 'image/png', size: 1 };

const PUB_URI = `at://${ DID }/site.standard.publication/a`;

function pubRecord( rkey: string, url: string, extra: Record< string, unknown > = {} ) {
	return {
		uri: `at://${ DID }/site.standard.publication/${ rkey }`,
		cid: 'c',
		value: { url, name: `P${ rkey }`, ...extra },
	};
}

function docRecord( rkey: string, site: string, extra: Record< string, unknown > = {} ) {
	return {
		uri: `at://${ DID }/site.standard.document/${ rkey }`,
		cid: 'c',
		value: { title: `T${ rkey }`, site, ...extra },
	};
}

/** Default happy-path PDS: one resolvable writer, two publications, two documents. */
function wirePds( {
	publications = [
		pubRecord( 'a', `${ SITE_BASE }/@${ HANDLE }/blog`, { icon: ICON } ),
		pubRecord( 'b', `${ SITE_BASE }/@${ HANDLE }/notes` ),
		pubRecord( 'f', 'https://leaflet.pub/x/y', { name: 'Leafy' } ),
	],
	documents = [
		docRecord( 'd1', PUB_URI ),
		docRecord( 'd2', `at://${ DID }/site.standard.publication/b` ),
	],
	profile = { displayName: ' Me ', description: 'bio' } as Record< string, unknown > | null,
	article = null as ReturnType< typeof docRecord > | null,
} = {} ) {
	mockedResolveAuthor.mockResolvedValue( { did: DID, pdsUrl: PDS } );
	mockedListRecords.mockImplementation( async ( _pds, _did, collection ) =>
		collection === 'site.standard.publication' ? publications : documents
	);
	mockedGetRecord.mockImplementation( async ( _pds, _did, collection ) => {
		if ( collection === 'app.bsky.actor.profile' ) {
			return profile ? { uri: 'at://profile', cid: 'c', value: profile } : null;
		}
		return article;
	} );
}

beforeEach( () => {
	mockedResolveAuthor.mockReset();
	mockedGetRecord.mockReset();
	mockedListRecords.mockReset();
} );

describe( 'resolveAuthorContext', () => {
	it( 'maps a param without a leading @ to a generic 404', async () => {
		const result = await resolveAuthorContext( HANDLE );
		expect( result.ok ).toBe( false );
		if ( ! result.ok ) {
			expect( result.error.status ).toBe( 404 );
		}
		expect( mockedResolveAuthor ).not.toHaveBeenCalled();
	} );

	it( 'maps a missing param to a generic 404', async () => {
		const result = await resolveAuthorContext( undefined );
		expect( result.ok ).toBe( false );
	} );

	it( 'maps an unresolvable handle to writer-not-found', async () => {
		mockedResolveAuthor.mockResolvedValue( null );
		const result = await resolveAuthorContext( `@${ HANDLE }` );
		expect( result.ok ).toBe( false );
		if ( ! result.ok ) {
			expect( result.error.status ).toBe( 404 );
			expect( result.error.heading ).toContain( `@${ HANDLE }` );
		}
	} );

	it( 'degrades to an empty context when the PDS has no profile or publications', async () => {
		wirePds( { publications: [], documents: [], profile: null } );
		const result = await resolveAuthorContext( `@${ HANDLE }` );
		expect( result.ok ).toBe( true );
		if ( ! result.ok ) {
			return;
		}
		expect( result.context.publications ).toEqual( [] );
		expect( result.context.foreign ).toEqual( [] );
		expect( result.context.profile.displayName ).toBeNull();
	} );

	it( 'returns the author, profile, and publications with prebuilt logo URLs', async () => {
		wirePds();
		const result = await resolveAuthorContext( `@${ HANDLE }` );
		expect( result.ok ).toBe( true );
		if ( ! result.ok ) {
			return;
		}
		const { author, profile, publications, foreign } = result.context;
		expect( author ).toEqual( { handle: HANDLE, did: DID, pdsUrl: PDS } );
		expect( profile.displayName ).toBe( 'Me' );

		expect( publications ).toHaveLength( 2 );
		expect( publications[ 0 ] ).toMatchObject( {
			slug: 'blog',
			logoUrl: buildGetBlobUrl( PDS, DID, 'bafyicon' ),
		} );
		// No icon → no logo URL; the caller never touches blob internals.
		expect( publications[ 1 ].logoUrl ).toBeNull();

		expect( foreign ).toHaveLength( 1 );
		expect( foreign[ 0 ] ).toMatchObject( { name: 'Leafy', logoUrl: null } );
	} );
} );

describe( 'resolvePublicationContext', () => {
	it( 'maps a missing slug to a generic 404', async () => {
		wirePds();
		const result = await resolvePublicationContext( `@${ HANDLE }`, undefined );
		expect( result.ok ).toBe( false );
		if ( ! result.ok ) {
			expect( result.error.status ).toBe( 404 );
		}
	} );

	it( 'maps an unknown slug to publication-not-found', async () => {
		wirePds();
		const result = await resolvePublicationContext( `@${ HANDLE }`, 'missing' );
		expect( result.ok ).toBe( false );
		if ( ! result.ok ) {
			expect( result.error.status ).toBe( 404 );
			expect( result.error.subline ).toContain( 'missing' );
		}
	} );

	it( 'returns the publication and only its own documents, newest-first order preserved', async () => {
		wirePds();
		const result = await resolvePublicationContext( `@${ HANDLE }`, 'blog' );
		expect( result.ok ).toBe( true );
		if ( ! result.ok ) {
			return;
		}
		const { publication, documents } = result.context;
		expect( publication ).toMatchObject( {
			uri: PUB_URI,
			slug: 'blog',
			logoUrl: buildGetBlobUrl( PDS, DID, 'bafyicon' ),
		} );
		// The site-join (document.value.site === publication.uri) happens here, once.
		expect( documents ).toHaveLength( 1 );
		expect( documents[ 0 ] ).toMatchObject( { rkey: 'd1', value: { title: 'Td1' } } );
	} );
} );

describe( 'resolveArticleContext', () => {
	it( 'maps a missing rkey to a generic 404', async () => {
		wirePds();
		const result = await resolveArticleContext( `@${ HANDLE }`, 'blog', undefined );
		expect( result.ok ).toBe( false );
	} );

	it( 'maps a missing record to article-not-found', async () => {
		wirePds( { article: null } );
		const result = await resolveArticleContext( `@${ HANDLE }`, 'blog', 'gone' );
		expect( result.ok ).toBe( false );
		if ( ! result.ok ) {
			expect( result.error.status ).toBe( 404 );
			expect( result.error.subline ).toContain( 'Pa' );
		}
	} );

	it( 'rejects a document that belongs to another publication', async () => {
		// The d2 document exists but its site points at the "notes" publication.
		wirePds( { article: docRecord( 'd2', `at://${ DID }/site.standard.publication/b` ) } );
		const result = await resolveArticleContext( `@${ HANDLE }`, 'blog', 'd2' );
		expect( result.ok ).toBe( false );
		if ( ! result.ok ) {
			expect( result.error.status ).toBe( 404 );
		}
	} );

	it( 'returns the document with its publication and author profile', async () => {
		wirePds( {
			article: docRecord( 'd1', PUB_URI, { textContent: 'Hello world', publishedAt: '2026-06-01T00:00:00Z' } ),
		} );
		const result = await resolveArticleContext( `@${ HANDLE }`, 'blog', 'd1' );
		expect( result.ok ).toBe( true );
		if ( ! result.ok ) {
			return;
		}
		const { author, publication, document, profile } = result.context;
		expect( author.handle ).toBe( HANDLE );
		expect( publication.slug ).toBe( 'blog' );
		expect( profile.displayName ).toBe( 'Me' );
		expect( document ).toMatchObject( {
			rkey: 'd1',
			uri: `at://${ DID }/site.standard.document/d1`,
			value: { title: 'Td1', textContent: 'Hello world' },
		} );
	} );

	it( 'reports publication-not-found before article-not-found', async () => {
		wirePds( { article: docRecord( 'd1', PUB_URI ) } );
		const result = await resolveArticleContext( `@${ HANDLE }`, 'nope', 'd1' );
		expect( result.ok ).toBe( false );
		if ( ! result.ok ) {
			expect( result.error.subline ).toContain( 'nope' );
		}
	} );
} );
