import type { Mention } from './mentions';

/** A richtext facet over a UTF-8 byte range of the post text. */
export interface PostFacet {
	$type: 'app.bsky.richtext.facet';
	index: { byteStart: number; byteEnd: number };
	features: Array<
		| { $type: 'app.bsky.richtext.facet#link'; uri: string }
		| { $type: 'app.bsky.richtext.facet#mention'; did: string }
	>;
}

const SEP = '\n\n';

function utf8ByteLength( value: string ): number {
	return new TextEncoder().encode( value ).length;
}

/**
 * Build the companion Bluesky post's `text` and `facets`. The body is
 * `title \n\n {lede?} \n\n cc @a @b \n\n {url}`, with the lede omitted when blank and the
 * cc line omitted when there are no mentions. Byte offsets are computed during assembly so
 * the link and mention facets always line up with the final UTF-8 string.
 */
export function assemblePostText( input: {
	title: string;
	articleUrl: string;
	bodyLede?: string;
	mentions?: Mention[];
} ): { text: string; facets: PostFacet[] } {
	const mentions = input.mentions ?? [];
	const lede = input.bodyLede?.trim() ?? '';
	const ccLine = mentions.length
		? `cc ${ mentions.map( ( m ) => `@${ m.handle }` ).join( ' ' ) }`
		: '';

	const segments: string[] = [ input.title ];
	if ( lede ) {
		segments.push( lede );
	}
	if ( ccLine ) {
		segments.push( ccLine );
	}
	segments.push( input.articleUrl );

	const text = segments.join( SEP );

	// Byte start of each segment in the joined string.
	const segByteStart: number[] = [];
	let cursor = 0;
	segments.forEach( ( segment, i ) => {
		if ( i > 0 ) {
			cursor += utf8ByteLength( SEP );
		}
		segByteStart[ i ] = cursor;
		cursor += utf8ByteLength( segment );
	} );

	const facets: PostFacet[] = [];

	// Mention facets (each @handle inside the cc line).
	if ( ccLine ) {
		// The cc line, when present, is always the second-to-last segment (before the URL).
		const ccIndex = segments.length - 2;
		let local = utf8ByteLength( 'cc ' );
		mentions.forEach( ( mention, i ) => {
			if ( i > 0 ) {
				local += utf8ByteLength( ' ' );
			}
			const token = `@${ mention.handle }`;
			const byteStart = segByteStart[ ccIndex ] + local;
			facets.push( {
				$type: 'app.bsky.richtext.facet',
				index: { byteStart, byteEnd: byteStart + utf8ByteLength( token ) },
				features: [ { $type: 'app.bsky.richtext.facet#mention', did: mention.did } ],
			} );
			local += utf8ByteLength( token );
		} );
	}

	// Link facet (the article URL, always the last segment).
	const urlIndex = segments.length - 1;
	const urlStart = segByteStart[ urlIndex ];
	facets.push( {
		$type: 'app.bsky.richtext.facet',
		index: { byteStart: urlStart, byteEnd: urlStart + utf8ByteLength( input.articleUrl ) },
		features: [ { $type: 'app.bsky.richtext.facet#link', uri: input.articleUrl } ],
	} );

	return { text, facets };
}
