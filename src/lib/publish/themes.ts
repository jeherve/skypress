/**
 * Publication colour themes ("sky phases"). Pure + dependency-free (no `@atproto`,
 * no `@wordpress`, no DOM) so the SSR reader can import it. Presets are derived from
 * the Twenty Twenty-Five colour style variations; each accent/accentForeground pair
 * is chosen to clear WCAG AA. Stored on `site.standard.publication.basicTheme`
 * (lexicon `site.standard.theme.basic`) — the standard field, so other readers honour it.
 * (Decision 0012.)
 */

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

export interface BasicTheme {
	$type: 'site.standard.theme.basic';
	/** content background */
	background: Rgb;
	/** content text */
	foreground: Rgb;
	/** links + button backgrounds */
	accent: Rgb;
	/** button text */
	accentForeground: Rgb;
}

export interface ThemePreset {
	slug: string;
	label: string;
	colors: BasicTheme;
}

const rgb = ( r: number, g: number, b: number ): Rgb => ( { r, g, b } );

const preset = (
	slug: string,
	label: string,
	background: Rgb,
	foreground: Rgb,
	accent: Rgb,
	accentForeground: Rgb
): ThemePreset => ( {
	slug,
	label,
	colors: { $type: 'site.standard.theme.basic', background, foreground, accent, accentForeground },
} );

/**
 * The eight sky-phase presets (Twenty Twenty-Five colour palettes). Mapping per palette:
 * `background ← base`, `foreground ← contrast`, `accent ←` the palette's signature accent,
 * `accentForeground ←` whichever of black/white clears WCAG AA on that accent.
 */
export const THEME_PRESETS: readonly ThemePreset[] = [
	preset( 'evening', 'Evening', rgb( 27, 27, 27 ), rgb( 240, 240, 240 ), rgb( 68, 35, 105 ), rgb( 255, 255, 255 ) ),
	preset( 'noon', 'Noon', rgb( 248, 247, 245 ), rgb( 25, 25, 25 ), rgb( 245, 182, 132 ), rgb( 0, 0, 0 ) ),
	preset( 'dusk', 'Dusk', rgb( 226, 226, 226 ), rgb( 59, 59, 59 ), rgb( 101, 13, 212 ), rgb( 255, 255, 255 ) ),
	preset( 'afternoon', 'Afternoon', rgb( 218, 231, 189 ), rgb( 81, 96, 40 ), rgb( 199, 246, 66 ), rgb( 0, 0, 0 ) ),
	preset( 'twilight', 'Twilight', rgb( 19, 19, 19 ), rgb( 255, 255, 255 ), rgb( 75, 82, 255 ), rgb( 255, 255, 255 ) ),
	preset( 'morning', 'Morning', rgb( 223, 220, 215 ), rgb( 25, 25, 25 ), rgb( 122, 155, 219 ), rgb( 0, 0, 0 ) ),
	preset( 'sunrise', 'Sunrise', rgb( 51, 6, 22 ), rgb( 255, 255, 255 ), rgb( 219, 154, 177 ), rgb( 0, 0, 0 ) ),
	preset( 'midnight', 'Midnight', rgb( 68, 51, 166 ), rgb( 121, 243, 177 ), rgb( 232, 183, 255 ), rgb( 0, 0, 0 ) ),
];

const isChannel = ( v: unknown ): v is number =>
	typeof v === 'number' && Number.isInteger( v ) && v >= 0 && v <= 255;

const isRgb = ( v: unknown ): v is Rgb => {
	if ( ! v || typeof v !== 'object' ) {
		return false;
	}
	const c = v as Record< string, unknown >;
	return isChannel( c.r ) && isChannel( c.g ) && isChannel( c.b );
};

/**
 * Validate a PDS-sourced value into a `BasicTheme`, or null. Untrusted input: every
 * channel must be an integer 0–255 (the renderer relies on this to emit safe `rgb()`).
 */
export function parseBasicTheme( value: unknown ): BasicTheme | null {
	if ( ! value || typeof value !== 'object' ) {
		return null;
	}
	const v = value as Record< string, unknown >;
	if (
		! isRgb( v.background ) ||
		! isRgb( v.foreground ) ||
		! isRgb( v.accent ) ||
		! isRgb( v.accentForeground )
	) {
		return null;
	}
	return {
		$type: 'site.standard.theme.basic',
		background: { r: v.background.r, g: v.background.g, b: v.background.b },
		foreground: { r: v.foreground.r, g: v.foreground.g, b: v.foreground.b },
		accent: { r: v.accent.r, g: v.accent.g, b: v.accent.b },
		accentForeground: { r: v.accentForeground.r, g: v.accentForeground.g, b: v.accentForeground.b },
	};
}

