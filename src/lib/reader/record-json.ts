import { highlightJson } from './highlight';
import { sanitizeArticleHtml } from './sanitize';

/**
 * Render a PDS record value as the reader's "view JSON" markup: pretty-print →
 * syntax-highlight → sanitise, in that order. The order mirrors the article render path
 * (highlight before sanitise, sanitise last — AGENTS.md #6b): record values come from
 * arbitrary PDSes, so sanitise is the final gate before the markup reaches the client.
 */
export function renderRecordJson( value: unknown ): string {
	const json = JSON.stringify( value, null, 2 );
	return sanitizeArticleHtml( highlightJson( json ) );
}
