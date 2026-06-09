/**
 * A brief plain-text excerpt for a document/card description (the og:description fallback).
 * Collapses runs of whitespace to single spaces, cuts on a word boundary at or before
 * `maxChars`, and appends an ellipsis when it had to truncate. Returns '' for empty or
 * whitespace-only input. Pure + dependency-free (no `@wordpress/*`, no network) so it is
 * safe in BOTH the server reader and the browser publisher (AGENTS.md §3).
 */
export function deriveExcerpt( text: string, maxChars = 200 ): string {
	const normalized = text.replace( /\s+/g, ' ' ).trim();
	if ( normalized.length <= maxChars ) {
		return normalized;
	}
	const slice = normalized.slice( 0, maxChars );
	const lastSpace = slice.lastIndexOf( ' ' );
	const cut = lastSpace > 0 ? slice.slice( 0, lastSpace ) : slice;
	return `${ cut.trimEnd() }…`;
}
