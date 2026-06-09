# Landing page: simpler CTA, live handle input, and playful sky

**Date:** 2026-06-09
**Status:** Approved (brainstorm) — ready for implementation plan
**Area:** `src/pages/index.astro`, `src/components/Footer.astro`, `src/components/Logo.astro`, new handle-input island; retires `src/pages/preview.astro`

## Problem

The landing page CTA is busy and indirect. Three ghost buttons ("Start writing",
"Read a sample", "See the lexicon") compete for attention, and none of them is the
real front door. Comparable services (leaflet.pub, offprint.app, pckt.blog) lead with
a single, interactive **handle input**: you type your handle and it finds you on the
network, which doubles as the sign-in path. SkyPress should do the same while keeping
the one thing that makes its landing page distinctive — the **time-of-day sky** with a
live greeting and phase-driven headline.

Secondary cleanups requested at the same time: retire the sample/preview page (the real
demo will be the first @skypress.blog publication), move the lexicon link into the
footer under "Docs", add a "News" footer link for the future demo post, state somewhere
that SkyPress is free, and add a little more playfulness.

## Goals

- Lead with a single interactive handle input as the primary way in.
- Keep the signature dynamic sky, greeting, clock, and phase headline.
- Replace the multi-button clutter and the three-step "how it works" block with a
  tighter hero plus a "see it in action" screenshot strip.
- Retire `/preview`; surface the future real demo via a footer **News** link.
- Move the lexicon link to a footer **Docs** link.
- Mention that SkyPress is free.
- Add two restrained playful touches: an occasional shooting star and a sun→moon mark.

## Non-goals (YAGNI)

- No type-ahead dropdown of multiple accounts (you already know your own handle).
- No lightbox / modal for the screenshots (static for v1).
- No publication theming feature ("publication styles" is not a real screen).
- No automated screenshot pipeline — captures are committed static assets.

## Design

### Page structure (top to bottom)

The time-of-day system is unchanged: the pre-paint inline script in `index.astro` still
sets `data-phase` before first paint, the client script still updates the greeting,
clock, and headline on load, and the per-phase sky gradients/star visibility stay as-is.
`PHASES` / `phaseForHour` from `src/lib/landing/time-of-day.ts` remain the single source
of truth (its test keeps the inline boundaries in sync).

Layout inside the sky:

1. **Masthead** — `Logo` (phase-aware mark, see Playful touches) + `AuthorPill` +
   slimmed actions. The standalone "Studio" / "Read a sample" / "See the lexicon"
   buttons are removed; the handle input is now the primary entry. A single "Dashboard"
   ghost link is kept for returning writers.
2. **Hero** — eyebrow greeting · phase headline · short lede · **handle input**
   (centerpiece) · a one-line **free** mention (e.g. "Free & open-source").
3. **"See it in action" strip** — three real screenshots in sky-tinted frames.
4. **Honest note** — the existing candid line about cross-posting to Bluesky stays.
   This is a product guardrail ("don't surprise users — publishing also creates a
   Bluesky post; the UI must say so"), not optional chrome.
5. **Footer** — shared `Footer.astro` with new Docs + News links.

The previous three-step "how it works" `<ol class="steps">` block is **removed**; the
screenshot strip now carries that explanatory job.

### Handle input (live lookup)

A small **client-only React island** mounted in the hero (sibling in spirit to
`AuthorPill`). Behavior:

- As the user types, debounce input (~300–400ms) and resolve the handle against the
  **public Bluesky AppView, unauthenticated** — `app.bsky.actor.getProfile` via
  `https://public.api.bsky.app`. This is a pure read; no OAuth, no secrets.
- On a hit, show a confirmation card (avatar + display name + handle). On a miss or
  network failure, show a gentle hint. Neither blocks submission.
- **Start always works** (decision A from brainstorm): submitting hands the typed value
  to the existing `signIn()` OAuth flow (`src/lib/auth`), exactly as `LoginForm` does
  today. A failed/absent lookup never gates sign-in — fast typists and obscure-PDS
  handles are never stuck.

Reuse: the OAuth kickoff is the same path `LoginForm` already uses. The new piece is the
unauthenticated profile lookup + the confirmation UI. Keep the lookup in a small testable
function separate from the component.

Constraint check: this island lives only on the landing/auth surface, consistent with
the rule that reading pages must never import `@wordpress/*` (it imports `@atproto/api`
and auth helpers, not the editor stack).

### Screenshot strip

Three **real** captures, each inside a brand-styled (sky-tinted) browser frame:

1. **The editor** — `/editor` (the WordPress block editor).
2. **A published article** — the public reader page (server-rendered typography).
3. **An author page** — `/@handle`, showing all of a writer's publications.

Static images for v1, committed as assets, **unlinked** — they are illustrative, not
navigation. (A "published article" tile would otherwise point at `/@skypress.blog`,
which 404s until that demo post exists; revisit linking once it's live.) Captured from
the running app; shown to the user for sign-off before committing.

### Footer

`Footer.astro` keeps its three icon links (SkyPress profile, the author's profile,
WordPress.org). Add text links:

- **Docs** → `/lexicon`
- **News** → `/@skypress.blog` (the future demo publication's author page)

Remove the `/preview` link currently in the footer area of `lexicon.astro` and the hero
of `index.astro`.

### Playful touches

- **Shooting star** — a rare, subtle streak across the sky, enabled for the
  **night / dusk / dawn** phases only (where stars are visible), and **disabled under
  `prefers-reduced-motion`**. Pure CSS/decorative; `aria-hidden`.
- **Sun→moon mark** — the landing's `Logo` mark becomes phase-aware: a warm sun core by
  day, a cool crescent by night. **Scoped to the landing page only** so the shared
  `Logo` component stays neutral on author/reader pages. Implement without forking the
  component's meaning elsewhere (e.g. a landing-scoped variant or phase-driven styling),
  keeping the existing "type block + sun over horizon" motif.

### Retire the sample/preview page

- Delete `src/pages/preview.astro` and remove every `/preview` link (`index.astro`,
  `lexicon.astro`).
- **Keep** `src/lib/blocks/sample.ts` and its use in `render.test.ts`: the render
  fidelity lock (Decision 0003/constraint 4) still asserts against `SAMPLE_TREE`.
  Removing the sample data would break that test. So the *route* goes; the sample
  *data* stays for tests.

## Testing (TDD — write failing tests first, per AGENTS.md)

- **Handle lookup**: unit-test the debounced resolver function — match returns a
  profile, no-match/network-failure returns null and never throws, and submission is
  independent of lookup result (Start always proceeds).
- **Route removal**: assert `/preview` no longer builds / is not linked from any page.
- **Time-of-day**: extend existing `time-of-day.test.ts` only if greeting copy changes;
  the inline-boundary sync test must still pass.
- **Reduced motion**: the shooting star must be gated by `prefers-reduced-motion`
  (assert the CSS rule / no animation when reduced).
- Existing `render.test.ts` fidelity assertions must remain green (sample data retained).

## Risks / notes

- The hero gains a React island it did not have before. This is acceptable under the
  constraints (auth-surface chrome, like `AuthorPill`; no `@wordpress/*`), but it is a
  real shift from static-first for that page — keep the island minimal.
- Public AppView dependency: the lookup relies on `public.api.bsky.app` being reachable.
  Because Start never depends on it, an outage degrades gracefully (no confirmation card,
  sign-in still works).
- Screenshots will need recapturing as the UI evolves; accepted trade-off for showing
  the real product. No automation in v1.
