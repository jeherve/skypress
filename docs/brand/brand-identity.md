# SkyPress — Brand Identity ("First Light")

> The deliverable for brief §7, redesigned in SP8. The system is implemented in
> `src/styles/global.css` (tokens + type), `src/lib/landing/time-of-day.ts` +
> `src/pages/index.astro` (the time-of-day landing), `src/components/Logo.astro`, and
> `public/favicon.svg`. Fonts live in `public/fonts/`.

## Concept

**A writing studio that wakes with you.** SkyPress is a calm, crafted, indie-web writing
studio for the open social web — human and editorial, never corporate-SaaS. The identity is
built around **sunrise**: warm light, the start of a good day, the open sky of the AT
Protocol. The landing page literally paints its sky to match the visitor's clock, so the same
page looks like dawn at dawn and dusk at dusk.

### Directions explored (then refined)
1. **Altitude blue + editorial serif** (the previous SP6 identity). Rejected: too cool; the
   blue read corporate.
2. **First Light (coral + pre-dawn plum gradient).** Energetic, but the deep gradient ran hot.
3. **Ember (burnt terracotta).** Earthy and calm, but a touch muted.
4. **Golden Hour (marigold)** ✅ — warm, optimistic, sunny without going neon. Chosen.

## Logo

A **type block** (the page / letterpress tile) framing a **sun rising over a horizon**, with
two short "lines of set type" beneath — sky ∧ press in one mark. Single-colour
(`currentColor`) so it works in monochrome (GitHub README) and as a 16px favicon; the app
renders the mark in marigold. The circle now rhymes with the landing's halo sun. See
`Logo.astro` / `favicon.svg`.

- **Wordmark:** "SkyPress" — one word, set in Overused Grotesk (700).

## Color — "Golden Hour"

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#faf6ef` | `#111319` | page background (warm paper / deep night) |
| `--paper-raised` | `#fffdf9` | `#181b23` | cards, inputs |
| `--panel` | `#f1eadc` | `#1b1f2a` | bars, code chips |
| `--ink` | `#1c1a16` | `#ece6da` | primary text |
| `--ink-soft` | `#46413a` | `#c3bcad` | lede / secondary text |
| `--muted` | `#756d5f` | `#938b7d` | meta, captions |
| `--line` | `#e5ddcd` | `#292d39` | hairlines |
| `--sun` | `#e8920c` | `#f4b13f` | primary accent (golden-hour marigold) |
| `--sun-strong` | `#b85c12` | `#f7c97a` | hover / active |
| `--sun-tint` | `#fbe6cc` | `#2a1f12` | accent washes, `::selection` |
| `--ember` | `#bb5a36` | `#e08a63` | rare warm counterweight / errors |

Light + dark are both first-class (auto via `prefers-color-scheme`). Warm paper/ink neutrals
are kept from SP6; only the accent flips from blue to marigold. The accent stays **constant
across all times of day** — only the landing hero's atmosphere changes.

## Typography (all freely licensed, self-hosted)

- **Display, UI, and body — Overused Grotesk** (variable, `wght 300–900`). A quirky neo-grotesk
  with a characterful italic; weight + italic carry the personality. Self-hosted woff2/woff in
  `public/fonts/` via `@font-face` (it is not on Fontsource). **OFL-1.1** (GPL-compatible);
  license shipped at `public/fonts/OverusedGrotesk-LICENSE.txt`.
- **Mono — IBM Plex Mono** (Fontsource). Code blocks, and uppercase letter-spaced "eyebrow"
  labels (`.eyebrow`) — the indie-press voice. Kept from SP6.

Fraunces and Newsreader (the SP6 serifs) are removed.

## The time-of-day landing

The hero is centered. Its sky gradient, sun height, greeting, and headline are chosen from the
visitor's local hour across six phases — night (21–4), dawn (5–6), morning (7–9), midday
(10–15), golden (16–18), dusk (19–20). Midday stays warm cream/gold (no blue) to stay on
brand. The sun is a **halo ring** (a thin luminous outline with an inner glow) over a soft
bloom near the horizon — light welling up, not a hard disc.

- **Source of truth:** `src/lib/landing/time-of-day.ts` (phase boundaries + per-phase copy),
  unit-tested. CSS holds the per-phase skies keyed off `html[data-phase]`.
- **No-flash + accessible:** a tiny inline head script sets the phase before first paint; the
  page server-renders a static golden hero so no-JS visitors get a correct, motion-free page.
  Below the hero, the page settles into the standard themed surface (a numbered "how it works"
  strip, the honest Bluesky note, footer).

## Iconography & UI texture

- "Blocks of type" show up as the editor's curated block set; the mark echoes stacked lines of
  type. Hairline rules (`--line`) and the atmospheric sky give warmth without clip-art clouds.
- Buttons are mono-labelled, understated; the primary action is marigold.

## Voice & tone

Calm, encouraging, plainspoken, a little literary; warm and direct ("your words, your
server"). Honest about what publishing does.
- **Time-aware greetings:** "Up with the sun", "Golden hour", "Good evening".
- **Primary buttons:** "Start writing", "Publish", "Update".
- **Reassurance:** "Your words, your server, the open web."

## Tagline / positioning

**"Write things worth keeping."**
Alternates: "Catch the first light." · "A studio that wakes with you." · "Your words, your
server, the open web."

## Constraints met

Tiny favicon ✓ · large hero treatment ✓ · monochrome-safe mark ✓ · light + dark first-class ✓
· freely licensable, self-hosted fonts (OFL) ✓ · no-JS / reduced-motion fallback ✓.
