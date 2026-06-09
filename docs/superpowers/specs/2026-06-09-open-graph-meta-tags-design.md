# Open Graph meta tags for the static pages

**Date:** 2026-06-09
**Status:** Approved (brainstorm)

## Goal

Give SkyPress's public, shareable static pages rich link previews on social
platforms (Open Graph + Twitter Cards), with an on-brand default share image.

## Scope

In scope — the three public-facing static pages a logged-out visitor would share:

- `/` — home (`src/pages/index.astro`)
- `/lexicon` — `src/pages/lexicon.astro`
- `/preview` — `src/pages/preview.astro`

Out of scope (follow-ups):

- The app screens `/editor` and `/dashboard` — tools behind sign-in, not share targets.
- The dynamic `[author]` publication/article pages — they need per-record titles,
  descriptions, and images; a different shape, tracked separately.
- Per-page custom OG images — all three pages share one default image for now.

## Approach

Extend the shared `Base.astro` layout, which already owns `<head>` and takes
`title`/`description`. The pages then inherit OG/Twitter tags from data they
already pass. (Rejected: a separate `<Seo>` component or inline per-page meta —
both duplicate what `Base` already centralises.)

## Design

### A. Tag-building helper — `src/lib/seo/meta.ts`

A pure function that returns the list of `<meta>` attribute objects, kept out of
the `.astro` template so it is unit-testable (the project is TDD-locked).

```ts
interface MetaInput {
  title: string;
  description?: string;
  url: string;        // absolute canonical URL
  image: string;      // absolute URL
  siteName: string;   // "SkyPress"
  type?: string;      // default "website"
  imageAlt?: string;
}
// returns Array<{ property?: string; name?: string; content: string }>
buildMetaTags(input): MetaTag[]
```

Tags produced:

- `og:title`, `og:url`, `og:type`, `og:site_name`
- `og:description` — **omitted entirely when `description` is absent** (no empty tag)
- `og:image`, `og:image:width` (`1200`), `og:image:height` (`630`), `og:image:alt`
- `twitter:card` (`summary_large_image`), `twitter:title`, `twitter:image`
- `twitter:description` — omitted when `description` is absent

`og:*` use the `property` attribute; `twitter:*` and `name`-style use `name`.

### B. `Base.astro` renders them

New optional props (additions only — existing `title`/`description`/`phase` unchanged):

- `image?: string` — default `/og-default.png`
- `ogType?: string` — default `"website"`
- `imageAlt?: string` — default a brand-appropriate string

`Base` computes the canonical absolute URL from `Astro.url` resolved against
`Astro.site` (`https://skypress.blog`, overridable via `PUBLIC_SITE_URL`), resolves
the image to an absolute URL the same way, calls `buildMetaTags`, and renders the
tags in `<head>`. It also emits `<link rel="canonical" href={url} />` since the
absolute URL is already computed.

### C. The three static pages

- `index.astro` and `lexicon.astro` already pass `title` + `description` — no change
  needed; they inherit the default image automatically.
- `preview.astro` currently passes only `title`; add a `description` so its card has
  body text (e.g. "A sample SkyPress article, rendered server-side from stored AT
  Protocol blocks — zero editor JavaScript.").

### D. Shared OG image — `public/og-default.png`

1200×630 PNG, committed as a static asset. On-brand: the SkyPress sky gradient (a
warm sun/golden phase), the logo sun-mark + **SkyPress** wordmark, and the tagline
"A writing studio for the open social web." Authored as an HTML/SVG poster using the
real palette (`global.css`) and self-hosted fonts (Overused Grotesk, IBM Plex Mono),
then rasterized to PNG at exactly 1200×630 via a headless browser so the custom
fonts render. The authoring source need not ship; only the PNG is required.

### E. Testing & verification

- **Unit (TDD, red first):** `src/lib/seo/meta.test.ts` for `buildMetaTags` —
  asserts the full tag set, absolute image URL passthrough, `summary_large_image`,
  and clean omission of description tags when absent.
- **Build/type:** `npm run test`, `npm run check`, `npm run build`.
- **Rendered output:** confirm each of the three built pages' `<head>` contains the
  OG/Twitter tags with absolute `og:url` and `og:image`.

## Constraints honoured

- Reading pages must not import `@wordpress/*` — the helper is dependency-free and
  the rendering lives in `Base.astro`. ✓
- Additions-only to `Base.astro`'s prop interface; no behaviour change for callers
  that don't pass the new props. ✓
