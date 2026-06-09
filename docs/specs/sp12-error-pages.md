# SP12 — Playful error pages (404 / 500)

- **Status:** Planned
- **Depends on:** SP4 (public renderer), SP6 (brand), SP10 (publication URL model)
- **Decisions:** none new (reuses 0007 read-through renderer, 0009 Cloudflare deploy)

## Goal

Replace the bare `new Response('Not found', { status: 404 })` plain-text responses on the
reader routes with a **good-looking, playful** error page that stays on brand, and add the
two error pages SkyPress is missing entirely: a global **404** for unmatched URLs and a
**500** for server-side failures (e.g. a PDS fetch that throws).

The visual concept is **"Below the horizon"**: SkyPress's warm paper/ink/**sun** palette with
a setting sun dipping under a thin horizon line and a couple of distant birds. One scene,
copy that adapts to what went wrong, and a single **Back to homepage** button.

## Scope

Five situations, all rendered by the same scene:

| Kind                     | HTTP | Triggered from                                            |
| ------------------------ | ---- | --------------------------------------------------------- |
| `writer-not-found`       | 404  | `resolveAuthor(handle)` returns null (all 3 reader routes)|
| `publication-not-found`  | 404  | `resolveReaderPublication` returns null                   |
| `article-not-found`      | 404  | record missing, or `record.value.site` ≠ this publication |
| `not-found`              | 404  | unmatched URL (global `404.astro`) + malformed params     |
| `server-error`           | 500  | any route throws (auto-rendered `500.astro`)              |

## Copy (the content model)

No em dashes, plain natural wording. Eyebrow is a mono kicker; headline uses the display
face. All five share the single **Back to homepage** button.

- **`writer-not-found`** — eyebrow `404 · no one by that name`,
  heading `No writer at @{handle}`,
  sub `Nobody on the network goes by that handle yet. It might have a typo.`
- **`publication-not-found`** — eyebrow `404 · publication not found`,
  heading `No publication by that name`,
  sub `@{handle} hasn't published anything under "{slug}".`
- **`article-not-found`** — eyebrow `404 · story not found`,
  heading `This story set below the horizon`,
  sub `It's no longer part of {publicationName}. It may have been unpublished or moved.`
- **`not-found`** — eyebrow `404 · off the map`,
  heading `This page set below the horizon`,
  sub `There's nothing to read at this address.`
- **`server-error`** — eyebrow `500 · overcast`,
  heading `The sky's a bit cloudy right now`,
  sub `Something went wrong on our end. Give it a moment, then try again.`

## Modules

- `src/lib/reader/errors.ts` — **pure, dependency-free** source of truth. A function
  `errorScene(kind, context?)` returns `{ status, eyebrow, heading, subline }`. Context is
  the interpolation values (`handle`, `slug`, `publicationName`). All copy lives here, so it
  is edited in one place and is fully unit-testable. No `@wordpress`, no network.
- `src/components/ErrorScene.astro` — the visual. Props are exactly the four
  `errorScene()` fields. Renders inside `Base` (masthead + `Logo`). Self-contained `<style>`
  for the horizon scene. **No `@wordpress/*` imports** (AGENTS.md #3 — this is a read path).
- `src/pages/404.astro` — `prerender = true`. Static generic 404 for unmatched URLs;
  renders `ErrorScene` with `errorScene('not-found')`.
- `src/pages/500.astro` — `prerender = true`. Astro auto-renders this when a route throws,
  so no per-route try/catch is needed; renders `errorScene('server-error')`.

## Wiring the reader routes

In each of `src/pages/[author]/index.astro`, `[author]/[slug]/index.astro`, and
`[author]/[slug]/[rkey].astro`, replace every early `return new Response('…', { status })`
with: build the matching `errorScene(...)` props, set `Astro.response.status = props.status`,
and render `<ErrorScene {...props} />` from the template instead of the normal content
(`{ error ? <ErrorScene {...error} /> : <…normal…> }`). The real 404 status is preserved for
crawlers; the page is now a rendered HTML body, not plain text.

## Look & accessibility

- Reuses brand tokens from `global.css` (`--paper`, `--ink`, `--sun`, `--sun-tint`, `.btn`,
  `.eyebrow`). Light + dark first-class: a dark-mode sky-gradient variant via
  `@media (prefers-color-scheme: dark)`.
- Setting-sun has a slow glow animation, disabled under `@media (prefers-reduced-motion)`.
- Decorative sun/birds/horizon are `aria-hidden`. Single `<h1>` carries the heading. The
  status is conveyed in visible text, not colour alone. The button is a real `<a href="/">`.
- Every error page emits `<meta name="robots" content="noindex">` so the playful copy is
  never indexed, and opts out of social/canonical tags (`socialMeta={false}` on `Base`).

## Tests (TDD — copy is test-locked)

- `errors.test.ts` — for each kind: correct `status` (404 vs 500), correct eyebrow/heading,
  context interpolation (`handle`, `slug`, `publicationName` land in the strings), and a
  guard asserting **no em dash (`—`)** appears in any produced string.
- Reader-route `.meta.test.ts` files already exist; extend the relevant ones to assert an
  error case sets a 404 status and renders the scene rather than plain text.

## Out of scope

- Per-situation CTAs beyond "Back to homepage" (deliberately one button — decided in design).
- Search / "did you mean" suggestions on 404.
- Illustrated/animated art beyond the CSS horizon scene (no image assets).
- Localisation of error copy (English only for v1, consistent with the rest of the reader).
