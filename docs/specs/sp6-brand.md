# SP6 — Brand identity

- **Date:** 2026-06-08
- **Status:** ✅ Complete — system built + applied + screenshot-verified
- **Goal (brief §7):** Deliver a complete brand identity and apply it across the editor +
  reading experience.

The brand deliverable (concept, logo, palette, type, voice, tagline, the 2–3 directions +
the chosen one) is **[docs/brand/brand-identity.md](../brand/brand-identity.md)**.

## What was built

- **Design system** (`src/styles/global.css`): CSS-variable tokens (warm paper, ink,
  altitude-blue sky, neutrals), self-hosted freely-licensed type (Fraunces / Newsreader /
  IBM Plex Mono via Fontsource), base typography, `.eyebrow` / `.btn` / `.sky-wash`
  utilities, and **first-class light + dark** via `prefers-color-scheme`.
- **Logo + favicon** (`Logo.astro`, `favicon.svg`): a type-block framing a sun over a
  horizon — sky ∧ press — monochrome-safe and favicon-ready.
- **Applied** across the landing (editorial hero with sky-wash), the reading page
  (editorial article: Fraunces title, Newsreader prose, styled quotes/code/images, the
  SP5 "updated" marker), the publication homepage, and the editor chrome / login / publish
  / your-articles (tokenized for dark mode).

## Verified

- `astro check` clean; build green; 37 tests green.
- Screenshots of the landing and reading pages confirm the editorial-letterpress + sky
  direction renders cohesively (in dark mode here; light mode shares the token set).

## Out of scope

A manual theme toggle (auto via OS for now), illustration/marketing assets beyond the mark,
and per-publication theming (`site.standard.theme.*`).
