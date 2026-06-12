import type { BlockNode } from '../blocks/render';

export interface Mention {
	did: string;
	handle: string;
	/** The visible mention text in the article (defaults to `@{handle}`). */
	displayText: string;
}

const PROFILE_RE = /^https?:\/\/bsky\.app\/profile\/([^/?#]+)/;

/**
 * Scan a block tree for `skypress/mention` anchors (`<a data-did="…">`) and return
 * the mentioned accounts, deduped by DID in first-appearance order. These anchors are
 * the single source of truth for who gets cc'd on the companion Bluesky post and for
 * the document's flat `mentions` list.
 */
export function collectMentions( blocks: BlockNode[] ): Mention[] {
	const out: Mention[] = [];
	const seen = new Set< string >();
	walk( blocks, out, seen );
	return out;
}

function walk( blocks: BlockNode[], out: Mention[], seen: Set< string > ): void {
	for ( const block of blocks ) {
		for ( const value of Object.values( block.attributes ?? {} ) ) {
			if ( typeof value === 'string' && value.includes( 'data-did' ) ) {
				extractFrom( value, out, seen );
			}
		}
		walk( block.innerBlocks ?? [], out, seen );
	}
}

function extractFrom( html: string, out: Mention[], seen: Set< string > ): void {
	const doc = new DOMParser().parseFromString( html, 'text/html' );
	for ( const anchor of Array.from( doc.querySelectorAll( 'a[data-did]' ) ) ) {
		const did = anchor.getAttribute( 'data-did' );
		if ( ! did || seen.has( did ) ) {
			continue;
		}
		const href = anchor.getAttribute( 'href' ) ?? '';
		const match = href.match( PROFILE_RE );
		const text = anchor.textContent ?? '';
		const handle = match ? match[ 1 ] : text.replace( /^@/, '' );
		seen.add( did );
		out.push( { did, handle, displayText: text || `@${ handle }` } );
	}
}
