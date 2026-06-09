import { describe, it, expect } from 'vitest';
import {
	THEME_PRESETS,
	parseBasicTheme,
	findPresetByColors,
	themeToCssVars,
	themeStyleBlock,
	resolveSelectedTheme,
	ensureContrast,
	CUSTOM_THEME_SLUG,
	type BasicTheme,
	type Rgb,
} from './themes';

const luminance = ( { r, g, b }: { r: number; g: number; b: number } ) => {
	const ch = ( c: number ) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ( ( s + 0.055 ) / 1.055 ) ** 2.4;
	};
	return 0.2126 * ch( r ) + 0.7152 * ch( g ) + 0.0722 * ch( b );
};
const ratio = ( a: BasicTheme[ 'background' ], b: BasicTheme[ 'background' ] ) => {
	const la = luminance( a ) + 0.05;
	const lb = luminance( b ) + 0.05;
	return la > lb ? la / lb : lb / la;
};

/** Parse an app-built `rgb(r, g, b)` token back into an Rgb (the form themeToCssVars emits). */
const parseRgb = ( value: string ): Rgb => {
	const m = value.match( /^rgb\((\d{1,3}), (\d{1,3}), (\d{1,3})\)$/ );
	if ( ! m ) {
		throw new Error( `not an rgb() token: ${ value }` );
	}
	return { r: Number( m[ 1 ] ), g: Number( m[ 2 ] ), b: Number( m[ 3 ] ) };
};

describe( 'THEME_PRESETS', () => {
	it( 'ships the 8 sky phases with unique slugs', () => {
		expect( THEME_PRESETS ).toHaveLength( 8 );
		expect( THEME_PRESETS.map( ( p ) => p.slug ) ).toEqual( [
			'evening',
			'noon',
			'dusk',
			'afternoon',
			'twilight',
			'morning',
			'sunrise',
			'midnight',
		] );
		expect( new Set( THEME_PRESETS.map( ( p ) => p.slug ) ).size ).toBe( 8 );
	} );

	it( 'every preset clears WCAG AA for body text and button text', () => {
		for ( const preset of THEME_PRESETS ) {
			const { background, foreground, accent, accentForeground } = preset.colors;
			expect( ratio( background, foreground ) ).toBeGreaterThanOrEqual( 4.5 );
			expect( ratio( accent, accentForeground ) ).toBeGreaterThanOrEqual( 4.5 );
		}
	} );

	it( 'every preset colour carries the site.standard.theme.color#rgb union $type', () => {
		// `site.standard.theme.basic` types each colour as a union of `site.standard.theme.color#rgb`,
		// and atproto requires a `$type` discriminator on union members. Without it the publication
		// record is invalid and Bluesky's AppView can't hydrate the enhanced standard.site link card.
		for ( const preset of THEME_PRESETS ) {
			for ( const color of [
				preset.colors.background,
				preset.colors.foreground,
				preset.colors.accent,
				preset.colors.accentForeground,
			] ) {
				expect( color.$type ).toBe( 'site.standard.theme.color#rgb' );
			}
		}
	} );

	it( 'every preset color channel is an integer 0–255', () => {
		for ( const preset of THEME_PRESETS ) {
			for ( const color of [
				preset.colors.background,
				preset.colors.foreground,
				preset.colors.accent,
				preset.colors.accentForeground,
			] ) {
				for ( const channel of [ color.r, color.g, color.b ] ) {
					expect( Number.isInteger( channel ) ).toBe( true );
					expect( channel ).toBeGreaterThanOrEqual( 0 );
					expect( channel ).toBeLessThanOrEqual( 255 );
				}
			}
		}
	} );
} );

