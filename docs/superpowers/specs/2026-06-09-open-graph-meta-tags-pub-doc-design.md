# Open Graph meta tags for publication & document pages

**Date:** 2026-06-09
**Status:** Approved (brainstorm)

## Goal

Extend the rich link previews (Open Graph + Twitter Cards) already shipped on the
static pages to the two dynamic public reading surfaces a visitor actually
shares: a **publication** (`/@handle/slug`) and a **document/article**
(`/@handle/slug/rkey`). After this, both surfaces get a complete OG/Twitter tag
set with a publication-branded share image.

## Current state

- **Static pages** (`/`, `/lexicon`, `/preview`): full OG/Twitter set via
  `Base.astro` + `buildMetaTags`. Done (prior brief).
- **Publication page** (`src/pages/[author]/[slug]/index.astro`): renders
  `<Base title description>` *without* opting out, so it already emits the full
  set — but always with the generic default image (`/og-default.png`) and
  `og:type=website`. It never uses the publication's own logo.
- **Document page** (`src/pages/[author]/[slug]/[rkey].astro`): opts out
  (`socialMeta={false}`) because it owns a special canonical (the atproto
  `canonicalArticleUrl`) and `og:type=article`. It hand-rolls only four tags —
  `og:type`, `og:title`, `og:description`, `og:url`. **Missing:** `og:site_name`,
  `og:image`, all `og:image:*`, and the entire Twitter card set. This is the
  biggest gap: shared articles have no image and no Twitter card.

## Image source (decided)

Articles have **no** cover-image field in the `site.standard.document` lexicon,
and the only imagery lives inside body blocks. The agreed chain for **both**
pages is:

> **publication logo (`publication.icon` blob) → shared default `/og-default.png`**

A publication and its articles then share one recognizable, on-brand image with
near-zero complexity.

**Out of scope (YAGNI):** a per-article cover-image lexicon field, scanning body
blocks for a representative image, and using the author's Bluesky banner/avatar.

## Approach

### 1. `buildMetaTags` helper — `src/lib/seo/meta.ts`

The dimensions `1200×630` are currently hardcoded. That is true for the default
share image but a lie for a square publication logo.

- Add optional `imageWidth?: number` and `imageHeight?: number` to
  `MetaTagInput`.
- Emit `og:image:width` / `og:image:height` **only when both are present**.
- Everything else is unchanged.

### 2. `Base.astro`

- Add optional `imageWidth` / `imageHeight` props.
- Derive defaults so existing static pages are byte-for-byte unchanged: when the
  resolved image is the built-in default (`/og-default.png`), use `1200/630`;
  when a caller passes a custom image and no dimensions, omit them.
- Pass the resolved dimensions through to `buildMetaTags`.

### 3. Publication page — `src/pages/[author]/[slug]/index.astro`

- Build the logo's absolute blob URL via the existing `buildGetBlobUrl`
  (`publication.icon`, `pdsUrl`, `did` are already in scope).
- Pass `image={logoUrl ?? undefined}` and `imageAlt={publication.name}` to
  `Base`. No dimensions when a logo is used; when there's no logo it transparently
  falls back to the default image at `1200×630`.
- `og:type` stays `website`. No opt-out — `Base` keeps emitting the full set.

### 4. Document page — `src/pages/[author]/[slug]/[rkey].astro`

Keeps `socialMeta={false}` (it owns the atproto canonical + `og:type=article`).

- Import `buildMetaTags` and `buildGetBlobUrl`.
- Resolve the publication-logo blob URL, else the default `/og-default.png`
  resolved absolute via `new URL( image, Astro.site )`.
- Call:

  ```ts
  buildMetaTags( {
      title,
      description,
      url: canonical,
      image,
      siteName: 'SkyPress',
      type: 'article',
      imageAlt: publication.name,
  } )
  ```

  and render the full set in the head slot — replacing the four partial tags.
  The existing `standard.site` link tags + canonical link stay untouched.
- Result: articles gain `og:image`, `og:site_name`, and the full Twitter card.

## Testing (TDD — failing test first)

- `src/lib/seo/meta.test.ts`: `og:image:width/height` emitted only when both
  passed; omitted otherwise.
- `src/layouts/Base.meta.test.ts`: a custom image without dimensions omits the
  `og:image:width/height` tags; the default image still emits `1200×630`.
- Source-level page assertions for the publication + document pages, matching the
  repo's existing pure-logic / source-pin convention (the runner is jsdom-pinned,
  so page rendering through `astro/container` is not viable — see the note atop
  `Base.meta.test.ts`):
  - Publication page passes `image=` (a resolved logo URL) and `imageAlt=` to
    `Base`.
  - Document page calls `buildMetaTags` with `type: 'article'` and renders the
    resulting tags, and no longer hand-rolls a partial set.

## Risks / notes

- Blob image URLs point at the writer's PDS (an external host). OG scrapers fetch
  them directly — expected and fine. The logo is square, which is why we drop the
  `1200×630` assertion for it rather than mis-declaring dimensions.
