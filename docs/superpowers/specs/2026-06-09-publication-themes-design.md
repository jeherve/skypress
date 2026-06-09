# Publication theme presets ("sky phases")

**Date:** 2026-06-09
**Status:** Approved (brainstorm) — ready for plan
**Area:** publication system (SP10), reader/renderer (SP4/SP7), brand (SP6)

## Summary

Let a publisher pick a colour theme for their publication from a small set of
curated **sky-phase** presets. The chosen palette is stored on the publication
record using the standard.site `basicTheme` field, surfaces on publication
creation and in publication settings, and is applied when the publication and
its articles are rendered publicly. Default is **no theme** (today's SkyPress
look, unchanged).

## Motivation

standard.site's `site.standard.publication` lexicon defines an optional
`basicTheme` (a `site.standard.theme.basic` object) so a publication can carry a
visual identity that any standard.site reader can honour. SkyPress does not use
it yet. Adding it lets publishers personalise their space, and — because we
store the *standard* field rather than a SkyPress-private one — other readers
(Leaflet, etc.) honour the same colours.

The Twenty Twenty-Five theme's colour style variations are named after times of
day (evening, noon, dusk, afternoon, twilight, morning, sunrise, midnight). That
is a direct fit for SkyPress's "open sky" brand and the existing `data-phase`
attribute on `<html>`, so the presets ship as **sky phases**.

## Data model

### `site.standard.theme.basic` (embedded object)

Four required RGB colours (each `{ r, g, b }`, integers 0–255; alpha not used):

| field | meaning |
|---|---|
| `background` | content background |
| `foreground` | content text |
| `accent` | links + button backgrounds |
| `accentForeground` | button text |

Represented in TypeScript as:

```ts
interface Rgb { r: number; g: number; b: number; }
interface BasicTheme {
  $type: 'site.standard.theme.basic';
  background: Rgb;
  foreground: Rgb;
  accent: Rgb;
  accentForeground: Rgb;
}
```

### Changes to existing types (additions only — lexicon discipline)

- `PublicationRecord` (`src/lib/publish/records.ts`): add optional `basicTheme?: BasicTheme`.
- `buildPublicationRecord`: accept + conditionally include `basicTheme`.
- `PublicationInput` / `Publication` (`src/lib/publish/publications.ts`): add optional `basicTheme`.
- `ReaderPublication` (`src/lib/reader/publications.ts`): surface `basicTheme`.

No field is ever removed or made required. `basicTheme` absent ⇒ default look.

## Presets — `src/lib/publish/themes.ts` (pure, tested)

A new dependency-free module exporting the 8 sky-phase presets derived from the
Twenty Twenty-Five colour palettes:

```ts
interface ThemePreset { slug: string; label: string; colors: BasicTheme; }
export const THEME_PRESETS: readonly ThemePreset[];
```

Mapping from each TT5 palette: `background ← base`, `foreground ← contrast`, and
an `accent` / `accentForeground` pair chosen so button/link text clears
**WCAG AA (contrast ≥ 4.5:1)**. The accent is the palette's most vivid usable
accent; `accentForeground` is whichever of the palette's light/dark colours
passes against it.

Phases (TT5 source): Evening, Noon, Dusk, Afternoon, Twilight, Morning,
Sunrise, Midnight.

Helpers:
- `findPresetByColors(theme): ThemePreset | null` — reverse-match stored colours
  to a preset so the settings UI can highlight the current selection (returns
  `null` for none/custom).
- `themeToCssVars(theme): Record<string, string>` — map a `BasicTheme` to the
  SkyPress design tokens it overrides. Pure, unit-tested.

## UI — preset picker in `PublicationForm`

A swatch-grid radio group added to `PublicationForm.tsx`, so it appears
identically on **creation** and in the **Settings tab** (which already reuses
`PublicationForm`). Each option is a small preview card showing the preset's
background/text/accent, plus a "No theme" option (default, selected when the
publication has no `basicTheme`).

**Hand-rolled React + plain CSS — not `@wordpress/components`.** AGENTS.md
constraint #3 forbids `@wordpress/*` outside the editor/Studio island; the
dashboard is an explicit no-`@wordpress` zone (importing it risks the duplicate
`@wordpress/data` registry crash from Decision 0003). The picker matches the
existing `PublicationForm` plain-React/CSS style.

Accessibility: a labelled radio group (`role="radiogroup"`), each preset an
`<input type="radio">` with a visible label, keyboard-navigable, with a visible
focus/selected state.

## Public rendering

In the publication-home (`[author]/[slug]/index.astro`) and article
(`[author]/[slug]/[rkey].astro`) pages, when the resolved publication has a
`basicTheme`, inject a small `<style>` into the existing `<Fragment slot="head">`
that overrides the design tokens on `:root` via `themeToCssVars` (e.g.
`--paper`←background, `--ink`←foreground, `--sun`/`--btn-primary`←accent,
button text←accentForeground).

A publisher's palette is a **fixed identity**, so it intentionally overrides
both the light and dark `prefers-color-scheme` defaults (standard.site's
"consistent across platforms" intent). When there is no `basicTheme`, nothing is
injected and the existing light/dark behaviour is untouched.

The injected values come from a trusted, app-controlled preset table keyed by
the stored colours — but since the record is PDS-sourced, the renderer validates
each channel is an integer 0–255 and emits only `rgb(...)` strings (never raw
record text) to avoid CSS injection.

## Tests (TDD, failing-test-first)

- `themes.test.ts`: all 8 presets present; each accent/accentForeground pair
  clears WCAG AA; `findPresetByColors` round-trips; `themeToCssVars` output.
- `records.test.ts`: `buildPublicationRecord` includes `basicTheme` when given,
  omits when not; RGB shape preserved.
- `publications.test.ts`: create + update round-trip `basicTheme`.
- `reader/publications.test.ts`: `basicTheme` surfaces (and malformed/absent →
  undefined).
- Renderer mapping covered by `themeToCssVars` test + channel validation test.
- Picker: radio-group semantics / selection state.

## Docs & decisions

- New decision doc `docs/decisions/0012-publication-theme-presets.md`: why the
  standard `basicTheme` field, why hand-rolled UI (not `@wordpress`), and the
  light/dark override semantics.
- Update `lexicons/README.md` — add `basicTheme` to the
  `site.standard.publication` fields table.

## Out of scope (YAGNI)

- Custom colour pickers / arbitrary palettes (presets only).
- Theming the authenticated dashboard/editor chrome (public reader only).
- Fonts, layout/spacing, or per-article overrides.
- `labels` / `preferences` publication fields.
```