describe( 'theme contrast audit (every text pairing the themed reader renders)', () => {
	// The themed reader consumes these tokens by name. Each row is a real on-screen pairing,
	// with the WCAG threshold for how that pairing is rendered (normal text 4.5:1; the
	// avatar/publication-logo fallback is large bold display text → 3:1). `against` is the
	// worst-case surface the token sits on. Decorative hairline borders (`--line`/
	// `--line-strong`) are intentionally omitted — they are not text and not required to
	// identify a component, so WCAG exempts them (the base design ships them at ~1.2:1 too).
	const pairings: ReadonlyArray< {
		label: string;
		fg: keyof ReturnType< typeof themeToCssVars > | 'accentForeground';
		bg: keyof ReturnType< typeof themeToCssVars >;
		min: number;
	} > = [
		{ label: 'link text', fg: '--sun', bg: '--paper', min: 4.5 },
		{ label: 'link hover text', fg: '--sun-strong', bg: '--paper', min: 4.5 },
		{ label: 'muted secondary text', fg: '--muted', bg: '--panel', min: 4.5 },
		{ label: 'ink-soft secondary text', fg: '--ink-soft', bg: '--panel', min: 4.5 },
		{ label: 'button text', fg: '--btn-primary-fg', bg: '--btn-primary', min: 4.5 },
		{ label: 'button hover text', fg: '--btn-primary-fg', bg: '--btn-primary-hover', min: 4.5 },
		{ label: 'avatar/logo large display text', fg: '--sun', bg: '--sun-tint', min: 3 },
	];

	for ( const preset of THEME_PRESETS ) {
		describe( preset.slug, () => {
			const vars = themeToCssVars( preset.colors );
			for ( const { label, fg, bg, min } of pairings ) {
				it( `clears WCAG for ${ label } (≥ ${ min }:1)`, () => {
					const fgRgb = parseRgb( vars[ fg ] );
					const bgRgb = parseRgb( vars[ bg ] );
					expect( ratio( fgRgb, bgRgb ) ).toBeGreaterThanOrEqual( min );
				} );
			}
		} );
	}
} );

describe( 'preset stored colours (interop: the record itself must be accessible)', () => {
	// The five themes whose accent was unreadable on its background were re-tuned (accent
	// lightness adjusted on-hue; accentForeground re-chosen). Lock the stored values so a
	// future edit that reintroduces an inaccessible accent fails here, and so the three
	// already-compliant presets stay byte-identical.
	it( 'every preset accent clears WCAG AA as a link on its own background (≥ 4.5:1)', () => {
		for ( const preset of THEME_PRESETS ) {
			const { background, accent } = preset.colors;
			expect( ratio( accent, background ) ).toBeGreaterThanOrEqual( 4.5 );
		}
	} );

	it( 'leaves the already-compliant presets (dusk, sunrise, midnight) unchanged', () => {
		const bySlug = ( slug: string ) => THEME_PRESETS.find( ( p ) => p.slug === slug )!.colors;
		expect( bySlug( 'dusk' ).accent ).toMatchObject( { r: 101, g: 13, b: 212 } );
		expect( bySlug( 'sunrise' ).accent ).toMatchObject( { r: 219, g: 154, b: 177 } );
		expect( bySlug( 'midnight' ).accent ).toMatchObject( { r: 232, g: 183, b: 255 } );
	} );
} );

describe( 'ensureContrast', () => {
	const black: Rgb = { r: 0, g: 0, b: 0 };
	const white: Rgb = { r: 255, g: 255, b: 255 };

	it( 'returns the colour untouched when it already meets the target', () => {
		// Black on white is ~21:1 — already way past 4.5.
		expect( ensureContrast( black, white, 4.5 ) ).toEqual( black );
	} );

	it( 'adjusts a too-light colour on a light background until it clears the target', () => {
		const bg: Rgb = { r: 248, g: 247, b: 245 };
		const start: Rgb = { r: 245, g: 182, b: 132 }; // peach, ~1.65:1 on bg
		expect( ratio( start, bg ) ).toBeLessThan( 4.5 );
		const fixed = ensureContrast( start, bg, 4.5 );
		expect( ratio( fixed, bg ) ).toBeGreaterThanOrEqual( 4.5 );
	} );

	it( 'adjusts a too-dark colour on a dark background until it clears the target', () => {
		const bg: Rgb = { r: 27, g: 27, b: 27 };
		const start: Rgb = { r: 68, g: 35, b: 105 }; // dark purple, ~1.39:1 on bg
		expect( ratio( start, bg ) ).toBeLessThan( 4.5 );
		const fixed = ensureContrast( start, bg, 4.5 );
		expect( ratio( fixed, bg ) ).toBeGreaterThanOrEqual( 4.5 );
	} );

	it( 'preserves hue while adjusting (a blue stays blue-dominant)', () => {
		const bg: Rgb = { r: 19, g: 19, b: 19 };
		const start: Rgb = { r: 75, g: 82, b: 255 };
		const fixed = ensureContrast( start, bg, 4.5 );
		expect( fixed.b ).toBeGreaterThan( fixed.r );
		expect( fixed.b ).toBeGreaterThan( fixed.g );
	} );
} );

