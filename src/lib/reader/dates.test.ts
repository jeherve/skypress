import { describe, expect, it } from 'vitest';
import { formatLongDate } from './dates';

describe( 'formatLongDate', () => {
	it( 'formats an ISO datetime as a long English date', () => {
		expect( formatLongDate( '2026-06-09T12:00:00Z' ) ).toBe( 'June 9, 2026' );
	} );

	it( 'pins the calendar day to UTC regardless of time-of-day', () => {
		// Late-evening UTC must not roll forward to the 10th.
		expect( formatLongDate( '2026-06-09T23:30:00Z' ) ).toBe( 'June 9, 2026' );
		// Early-morning UTC must not roll back to the 8th.
		expect( formatLongDate( '2026-06-09T00:30:00Z' ) ).toBe( 'June 9, 2026' );
	} );

	it( 'accepts a date-only string', () => {
		expect( formatLongDate( '2026-12-25' ) ).toBe( 'December 25, 2026' );
	} );
} );
