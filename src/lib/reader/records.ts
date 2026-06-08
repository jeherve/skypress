/**
 * Read records from a PDS via the public `com.atproto.repo` XRPC (no auth needed).
 * `safeFetch` guards the (DID-doc-derived) PDS host against SSRF; failures resolve to
 * null/empty so a bad host or unreachable PDS degrades gracefully.
 */
import { safeFetch } from '../net/safe-fetch';

export interface RepoRecord< T = Record< string, unknown > > {
	uri: string;
	cid: string;
	value: T;
}

/** Fetch a single record, or null if it doesn't exist / can't be fetched. */
export async function getRecord< T = Record< string, unknown > >(
	pdsUrl: string,
	did: string,
	collection: string,
	rkey: string
): Promise< RepoRecord< T > | null > {
	const url =
		`${ pdsUrl.replace( /\/$/, '' ) }/xrpc/com.atproto.repo.getRecord` +
		`?repo=${ encodeURIComponent( did ) }` +
		`&collection=${ encodeURIComponent( collection ) }` +
		`&rkey=${ encodeURIComponent( rkey ) }`;
	try {
		const res = await safeFetch( url );
		return res.ok ? ( ( await res.json() ) as RepoRecord< T > ) : null;
	} catch {
		return null;
	}
}

/** List records in a collection (most recent first). */
export async function listRecords< T = Record< string, unknown > >(
	pdsUrl: string,
	did: string,
	collection: string,
	limit = 50
): Promise< RepoRecord< T >[] > {
	const url =
		`${ pdsUrl.replace( /\/$/, '' ) }/xrpc/com.atproto.repo.listRecords` +
		`?repo=${ encodeURIComponent( did ) }` +
		`&collection=${ encodeURIComponent( collection ) }&limit=${ limit }`;
	try {
		const res = await safeFetch( url );
		if ( ! res.ok ) {
			return [];
		}
		const data: { records?: RepoRecord< T >[] } = await res.json();
		return data.records ?? [];
	} catch {
		return [];
	}
}
