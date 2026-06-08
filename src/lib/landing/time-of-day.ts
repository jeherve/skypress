/**
 * Time-of-day phases for the "First Light" landing hero (see docs/specs/sp8-brand-first-light.md).
 * The hour -> phase boundaries here are the single source of truth; the inline head
 * script in index.astro mirrors only the boundary mapping for a no-flash sky.
 */
export type PhaseKey = 'night' | 'dawn' | 'morning' | 'midday' | 'golden' | 'dusk';

export interface Phase {
	greeting: string;
	headlineHtml: string;
	lede: string;
}

export const PHASE_ORDER: PhaseKey[] = [ 'night', 'dawn', 'morning', 'midday', 'golden', 'dusk' ];

export const PHASES: Record< PhaseKey, Phase > = {
	night: {
		greeting: 'Burning the midnight oil',
		headlineHtml: 'Write while the <em>world sleeps.</em>',
		lede: 'A calm, block-based studio for long-form on the open social web.',
	},
	dawn: {
		greeting: 'Up before the birds',
		headlineHtml: 'Catch the <em>first light.</em>',
		lede: 'A calm, block-based studio for long-form on the open social web.',
	},
	morning: {
		greeting: 'Good morning',
		headlineHtml: 'Start the day on the <em>page.</em>',
		lede: 'A calm, block-based studio for long-form on the open social web.',
	},
	midday: {
		greeting: 'Good afternoon',
		headlineHtml: 'Write things <em>worth keeping.</em>',
		lede: 'A calm, block-based studio for long-form on the open social web.',
	},
	golden: {
		greeting: 'Golden hour',
		headlineHtml: 'Write before the <em>light goes.</em>',
		lede: 'A calm, block-based studio for long-form on the open social web.',
	},
	dusk: {
		greeting: 'Good evening',
		headlineHtml: 'End the day with <em>your words.</em>',
		lede: 'A calm, block-based studio for long-form on the open social web.',
	},
};

/** The static phase rendered server-side (no-JS / pre-paint default). */
export const DEFAULT_PHASE: PhaseKey = 'golden';

export function phaseForHour( hour: number ): PhaseKey {
	if ( ! Number.isFinite( hour ) || hour < 0 || hour > 23 ) {
		return 'night';
	}
	if ( hour >= 21 || hour < 5 ) {
		return 'night';
	}
	if ( hour < 7 ) {
		return 'dawn';
	}
	if ( hour < 10 ) {
		return 'morning';
	}
	if ( hour < 16 ) {
		return 'midday';
	}
	if ( hour < 19 ) {
		return 'golden';
	}
	return 'dusk';
}