describe( 'parseBasicTheme', () => {
	it( 'accepts a valid theme and stamps $type', () => {
		const parsed = parseBasicTheme( THEME_PRESETS[ 0 ].colors );
		expect( parsed ).not.toBeNull();
		expect( parsed!.$type ).toBe( 'site.standard.theme.basic' );
		expect( parsed!.accent ).toEqual( THEME_PRESETS[ 0 ].colors.accent );
	} );

	it( 'stamps the union $type discriminator on every colour (lexicon requires it)', () => {
		const parsed = parseBasicTheme( THEME_PRESETS[ 0 ].colors )!;
		for ( const color of [ parsed.background, parsed.foreground, parsed.accent, parsed.accentForeground ] ) {
			expect( color.$type ).toBe( 'site.standard.theme.color#rgb' );
		}
	} );

	it( 'rejects undefined, non-objects, and out-of-range / non-integer channels', () => {
		expect( parseBasicTheme( undefined ) ).toBeNull();
		expect( parseBasicTheme( 'nope' ) ).toBeNull();
		expect( parseBasicTheme( { background: { r: 0, g: 0, b: 0 } } ) ).toBeNull();
		expect(
			parseBasicTheme( {
				background: { r: 300, g: 0, b: 0 },
				foreground: { r: 0, g: 0, b: 0 },
				accent: { r: 0, g: 0, b: 0 },
				accentForeground: { r: 0, g: 0, b: 0 },
			} )
		).toBeNull();
		expect(
			parseBasicTheme( {
				background: { r: 1.5, g: 0, b: 0 },
				foreground: { r: 0, g: 0, b: 0 },
				accent: { r: 0, g: 0, b: 0 },
				accentForeground: { r: 0, g: 0, b: 0 },
			} )
		).toBeNull();
	} );
} );

describe( 'findPresetByColors', () => {
	it( 'reverse-matches stored colours to a preset', () => {
		const preset = findPresetByColors( THEME_PRESETS[ 3 ].colors );
		expect( preset?.slug ).toBe( 'afternoon' );
	} );

	it( 'returns null for none/custom colours', () => {
		expect( findPresetByColors( null ) ).toBeNull();
		expect( findPresetByColors( undefined ) ).toBeNull();
		expect(
			findPresetByColors( {
				$type: 'site.standard.theme.basic',
				background: { r: 1, g: 2, b: 3 },
				foreground: { r: 4, g: 5, b: 6 },
				accent: { r: 7, g: 8, b: 9 },
				accentForeground: { r: 10, g: 11, b: 12 },
			} )
		).toBeNull();
	} );

	it( 'round-trips a parsed theme back to its preset (the edit-prefill path)', () => {
		// Production prefill reads `existing.basicTheme`, which came through parseBasicTheme.
		const parsed = parseBasicTheme( THEME_PRESETS[ 6 ].colors ); // sunrise
		expect( findPresetByColors( parsed )?.slug ).toBe( 'sunrise' );
	} );
} );

describe( 'resolveSelectedTheme', () => {
	const custom: BasicTheme = {
		$type: 'site.standard.theme.basic',
		background: { r: 1, g: 2, b: 3 },
		foreground: { r: 4, g: 5, b: 6 },
		accent: { r: 7, g: 8, b: 9 },
		accentForeground: { r: 10, g: 11, b: 12 },
	};

	it( 'maps null to undefined (no theme)', () => {
		expect( resolveSelectedTheme( null, null ) ).toBeUndefined();
		expect( resolveSelectedTheme( null, custom ) ).toBeUndefined();
	} );

	it( 'maps a preset slug to that preset’s colours', () => {
		expect( resolveSelectedTheme( 'dusk', null ) ).toEqual( THEME_PRESETS[ 2 ].colors );
	} );

	it( 'keeps the custom theme verbatim for the custom sentinel', () => {
		expect( resolveSelectedTheme( CUSTOM_THEME_SLUG, custom ) ).toEqual( custom );
		// No custom theme to keep → no theme rather than a dangling sentinel.
		expect( resolveSelectedTheme( CUSTOM_THEME_SLUG, null ) ).toBeUndefined();
	} );

	it( 'maps an unknown slug to undefined (preset removed) rather than crashing', () => {
		expect( resolveSelectedTheme( 'no-such-preset', null ) ).toBeUndefined();
	} );
} );

