# 0012 — Publication theme presets ("sky phases")

- **Status:** Accepted
- **Date:** 2026-06-09
- **Scope:** publication system (SP10), public reader (SP4/SP7), brand (SP6)

## Context

Publishers had no way to give a publication its own look — every SkyPress publication
rendered with the single global brand palette. standard.site's `site.standard.publication`
lexicon already defines an optional `basicTheme` (a `site.standard.theme.basic` object:
`background`, `foreground`, `accent`, `accentForeground`, each an RGB triple) precisely so a
publication can carry a visual identity that any standard.site reader can honour. SkyPress
did not use it.

Open questions: whether to store the standard field or a SkyPress-private one; whether to
offer curated presets or arbitrary colour pickers; what component library the picker should
use; and how a chosen theme interacts with SkyPress's light/dark (`prefers-color-scheme`)
design tokens.

## Decision

### 1. Store the standard `basicTheme` field, not a private one

The theme is written to `site.standard.publication.basicTheme` exactly as the community
lexicon defines it. Because it is the *standard* field, other standard.site readers (Leaflet,
etc.) honour the same colours — interop for free. This is an additions-only, optional field,
consistent with the lexicon-discipline rule (AGENTS.md). The renderer treats stored colours as
untrusted PDS data: `parseBasicTheme` validates every channel is an integer 0–255 and the
renderer emits only app-built `rgb()` strings (AGENTS.md #6).

**Each colour is a union member, not a bare RGB triple.** The canonical
`site.standard.theme.basic` lexicon types `background`/`foreground`/`accent`/`accentForeground`
as a `union` of `site.standard.theme.color#rgb` (the colour lexicon also defines `#rgba`), so
atproto requires a `$type: "site.standard.theme.color#rgb"` discriminator on **every** colour
object. Omitting it makes the publication record invalid against the lexicon — and Bluesky's
AppView, which validates these records when hydrating the post embed's `associatedRefs`, then
silently drops the **enhanced standard.site link card** and falls back to a bare external embed
(no avatar, theme, or reading time). `themes.ts` stamps `COLOR_TYPE` on every colour it builds
(`rgb()`) or re-validates (`parseBasicTheme`), so the single write boundary always emits valid
records. (Originally shipped without the discriminator; see the fix that added it.)

### 2. Curated presets only — eight "sky phases"

Rather than a free-form colour picker, SkyPress ships eight presets derived from the Twenty
Twenty-Five theme's colour style variations, which are named after times of day (evening,
noon, dusk, afternoon, twilight, morning, sunrise, midnight). That maps directly onto
SkyPress's "open sky" brand and the existing `data-phase` attribute, so the feature reads as
**sky phases**, not a generic theme editor. Each preset's accent/accentForeground pair is
chosen so button/link text clears **WCAG AA (≥ 4.5:1)** — locked by a unit test
(`themes.test.ts`). A custom colour picker is deliberately out of scope (YAGNI) and would also
reopen the contrast-safety question per publication.

### 3. Hand-rolled React picker, not `@wordpress/components`

The picker lives in `PublicationForm` (so it appears on both creation and the settings tab)
and is built from plain React + CSS matching the existing form. It does **not** use
`@wordpress/components`, despite that being an option, because constraint #3 (Decision 0003)
forbids importing `@wordpress/*` outside the editor/Studio island — the dashboard is a
no-`@wordpress` zone, and pulling the editor stack in risks the duplicate `@wordpress/data`
registry crash. The picker is a labelled radio group (`role="radiogroup"`), keyboard-navigable.

### 4. Pure, dependency-free theme module

`src/lib/publish/themes.ts` holds the `BasicTheme`/`Rgb` types, the presets, `parseBasicTheme`,
`findPresetByColors` (reverse-match stored colours so the picker highlights the current one),
and `themeToCssVars`/`themeStyleBlock` (token mapping + the injected `<style>`). It has no
`@atproto`, `@wordpress`, or DOM dependency, so the SSR reader can import it on the read path.

### 5. A publisher theme overrides both light and dark

On the publication-home and article pages, when the publication has a `basicTheme` the page
head injects a `<style>` overriding the design tokens (`--paper`←background, `--ink`←foreground,
`--sun`/`--btn-primary`←accent, button text←accentForeground; borders/muted are deterministic
blends so the editorial hierarchy survives any palette). Because a publisher's palette is a
fixed identity (standard.site's "consistent across platforms" intent), it intentionally
overrides both the light and dark `:root` defaults rather than only one. With no `basicTheme`,
nothing is injected and the existing light/dark behaviour is untouched — the default for new
publications is **no theme**.

To let button text follow `accentForeground`, the previously hardcoded `.btn--primary { color: #fff }`
was tokenised to `var(--btn-primary-fg)` (default `#fff` in both palettes — a no-op for the
default look).

## Consequences

- Themes are interoperable: other standard.site readers render the same palette.
- The contrast guarantee is owned and tested here; adding a preset means adding its assertion.
- The reader gains a tiny inline `<style>` per themed page; unthemed pages are unchanged.
- Presets-only means no per-publication contrast risk and no custom-colour UI to maintain.

## Alternatives considered

- **SkyPress-private theme field** — rejected; loses cross-reader interop for no benefit.
- **Arbitrary colour pickers** — rejected (YAGNI + per-publication contrast safety burden).
- **`@wordpress/components` for the picker** — rejected; violates constraint #3 / Decision 0003.
- **Theme only one of light/dark** — rejected; a publication identity should be stable
  regardless of the reader's OS colour-scheme preference.
