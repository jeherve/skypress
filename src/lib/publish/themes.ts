/**
 * Publication colour themes ("sky phases"). Pure + dependency-free (no `@atproto`,
 * no `@wordpress`, no DOM) so the SSR reader can import it. Presets are derived from
 * the Twenty Twenty-Five colour style variations; each accent/accentForeground pair
 * is chosen to clear WCAG AA. Stored on `site.standard.publication.basicTheme`
 * (lexicon `site.standard.theme.basic`) — the standard field, so other readers honour it.
 * (Decision 0012.)
 */

/**
 * The lexicon type id for an RGB colour. `site.standard.theme.basic` types each colour as a
 * UNION of `site.standard.theme.color#rgb`, and atproto requires a `$type` discriminator on every
 * union member. Omitting it makes the publication record invalid, so Bluesky's AppView can't
 * hydrate it and silently drops the enhanced standard.site link card — falling back to a bare
 * external embed (no avatar / theme / reading time). Every stored colour must carry this. */
export const COLOR_TYPE = 'site.standard.theme.color#rgb';

export interface Rgb {
	/** Union discriminator required by the lexicon; always set on stored/built colours. */
	$type?: typeof COLOR_TYPE;
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

const rgb = ( r: number, g: number, b: number ): Rgb => ( { $type: COLOR_TYPE, r, g, b } );

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
 *
 * Each stored `accent` clears WCAG AA (≥ 4.5:1) **as a link on its own `background`**, not just
 * as a button fill behind `accentForeground` — because the standard `basicTheme` record carries
 * only these four colours, and any standard.site reader maps `accent → link colour` directly
 * (Decision 0012's interop intent). Five palettes whose original accent was unreadable on its
 * background had the accent's lightness adjusted on-hue (hue + saturation preserved) until it
 * cleared 4.5:1, with `accentForeground` re-chosen as whichever of black/white clears the new
 * accent. The contrast guarantee is locked by `themes.test.ts`. (See the theme-contrast design
 * doc, 2026-06-09.)
 */
export const THEME_PRESETS: readonly ThemePreset[] = [
	preset( 'evening', 'Evening', rgb( 27, 27, 27 ), rgb( 240, 240, 240 ), rgb( 157, 111, 207 ), rgb( 0, 0, 0 ) ),
	preset( 'noon', 'Noon', rgb( 248, 247, 245 ), rgb( 25, 25, 25 ), rgb( 178, 87, 15 ), rgb( 255, 255, 255 ) ),
	preset( 'dusk', 'Dusk', rgb( 226, 226, 226 ), rgb( 59, 59, 59 ), rgb( 101, 13, 212 ), rgb( 255, 255, 255 ) ),
	preset( 'afternoon', 'Afternoon', rgb( 218, 231, 189 ), rgb( 81, 96, 40 ), rgb( 82, 108, 5 ), rgb( 255, 255, 255 ) ),
	preset( 'twilight', 'Twilight', rgb( 19, 19, 19 ), rgb( 255, 255, 255 ), rgb( 103, 109, 255 ), rgb( 0, 0, 0 ) ),
	preset( 'morning', 'Morning', rgb( 223, 220, 215 ), rgb( 25, 25, 25 ), rgb( 48, 93, 178 ), rgb( 255, 255, 255 ) ),
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
	// Re-stamp the colour union `$type` on the way out: the lexicon requires it, and PDS-sourced
	// input may omit it (e.g. records written before this was fixed). This is the single boundary
	// both the write path (buildPublicationRecord) and read path (reader) funnel through.
	return {
		$type: 'site.standard.theme.basic',
		background: { $type: COLOR_TYPE, r: v.background.r, g: v.background.g, b: v.background.b },
		foreground: { $type: COLOR_TYPE, r: v.foreground.r, g: v.foreground.g, b: v.foreground.b },
		accent: { $type: COLOR_TYPE, r: v.accent.r, g: v.accent.g, b: v.accent.b },
		accentForeground: {
			$type: COLOR_TYPE,
			r: v.accentForeground.r,
			g: v.accentForeground.g,
			b: v.accentForeground.b,
		},
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

/** WCAG relative luminance of an sRGB colour (0 = black, 1 = white). */
const relativeLuminance = ( { r, g, b }: Rgb ): number => {
	const ch = ( c: number ): number => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ( ( s + 0.055 ) / 1.055 ) ** 2.4;
	};
	return 0.2126 * ch( r ) + 0.7152 * ch( g ) + 0.0722 * ch( b );
};

/** WCAG contrast ratio between two colours (1 = identical, 21 = black vs white). */
const contrastRatio = ( a: Rgb, b: Rgb ): number => {
	const la = relativeLuminance( a ) + 0.05;
	const lb = relativeLuminance( b ) + 0.05;
	return la > lb ? la / lb : lb / la;
};

const rgbToHsl = ( { r, g, b }: Rgb ): { h: number; s: number; l: number } => {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max( rn, gn, bn );
	const min = Math.min( rn, gn, bn );
	const l = ( max + min ) / 2;
	if ( max === min ) {
		return { h: 0, s: 0, l };
	}
	const d = max - min;
	const s = l > 0.5 ? d / ( 2 - max - min ) : d / ( max + min );
	let h: number;
	switch ( max ) {
		case rn:
			h = ( gn - bn ) / d + ( gn < bn ? 6 : 0 );
			break;
		case gn:
			h = ( bn - rn ) / d + 2;
			break;
		default:
			h = ( rn - gn ) / d + 4;
	}
	return { h: h / 6, s, l };
};

const hslToRgb = ( { h, s, l }: { h: number; s: number; l: number } ): Rgb => {
	if ( s === 0 ) {
		const v = clamp255( l * 255 );
		return { r: v, g: v, b: v };
	}
	const hue2rgb = ( p: number, q: number, t: number ): number => {
		if ( t < 0 ) {
			t += 1;
		}
		if ( t > 1 ) {
			t -= 1;
		}
		if ( t < 1 / 6 ) {
			return p + ( q - p ) * 6 * t;
		}
		if ( t < 1 / 2 ) {
			return q;
		}
		if ( t < 2 / 3 ) {
			return p + ( q - p ) * ( 2 / 3 - t ) * 6;
		}
		return p;
	};
	const q = l < 0.5 ? l * ( 1 + s ) : l + s - l * s;
	const p = 2 * l - q;
	return {
		r: clamp255( hue2rgb( p, q, h + 1 / 3 ) * 255 ),
		g: clamp255( hue2rgb( p, q, h ) * 255 ),
		b: clamp255( hue2rgb( p, q, h - 1 / 3 ) * 255 ),
	};
};

/**
 * Ensure `color` clears `target` contrast against `against`, preserving hue + saturation by
 * adjusting only HSL lightness. Returns `color` untouched when it already clears the target;
 * otherwise moves its lightness toward whichever pole (black or white) raises contrast against
 * `against`, by the minimal amount that reaches `target`. Pure black/white clears ≥ 4.5:1
 * against any colour, so for the WCAG-AA targets used here this always converges.
 *
 * This guards the read path against *arbitrary* themes (the custom-theme picker path), not just
 * the curated presets — those bake in already-compliant colours, so this is a no-op for them.
 */
export function ensureContrast( color: Rgb, against: Rgb, target: number ): Rgb {
	if ( contrastRatio( color, against ) >= target ) {
		return color;
	}
	const white: Rgb = { r: 255, g: 255, b: 255 };
	const black: Rgb = { r: 0, g: 0, b: 0 };
	const poleL = contrastRatio( white, against ) >= contrastRatio( black, against ) ? 1 : 0;
	const { h, s, l } = rgbToHsl( color );
	// Contrast vs a fixed background is monotonic as lightness moves toward the better pole, so
	// binary-search the smallest move `t` in [0, 1] (l → poleL) that reaches the target.
	let lo = 0;
	let hi = 1;
	for ( let i = 0; i < 30; i++ ) {
		const mid = ( lo + hi ) / 2;
		const candidate = hslToRgb( { h, s, l: l + ( poleL - l ) * mid } );
		if ( contrastRatio( candidate, against ) >= target ) {
			hi = mid;
		} else {
			lo = mid;
		}
	}
	return hslToRgb( { h, s, l: l + ( poleL - l ) * hi } );
}

const AA = 4.5;

/**
 * Map a `BasicTheme` to the SkyPress design tokens it overrides. Surfaces (paper/panel) and
 * the body/button colours map directly; the *text* tokens are clamped to clear WCAG AA against
 * the worst-case surface they render on (`ensureContrast`), so links and secondary text stay
 * readable in every palette. Decorative hairline borders (`--line`/`--line-strong`) are
 * deliberately low-contrast (as in the base design) and exempt. A publisher's palette is a
 * fixed identity, so this intentionally overrides both the light and dark `:root` defaults.
 */
export function themeToCssVars( theme: BasicTheme ): Record< string, string > {
	const { background: bg, foreground: fg, accent, accentForeground } = theme;
	const panel = mix( fg, bg, 0.06 );
	const sunTint = mix( accent, bg, 0.2 );
	return {
		'--paper': css( bg ),
		'--paper-raised': css( mix( fg, bg, 0.04 ) ),
		'--panel': css( panel ),
		'--ink': css( fg ),
		// Secondary text: blend fg over bg for the editorial hierarchy, then clamp to AA against
		// the most fg-ward surface it sits on (`--panel`), which also covers `--paper`.
		'--ink-soft': css( ensureContrast( mix( fg, bg, 0.8 ), panel, AA ) ),
		'--muted': css( ensureContrast( mix( fg, bg, 0.55 ), panel, AA ) ),
		'--line': css( mix( fg, bg, 0.14 ) ),
		'--line-strong': css( mix( fg, bg, 0.26 ) ),
		// Accent as text (links, the editorial accent) and its hover, clamped to AA on the paper.
		'--sun': css( ensureContrast( accent, bg, AA ) ),
		'--sun-strong': css( ensureContrast( mix( accent, fg, 0.82 ), bg, AA ) ),
		'--sun-tint': css( sunTint ),
		// Button fill keeps the raw accent (already AA behind accentForeground); the hover fill is
		// clamped so accentForeground stays AA on it.
		'--btn-primary': css( accent ),
		'--btn-primary-hover': css( ensureContrast( mix( accent, fg, 0.85 ), accentForeground, AA ) ),
		'--btn-primary-fg': css( accentForeground ),
		'--ember': css( ensureContrast( accent, bg, AA ) ),
	};
}

/**
 * A `<style>` block overriding the design tokens for a themed publication, or '' when there is
 * no theme. Also re-points `.btn--primary` text at `--btn-primary-fg` so button text follows the
 * theme's accentForeground. All values are app-built `rgb()` strings — no record text reaches CSS.
 *
 * The token override targets `:root:root` (not a bare `:root`) on purpose: global.css defines the
 * light defaults on `:root` and the dark defaults on `@media (prefers-color-scheme: dark) :root`,
 * both specificity (0,1,0). Astro bundles global.css and links it into the head AFTER this injected
 * <style>, so a bare `:root` override — equal specificity, earlier in source — loses the cascade in
 * both colour schemes and the theme silently vanishes. `:root:root` (0,2,0) outranks both defaults
 * regardless of load order. (Decision 0012.)
 */
export function themeStyleBlock( theme: BasicTheme | null | undefined ): string {
	if ( ! theme ) {
		return '';
	}
	const decls = Object.entries( themeToCssVars( theme ) )
		.map( ( [ key, value ] ) => `${ key }: ${ value };` )
		.join( ' ' );
	return `<style>:root:root { ${ decls } } .btn--primary, .btn--primary:hover { color: var(--btn-primary-fg); }</style>`;
}
