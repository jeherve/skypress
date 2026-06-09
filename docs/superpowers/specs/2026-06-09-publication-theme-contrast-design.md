# Publication theme contrast fixes — design

- **Date:** 2026-06-09
- **Status:** Approved (brainstorm)
- **Area:** publication themes (`src/lib/publish/themes.ts`), public reader (SP4/SP7)
- **Builds on:** Decision 0012 (publication theme presets)

## Problem

Decision 0012 promises every preset's "button/link text clears WCAG AA (≥ 4.5:1)",
locked by a unit test. But the test only checks two pairings — body text
(`foreground`/`background`) and button text (`accentForeground`/`accent`). It never
checks the pairings the reader actually renders for **links** and **secondary text**.

The reader styles article links as `a { color: var(--sun) }` (global.css), and
`themeToCssVars` maps `--sun ← accent`. So a link's contrast is **accent-on-background** —
never tested. Auditing every text/UI pairing the themed reader emits found:

- **Links unreadable** (accent on background, needs ≥ 4.5): fails `evening` (1.39),
  `noon` (1.65), `afternoon` (1.03), `twilight` (3.49), `morning` (2.04).
- **Secondary text sub-AA** (`--muted` = `mix(fg,bg,0.55)`, needs ≥ 4.5): fails `noon`,
  `dusk`, `afternoon`, `morning`, `midnight`. `--ink-soft` fails `afternoon`.
- **Pill/tag text on tint** (`--sun`/`--sun-strong` on `--sun-tint`): fails several,
  including otherwise-compliant `dusk` and `midnight`.
- **Button hover fill** (`accentForeground` on `--btn-primary-hover`): fails `twilight`.

`background`/`foreground` (body) and `accentForeground`/`accent` (button) already pass
in all eight presets.

Decorative hairline borders (`--line`, `--line-strong`) measure ~1.2–2.3:1 in every
preset — but this matches the base design (`--line` is ~1.2:1 on `--paper` there too).
WCAG exempts purely decorative boundaries that aren't required to identify a component,
so these are **intentionally exempt**, documented, not "fixed".

## Why a stored-value fix (not just runtime)

The stored `site.standard.publication.basicTheme` record carries exactly **four** colors:
`background`, `foreground`, `accent`, `accentForeground`. Decision 0012's reason for using
the *standard* field is interop — other standard.site readers (Leaflet, etc.) read those
same four values, and a naive reader maps `accent → link color` directly. Fixing contrast
only at SkyPress render time would leave the stored accent vivid-but-unreadable, so other
readers would still show broken links. Therefore the **stored** accent/accentForeground
must themselves be contrast-safe.

The derived tokens (`--muted`, `--ink-soft`, `--sun-strong`, `--sun-tint`,
`--btn-primary-hover`) are **not** stored — they are recomputed from the four colors on
every render — so they are fixed in the derivation regardless.

## Design

A hybrid of "fix the stored colors" + "fix the derived tokens".

### 1. Bake contrast-safe raw colors into `THEME_PRESETS`

For the five failing presets, adjust the **accent's lightness only** (HSL: keep hue +
saturation, move L toward the contrast-raising end) until `accent` clears ≥ 4.6:1 on its
`background`, then set `accentForeground` to whichever of black/white clears ≥ 4.5:1 on the
new accent. The three already-compliant presets (`dusk`, `sunrise`, `midnight`) are left
byte-identical.

Values are stored as **literals** in the preset table (reviewable, deterministic, and the
exact bytes written to the PDS record), not computed at module load. The contrast helper
is used to *derive* the candidate values during development; the test then re-asserts they
are contrast-safe, so a hand-edit that breaks one is caught.

Resulting accent / accentForeground changes (lightness-adjusted, on-hue):

| preset | accent old → new | accentForeground |
|---|---|---|
| evening | `#442369` → `#9d6fcf` | white → black |
| noon | `#f5b684` → `#b2570f` | black → white |
| afternoon | `#c7f642` → `#526c05` | black → white |
| twilight | `#4b52ff` → `#676dff` | white → black |
| morning | `#7a9bdb` → `#305db2` | black → white |
| dusk / sunrise / midnight | unchanged | unchanged |