describe( 'themeToCssVars', () => {
	const vars = themeToCssVars( THEME_PRESETS[ 0 ].colors ); // evening

	it( 'maps the core tokens to rgb() strings', () => {
		expect( vars[ '--paper' ] ).toBe( 'rgb(27, 27, 27)' );
		expect( vars[ '--ink' ] ).toBe( 'rgb(240, 240, 240)' );
		// evening's accent is already AA on its dark background, so --sun is the raw accent.
		expect( vars[ '--sun' ] ).toBe( 'rgb(157, 111, 207)' );
		expect( vars[ '--btn-primary' ] ).toBe( 'rgb(157, 111, 207)' );
		expect( vars[ '--btn-primary-fg' ] ).toBe( 'rgb(0, 0, 0)' );
	} );

	it( 'derives intermediate tokens as in-range rgb() strings', () => {
		for ( const key of [ '--muted', '--line', '--line-strong', '--sun-tint', '--btn-primary-hover' ] ) {
			expect( vars[ key ] ).toMatch( /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/ );
		}
	} );

	it( 'blends muted as foreground OVER background (direction locked)', () => {
		// evening: bg 27, fg 240 → mix(fg, bg, 0.55) = round(240*.55 + 27*.45) = round(144.15) = 144.
		// If the blend direction inverted (bg over fg) this would be ~123 — caught here.
		expect( vars[ '--muted' ] ).toBe( 'rgb(144, 144, 144)' );
	} );

	it( 'carries accentForeground into --btn-primary-fg', () => {
		const sunrise = themeToCssVars( THEME_PRESETS[ 6 ].colors ); // accentForeground = black
		expect( sunrise[ '--btn-primary-fg' ] ).toBe( 'rgb(0, 0, 0)' );
	} );
} );

describe( 'themeStyleBlock', () => {
	it( 'returns a :root override style tag for a theme', () => {
		const html = themeStyleBlock( THEME_PRESETS[ 1 ].colors ); // noon
		expect( html ).toContain( '<style>' );
		expect( html ).toContain( ':root' );
		expect( html ).toContain( '--paper: rgb(248, 247, 245)' );
		expect( html ).toContain( '.btn--primary' );
	} );

	it( 'returns an empty string when there is no theme', () => {
		expect( themeStyleBlock( null ) ).toBe( '' );
		expect( themeStyleBlock( undefined ) ).toBe( '' );
	} );

	it( 'outranks the global :root defaults so the theme wins regardless of load order', () => {
		// The light + dark design tokens live on `:root` in global.css, which Astro bundles and
		// links into the head AFTER the page's injected <style>. A bare `:root` override has
		// identical specificity (0,1,0), so the cascade falls to source order — and the later
		// global.css wins, silently dropping the publication theme in BOTH colour schemes
		// (verified on production; Decision 0012). The override must therefore outrank a single
		// `:root`: `:root:root` (0,2,0) beats both the plain and the
		// `@media (prefers-color-scheme: dark) :root` defaults (0,1,0) in any order.
		const html = themeStyleBlock( THEME_PRESETS[ 4 ].colors ); // twilight
		expect( html ).toMatch( /<style>:root:root\s*\{/ );
	} );

	it( 'never emits anything but digits/commas inside rgb() (no injection surface)', () => {
		const html = themeStyleBlock( THEME_PRESETS[ 2 ].colors );
		const matches = html.match( /rgb\([^)]*\)/g ) ?? [];
		expect( matches.length ).toBeGreaterThan( 0 );
		for ( const m of matches ) {
			expect( m ).toMatch( /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/ );
		}
	} );
} );