/**
 * Sentinel slug for "keep the publication's current colours" — used when a stored theme doesn't
 * match any preset (e.g. a future preset whose colours changed). Keeps the picker from silently
 * erasing a theme it can't name. Not a real preset; never written as a slug.
 */
export const CUSTOM_THEME_SLUG = 'custom';

/**
 * Resolve the picker's selection to the colours to store. `null` slug → no theme (omit);
 * the custom sentinel → keep `customTheme` verbatim; any other slug → that preset's colours.
 * Pure, so the form's submit mapping is unit-testable without rendering.
 */
export function resolveSelectedTheme(
	slug: string | null,
	customTheme: BasicTheme | null | undefined
): BasicTheme | undefined {
	if ( slug === null ) {
		return undefined;
	}
	if ( slug === CUSTOM_THEME_SLUG ) {
		return customTheme ?? undefined;
	}
	return THEME_PRESETS.find( ( preset ) => preset.slug === slug )?.colors;
}

const sameRgb = ( a: Rgb, b: Rgb ): boolean => a.r === b.r && a.g === b.g && a.b === b.b;

/** Reverse-match stored colours to a known preset (so the picker highlights it), or null. */
export function findPresetByColors( theme: BasicTheme | null | undefined ): ThemePreset | null {
	if ( ! theme ) {
		return null;
	}
	return (
		THEME_PRESETS.find(
			( p ) =>
				sameRgb( p.colors.background, theme.background ) &&
				sameRgb( p.colors.foreground, theme.foreground ) &&
				sameRgb( p.colors.accent, theme.accent ) &&
				sameRgb( p.colors.accentForeground, theme.accentForeground )
		) ?? null
	);
}

const clamp255 = ( n: number ): number => Math.max( 0, Math.min( 255, Math.round( n ) ) );

/** Linear per-channel blend: `t` of `a` over `(1 - t)` of `b`. */
const mix = ( a: Rgb, b: Rgb, t: number ): Rgb => ( {
	r: clamp255( a.r * t + b.r * ( 1 - t ) ),
	g: clamp255( a.g * t + b.g * ( 1 - t ) ),
	b: clamp255( a.b * t + b.b * ( 1 - t ) ),
} );

const css = ( { r, g, b }: Rgb ): string => `rgb(${ r }, ${ g }, ${ b })`;

/**
 * Map a `BasicTheme` to the SkyPress design tokens it overrides. Background/foreground/accent
 * families map directly; borders + muted text are deterministic blends of fg over bg so the
 * editorial hierarchy survives any palette. A publisher's palette is a fixed identity, so this
 * intentionally overrides both the light and dark `:root` defaults.
 */
export function themeToCssVars( theme: BasicTheme ): Record< string, string > {
	const { background: bg, foreground: fg, accent, accentForeground } = theme;
	return {
		'--paper': css( bg ),
		'--paper-raised': css( mix( fg, bg, 0.04 ) ),
		'--panel': css( mix( fg, bg, 0.06 ) ),
		'--ink': css( fg ),
		'--ink-soft': css( mix( fg, bg, 0.8 ) ),
		'--muted': css( mix( fg, bg, 0.55 ) ),
		'--line': css( mix( fg, bg, 0.14 ) ),
		'--line-strong': css( mix( fg, bg, 0.26 ) ),
		'--sun': css( accent ),
		'--sun-strong': css( mix( accent, fg, 0.82 ) ),
		'--sun-tint': css( mix( accent, bg, 0.2 ) ),
		'--btn-primary': css( accent ),
		'--btn-primary-hover': css( mix( accent, fg, 0.85 ) ),
		'--btn-primary-fg': css( accentForeground ),
		'--ember': css( accent ),
	};
}

/**
 * A `<style>` block overriding the design tokens for a themed publication, or '' when there is
 * no theme. Also re-points `.btn--primary` text at `--btn-primary-fg` so button text follows the
 * theme's accentForeground. All values are app-built `rgb()` strings — no record text reaches CSS.
 */
export function themeStyleBlock( theme: BasicTheme | null | undefined ): string {
	if ( ! theme ) {
		return '';
	}
	const decls = Object.entries( themeToCssVars( theme ) )
		.map( ( [ key, value ] ) => `${ key }: ${ value };` )
		.join( ' ' );
	return `<style>:root { ${ decls } } .btn--primary, .btn--primary:hover { color: var(--btn-primary-fg); }</style>`;
}
