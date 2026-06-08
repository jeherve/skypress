# SkyPress — Brand Identity

> The deliverable for brief §7. The system is implemented in `src/styles/global.css`
> (tokens + type), `src/components/Logo.astro`, and `public/favicon.svg`.

## Concept

**The open sky meets the typesetter's bench.** Airy + crafted, modern + timeless. SkyPress
is a calm, editorial writing studio for the open social web — indie-web and human, never
corporate-SaaS. The "sky" is the AT Protocol's open air; the "press" is movable type, ink,
and paper. The design lives in that collision.

### Directions explored (then refined)
1. **Bauhaus-sky** — geometric, primary blue, grotesque type. Rejected: too cool/corporate.
2. **Soft cloud / pastel** — rounded, airy, gradients. Rejected: drifts toward AI-slop.
3. **Editorial letterpress + altitude blue** ✅ — warm paper, ink, a confident sky-blue, a
   characterful old-style serif. Crafted and reading-first; this is the chosen direction.

## Logo

A **type block** (the page / letterpress tile) framing a **sun rising over a horizon**,
with two short "lines of set type" beneath — sky ∧ press in one mark. Single-colour
(`currentColor`), so it works in monochrome (GitHub README) and as a 16px favicon; the app
renders the mark in sky-blue. See `Logo.astro` / `favicon.svg`.

- **Wordmark:** "SkyPress" — one word, set in Fraunces (display) with a touch of `SOFT`/`WONK`
  for letterpress warmth. The mark sits left of the word.

## Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#faf6ef` | `#111319` | page background (warm paper / deep night sky) |
| `--paper-raised` | `#fffdf9` | `#181b23` | cards, inputs |
| `--panel` | `#f1eadc` | `#1b1f2a` | bars, code chips |
| `--ink` | `#1c1a16` | `#ece6da` | primary text (warm near-black / warm off-white) |
| `--ink-soft` | `#46413a` | `#c3bcad` | lede / secondary text |
| `--muted` | `#756d5f` | `#938b7d` | meta, captions |
| `--line` | `#e5ddcd` | `#292d39` | hairlines |
| `--sky` | `#2a5fd0` | `#7aa2ff` | primary accent (altitude blue) |
| `--sky-tint` | `#e9f0fc` | `#1a2235` | accent washes |
| `--ember` | `#bb5a36` | `#e08a63` | rare warm counterweight / errors |

Light + dark are both first-class (auto via `prefers-color-scheme`). The palette is a
considered sky-blue + warm ink/paper neutrals — deliberately not default tech-blue on white.

## Typography (all freely licensed, self-hosted via Fontsource)

- **Display / wordmark / headings — Fraunces** (variable; `opsz`, `SOFT`, `WONK`). An
  old-style serif with optical sizing and characterful, slightly "wonky" details —
  letterpress warmth.
- **Reading & UI — Newsreader** (variable). A serif designed for on-screen long-form;
  calm and editorial. Used for body and most UI text to keep the studio cohesive.
- **Mono — IBM Plex Mono.** Code blocks, and uppercase letter-spaced "eyebrow" labels
  (`.eyebrow`) — the indie-press voice.

## Iconography & UI texture

- "Blocks of type" show up as the editor's curated block set; the mark echoes stacked
  lines of type. Hairline rules (`--line`) and a soft horizon gradient (`.sky-wash`) give
  atmosphere without clip-art clouds.
- Buttons are mono-labelled, understated; the primary action is sky-blue.

## Voice & tone

Calm, encouraging, plainspoken, a little literary.
- **Empty state:** "A blank page, and the open sky."
- **Primary buttons:** "Start writing", "Publish", "Update".
- **Reassurance:** "Your data, your server, the open web."

## Tagline / positioning

**"Write things worth keeping."**
Alternates: "Long-form for the open sky." · "The open sky meets the typesetter's bench." ·
"Your words, your server, the open web."

## Constraints met

Tiny favicon ✓ · large hero mark ✓ · monochrome ✓ · light + dark first-class ✓ · freely
licensable fonts, reproducible assets ✓.
