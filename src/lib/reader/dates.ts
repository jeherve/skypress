/**
 * Format an ISO date/datetime as a long English date, e.g. "June 9, 2026".
 *
 * The reading pages are server-rendered and the UI is English, so we render a
 * fixed `en-US` long format rather than negotiating the reader's locale (which
 * would need client JS — disallowed on the read path). `timeZone: 'UTC'` pins
 * the rendered calendar day so a late-evening UTC timestamp can't roll to the
 * next day on a server in a western zone.
 */
const longDate = new Intl.DateTimeFormat( 'en-US', {
	dateStyle: 'long',
	timeZone: 'UTC',
} );

export function formatLongDate( iso: string ): string {
	return longDate.format( new Date( iso ) );
}
