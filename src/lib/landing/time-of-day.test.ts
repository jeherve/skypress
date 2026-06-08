import { describe, expect, it } from 'vitest';
import { phaseForHour, PHASES, PHASE_ORDER, type PhaseKey } from './time-of-day';

describe( 'phaseForHour', () => {
	it( 'maps hours to the six phases at the right boundaries', () => {
		expect( phaseForHour( 0 ) ).toBe( 'night' );
		expect( phaseForHour( 4 ) ).toBe( 'night' );
		expect( phaseForHour( 5 ) ).toBe( 'dawn' );
		expect( phaseForHour( 6 ) ).toBe( 'dawn' );
		expect( phaseForHour( 7 ) ).toBe( 'morning' );
		expect( phaseForHour( 9 ) ).toBe( 'morning' );
		expect( phaseForHour( 10 ) ).toBe( 'midday' );
		expect( phaseForHour( 15 ) ).toBe( 'midday' );
		expect( phaseForHour( 16 ) ).toBe( 'golden' );
		expect( phaseForHour( 18 ) ).toBe( 'golden' );
		expect( phaseForHour( 19 ) ).toBe( 'dusk' );
		expect( phaseForHour( 20 ) ).toBe( 'dusk' );
		expect( phaseForHour( 21 ) ).toBe( 'night' );
		expect( phaseForHour( 23 ) ).toBe( 'night' );
	} );

	it( 'clamps out-of-range hours into night', () => {
		expect( phaseForHour( -1 ) ).toBe( 'night' );
		expect( phaseForHour( 24 ) ).toBe( 'night' );
	} );

	it( 'defines copy for every phase, and the order lists all six', () => {
		expect( PHASE_ORDER ).toHaveLength( 6 );
		for ( const key of PHASE_ORDER ) {
			const p = PHASES[ key as PhaseKey ];
			expect( p.greeting.length ).toBeGreaterThan( 0 );
			expect( p.headlineHtml ).toContain( '<em>' );
			expect( p.lede.length ).toBeGreaterThan( 0 );
		}
	} );
} );
