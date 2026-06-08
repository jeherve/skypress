/**
 * Splits a lexicon description into plain-text and inline-code segments.
 *
 * Schema descriptions (from the lexicon JSON) use Markdown-style `code` spans. Astro
 * outputs interpolated strings as plain text, so the backticks would otherwise render
 * literally. The page maps these segments to `<code>` for code parts and bare text for
 * the rest; Astro escapes the text nodes, so no raw HTML is injected on the read path.
 */
export interface DescSegment {
	text: string;
	code: boolean;
}

export function parseInlineCode( text: string ): DescSegment[] {
	const segments: DescSegment[] = [];
	const span = /`([^`]+)`/g;
	let last = 0;
	let match: RegExpExecArray | null;

	while ( ( match = span.exec( text ) ) !== null ) {
		if ( match.index > last ) {
			segments.push( { text: text.slice( last, match.index ), code: false } );
		}
		segments.push( { text: match[ 1 ], code: true } );
		last = match.index + match[ 0 ].length;
	}

	if ( last < text.length ) {
		segments.push( { text: text.slice( last ), code: false } );
	}

	return segments;
}
