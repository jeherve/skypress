# SP8 — Brand redesign: "First Light"

- **Date:** 2026-06-08
- **Status:** ✅ Built + screenshot-verified (landing across phases, reading + editor in light & dark)
- **Supersedes:** the visual layer of [SP6](./sp6-brand.md) (altitude-blue + Fraunces/Newsreader).
  SP6's structure (token system, light/dark, applied-everywhere approach) is kept; only the
  palette, type, and landing page change.
- **Goal:** Replace the cool blue + serif identity with a warm **sunrise** identity, and make
  the landing page a time-aware piece of atmosphere. Driven by three user requests: drop the
  blue (go warm/orange/sunrise); switch to Overused Grotesk; make the landing far more playful
  around the sunrise idea.

## Concept

**A writing studio that wakes with you.** The calm, crafted, indie-web long-form character of
SkyPress is unchanged. What changes: the accent warms from altitude blue to **golden-hour
marigold**, and the landing page paints its sky to match the visitor's real clock — the same
page looks like dawn at dawn and like dusk at dusk.

## Decisions (each chosen against alternatives during brainstorming)

1. **Palette — "Golden Hour."** Marigold/amber primary. Chosen over a coral "First Light"
   plum-gradient and an earthy "Ember" terracotta — golden hour reads sunny and optimistic
   without going neon.
2. **Type — Overused Grotesk for everything** (display + UI + long-form body), IBM Plex Mono
   kept for eyebrows/labels/code. Fraunces and Newsreader are removed. Chosen over keeping a
   reading serif for article body — the all-sans grotesk is more modern/playful and cohesive.
3. **Landing — time-of-day responsive hero.** Chosen over scroll-driven parallax (rejected:
   gimmicky, didn't land) and a static broadsheet. The hero's sky/sun/greeting/headline are
   set once on load from `new Date().getHours()`.
4. **Sun — halo ring** (a thin luminous outline with an inner glow + soft bloom near the
   horizon), echoing the logo's circle. Chosen over a solid disc (too "clip-art ball"), a
   discless bloom, and a horizon light-band.

## Color tokens (replacing the `--sky*` family)

Warm paper/ink/muted/line neutrals from SP6 are kept (already warm, work in both modes).
Only the accent flips. Rename `--sky*` → `--sun*` across the codebase.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--sun` (was `--sky`) | `#e8920c` | `#f4b13f` | primary accent — buttons, links, logo mark |
| `--sun-strong` (was `--sky-strong`) | `#b85c12` | `#f7c97a` | hover / active |
| `--sun-tint` (was `--sky-tint`) | `#fbe6cc` | `#2a1f12` | washes, `::selection` |
| `--ember` | `#bb5a36` (kept) | `#e08a63` (kept) | rare counterweight / errors |

The accent is **constant across all times of day**; only the landing hero's atmospheric
background varies. `.sky-wash` → `.sun-wash` (a soft warm radial), references updated.

## Typography

- **Overused Grotesk** — variable woff2, self-hosted in `public/fonts/`, declared via
  `@font-face` (it is not on Fontsource). OFL-1.1, GPL-compatible; license file shipped
  alongside the font. Drives `--font-display` and `--font-body` (one family, weight + italic
  for contrast).
- **IBM Plex Mono** — kept (Fontsource), `--font-mono`, for `.eyebrow`, button labels, code,
  meta.
- Remove `@fontsource-variable/fraunces` and `@fontsource-variable/newsreader` (imports +
  package.json deps). Remove Fraunces `font-variation-settings` (`opsz`/`SOFT`/`WONK`) usages.

## Landing page — time-of-day hero

- **Layout:** centered hero (masthead with logo + "Open the studio"; eyebrow greeting; large
  headline; lede; primary "Start writing" + ghost "Read a sample"; honest sign-in note).
- **Six phases** by visitor hour: night (21–4), dawn (5–6), morning (7–9), midday (10–15),
  golden (16–18), dusk (19–20). Each defines a sky gradient, sun height, light-vs-dark text,
  a mono greeting (e.g. "Golden hour · 17:23"), and a headline. Midday stays warm (cream/gold,
  **no blue**) to stay on-brand.
- **Sun:** halo ring + soft bloom positioned near a horizon hairline.
- **Below the hero:** the page settles into the **standard themed surface** (light/dark per
  OS) — broadsheet bones: a numbered "how it works" strip, the honest "publishing also posts
  to Bluesky" note, footer.
- **Implementation:** a small inline script sets the phase once on load (no animation loop).
  Phase logic + gradients live in a typed helper so it is unit-testable.
- **Accessibility / robustness:** a sensible **static golden sky** is the default rendered
  server-side; the script only enhances it. So no-JS and `prefers-reduced-motion` users get a
  correct, motion-free hero. Text contrast is checked per phase (light text on dark phases,
  ink on the pale midday).
- **Copy** (greetings, headlines, lede, step text, footer) written via the **writing-style**
  skill so it is in the user's voice.

## Logo, favicon, reading & editor

- `Logo.astro` + `favicon.svg`: same glyph, mark recolored to `--sun`. The circle now rhymes
  with the halo sun. Drop Fraunces variation settings on the wordmark; set in Overused Grotesk.
- Reading page (`[author]`, `preview`) and the editor/login/publish/your-articles chrome
  inherit the renamed tokens + new fonts automatically. No structural changes; verify contrast.

## Testing & verification

- New: unit test for the time-of-day phase helper (hour → phase boundaries, and that every
  phase defines the required fields).
- `astro check` clean, `npm run build` green, full `npm test` suite green (including the
  `render.ts` fidelity tests, which are unaffected — no block-rendering changes).
- Screenshot the landing (at ≥2 simulated phases), the reading page, and the editor in **both
  light and dark** before claiming done.

## Out of scope

- Block rendering, lexicons, OAuth, and the read-path SSRF/sanitise security — untouched.
- Animated transitions between phases, geolocated "real" sunrise times, a manual theme toggle,
  per-publication theming. (Phase is by local clock hour only.)

## Documentation

- Rewrite `docs/brand/brand-identity.md` to document "First Light" (concept, palette w/ hex,
  type, the sun treatment, voice, the directions explored + chosen).
- Mark SP6's spec as superseded-in-part by this one.