### 2. Contrast-aware derivation in `themeToCssVars`

Add a pure, dependency-free helper to `themes.ts`:

- `relativeLuminance(rgb)` / `contrastRatio(a, b)` — WCAG math.
- `ensureContrast(color, against, target)` — if `color` already meets `target` vs
  `against`, return it unchanged; otherwise reduce/raise its HSL lightness (hue +
  saturation preserved) by the minimal amount that reaches `target`. Pure white/black
  always clears 4.5 against any background, so it always converges.

Rewrite the derived-token mapping with explicit thresholds and worst-case backgrounds:

| token | role | target | derived against |
|---|---|---|---|
| `--sun` / `--ember` | accent text / links / focus rings | 4.5 | `--paper` |
| `--sun-strong` | link hover text | 4.5 | `--paper` |
| `--muted` | secondary text | 4.5 | `--panel` (most fg-ward surface) |
| `--ink-soft` | secondary text | 4.5 | `--panel` |
| `--btn-primary-hover` | button hover fill | 4.5 (vs `accentForeground`) | — |
| `--paper`, `--paper-raised`, `--panel`, `--ink`, `--btn-primary`, `--btn-primary-fg`, `--sun-tint` | surfaces / body / button fill+text | unchanged | — |
| `--line`, `--line-strong` | decorative hairline borders | **exempt** | — |

Even though the baked accents are already ≥ 4.5 on `--paper`, `--sun`/`--sun-strong` are
still routed through `ensureContrast` so that *arbitrary* themes (the custom-theme path,
`resolveSelectedTheme(CUSTOM_THEME_SLUG, …)`) also render accessibly. For the baked presets
this is a no-op.

`--sun` stays the raw (baked) accent — it clears ≥ 4.5 on `--paper`, so links, the
`border-left` editorial accent, and focus rings (which need only ≥ 3:1) are covered. The
only place `--sun` sits on the more accent-ward `--sun-tint` is the **large** display text
of the avatar / publication-logo fallback (2.6rem / 1.4rem, weight 700) — WCAG large-text,
so its bar is ≥ 3:1, which all baked accents clear (≥ 3.5:1). No CSS retargeting needed.

### 3. No CSS changes

The reader already consumes `--sun`, `--sun-strong`, `--muted`, `--ink-soft`,
`--btn-primary-hover` by name; in the themed reader pages these tokens appear only as text
(or a decorative border), never as a background carrying text. So correcting the token
*values* is sufficient — no `.astro`/`.css` edits.

### 4. Scope boundary

Changes are confined to `src/lib/publish/themes.ts` and `src/lib/publish/themes.test.ts`.
The base (unthemed) `global.css` palette and app-chrome pages (dashboard, editor, lexicon)
are **out of scope** — they are not publication-themed. (The base `--sun` link is also
~2.28:1, a pre-existing base-design issue, deliberately left for a separate change.)

## Testing (TDD)

Extend `themes.test.ts`:

1. **Per-preset text-pairing audit** — for every preset, assert ≥ 4.5 for: link
   (`--sun`/`--paper`), link hover (`--sun-strong`/`--paper`), muted (`--muted`/`--panel`),
   ink-soft (`--ink-soft`/`--panel`), button (`accentForeground`/`--btn-primary`), button
   hover (`accentForeground`/`--btn-primary-hover`); and ≥ 3:1 for the large avatar/logo
   display text (`--sun`/`--sun-tint`). This is the failing test written first.
2. **Stability assertion** — `dusk`, `sunrise`, `midnight` raw colors are unchanged.
3. **`ensureContrast` unit tests** — returns input untouched when already compliant;
   reaches target otherwise; preserves hue direction.
4. Keep the existing body/button assertions and the `$type`/range/render tests.

## Consequences

- Links and secondary text clear WCAG AA in all eight presets, in SkyPress and any other
  standard.site reader (the stored record is itself accessible).
- Five presets' accent shifts to an on-hue readable shade; four flip button-text color.
  Three presets are unchanged.
- The contrast guarantee is now genuinely owned by the test — adding a preset requires the
  full audit to pass, not just two pairings.
- Decorative borders remain low-contrast by design, documented as a WCAG-exempt choice.
