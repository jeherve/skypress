/**
 * Count graphemes (user-perceived characters) the way Bluesky counts toward its
 * 300-character post limit — emoji and ZWJ clusters count as one, not as their
 * UTF-16 length or byte length.
 */
export function graphemeLength( text: string ): number {
	const segmenter = new Intl.Segmenter( undefined, { granularity: 'grapheme' } );
	let count = 0;
	for ( const _segment of segmenter.segment( text ) ) {
		count++;
	}
	return count;
}
