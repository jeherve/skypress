import { describe, it, expect } from 'vitest';
import {
	THEME_PRESETS,
	parseBasicTheme,
	findPresetByColors,
	themeToCssVars,
	themeStyleBlock,
	type BasicTheme,
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

describe( 'parseBasicTheme', () => {
	it( 'accepts a valid theme and stamps $type', () => {
		const parsed = parseBasicTheme( THEME_PRESETS[ 0 ].colors );
		expect( parsed ).not.toBeNull();
		expect( parsed!.$type ).toBe( 'site.standard.theme.basic' );
		expect( parsed!.accent ).toEqual( THEME_PRESETS[ 0 ].colors.accent );
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
} );

describe( 'themeToCssVars', () => {
	const vars = themeToCssVars( THEME_PRESETS[ 0 ].colors ); // evening

	it( 'maps the core tokens to rgb() strings', () => {
		expect( vars[ '--paper' ] ).toBe( 'rgb(27, 27, 27)' );
		expect( vars[ '--ink' ] ).toBe( 'rgb(240, 240, 240)' );
		expect( vars[ '--sun' ] ).toBe( 'rgb(68, 35, 105)' );
		expect( vars[ '--btn-primary' ] ).toBe( 'rgb(68, 35, 105)' );
		expect( vars[ '--btn-primary-fg' ] ).toBe( 'rgb(255, 255, 255)' );
	} );

	it( 'derives intermediate tokens as in-range rgb() strings', () => {
		for ( const key of [ '--muted', '--line', '--line-strong', '--sun-tint', '--btn-primary-hover' ] ) {
			expect( vars[ key ] ).toMatch( /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/ );
		}
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

	it( 'never emits anything but digits/commas inside rgb() (no injection surface)', () => {
		const html = themeStyleBlock( THEME_PRESETS[ 2 ].colors );
		const matches = html.match( /rgb\([^)]*\)/g ) ?? [];
		expect( matches.length ).toBeGreaterThan( 0 );
		for ( const m of matches ) {
			expect( m ).toMatch( /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/ );
		}
	} );
} );
