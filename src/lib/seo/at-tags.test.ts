import { describe, expect, it } from 'vitest';
import { buildAtTags, type AtTag } from './at-tags';

const DID = 'did:plc:writer';
const DOC = `at://${ DID }/site.standard.document/3ldoc`;
const PUB = `at://${ DID }/site.standard.publication/3lpub`;
const POST = `at://${ DID }/app.bsky.feed.post/3lpost`;

/** All contents emitted under one tag name, in emission order. */
const named = ( tags: AtTag[], name: string ) =>
	tags.filter( ( tag ) => tag.name === name ).map( ( tag ) => tag.content );

describe( 'buildAtTags', () => {
	it( 'emits each tag name from a full input', () => {
		const tags = buildAtTags( {
			canonical: [ DOC ],
			alternate: [ PUB, POST ],
			authorDids: [ DID ],
			meDid: DID,
		} );
		expect( named( tags, 'at:canonical' ) ).toEqual( [ DOC ] );
		expect( named( tags, 'at:alternate' ) ).toEqual( [ PUB, POST ] );
		expect( named( tags, 'at:author' ) ).toEqual( [ `at://${ DID }` ] );
		expect( named( tags, 'at:me' ) ).toEqual( [ `at://${ DID }` ] );
	} );

	it( 'repeats a name once per URI, preserving input order (array semantics)', () => {
		const tags = buildAtTags( { canonical: [ DOC, PUB ] } );
		expect( tags ).toEqual( [
			{ name: 'at:canonical', content: DOC },
			{ name: 'at:canonical', content: PUB },
		] );
	} );

	it( 'emits nothing for an empty input', () => {
		expect( buildAtTags( {} ) ).toEqual( [] );
	} );

	it( 'ignores empty arrays and empty strings', () => {
		const tags = buildAtTags( {
			canonical: [],
			alternate: [ '' ],
			authorDids: [ '' ],
			meDid: '',
		} );
		expect( tags ).toEqual( [] );
	} );

	it( 'drops record values that are not at:// URIs', () => {
		// Record URIs come back from arbitrary PDSes; a malformed one must not
		// become a junk at:canonical.
		const tags = buildAtTags( {
			canonical: [ 'https://example.com/hijack', DOC ],
			alternate: [ 'javascript:alert(1)' ],
		} );
		expect( named( tags, 'at:canonical' ) ).toEqual( [ DOC ] );
		expect( named( tags, 'at:alternate' ) ).toEqual( [] );
	} );

	it( 'drops author and me values that are not DIDs, and emits the rest as DID-only URIs', () => {
		const tags = buildAtTags( {
			authorDids: [ 'alice.test', DID ],
			meDid: 'not-a-did',
		} );
		expect( named( tags, 'at:author' ) ).toEqual( [ `at://${ DID }` ] );
		expect( named( tags, 'at:me' ) ).toEqual( [] );
	} );

	it( 'orders tags canonical → alternate → author → me', () => {
		const tags = buildAtTags( {
			meDid: DID,
			authorDids: [ DID ],
			alternate: [ PUB ],
			canonical: [ DOC ],
		} );
		expect( tags.map( ( tag ) => tag.name ) ).toEqual( [
			'at:canonical',
			'at:alternate',
			'at:author',
			'at:me',
		] );
	} );
} );
