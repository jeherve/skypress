/**
 * Build the list of AT Tags <meta> tags for a page.
 *
 * AT Tags (https://tangled.org/chrisshank.com/at-tags/) map a web page back to the
 * AT Protocol records it was rendered from. They sit ALONGSIDE — never instead of —
 * the existing `<link rel="site.standard.*">` tags (Decision 0025).
 *
 * Pure and dependency-free, mirroring buildMetaTags next door, so it is unit-testable
 * and safe to call from the read path (which must not pull in browser-only deps).
 * Repeated tag names are the proposal's array semantics, not a bug.
 */
export interface AtTagsInput {
	/** Records the page depends on — delete them and the page is meaningless. */
	canonical?: string[];
	/** Auxiliary records the page displays — remove them and the page still stands. */
	alternate?: string[];
	/** DIDs of the identities that authored the page. Emitted as DID-only AT URIs. */
	authorDids?: string[];
	/** DID owning this section of the site. Emitted as a DID-only AT URI. */
	meDid?: string;
}

export interface AtTag {
	name: string;
	content: string;
}

/**
 * Record URIs reach us from arbitrary PDSes. Astro escapes attribute values, so a
 * malformed one can't inject — but it shouldn't become a junk tag either.
 */
function atUris( values: string[] | undefined ): string[] {
	return ( values ?? [] ).filter( ( value ) => value?.startsWith( 'at://' ) );
}

/** Bare DIDs in, DID-only AT URIs out; anything that isn't a DID is dropped. */
function didUris( values: ( string | undefined )[] ): string[] {
	return values
		.filter( ( value ): value is string => Boolean( value?.startsWith( 'did:' ) ) )
		.map( ( did ) => `at://${ did }` );
}

export function buildAtTags( input: AtTagsInput ): AtTag[] {
	const { canonical, alternate, authorDids, meDid } = input;
	const tags: AtTag[] = [];

	for ( const uri of atUris( canonical ) ) {
		tags.push( { name: 'at:canonical', content: uri } );
	}
	for ( const uri of atUris( alternate ) ) {
		tags.push( { name: 'at:alternate', content: uri } );
	}
	for ( const uri of didUris( authorDids ?? [] ) ) {
		tags.push( { name: 'at:author', content: uri } );
	}
	for ( const uri of didUris( [ meDid ] ) ) {
		tags.push( { name: 'at:me', content: uri } );
	}

	return tags;
}
