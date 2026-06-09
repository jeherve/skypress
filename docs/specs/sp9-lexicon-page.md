# SP9 — Public lexicon page

- **Date:** 2026-06-08
- **Status:** ✅ Built — `/lexicon` is live. The entry point landed as a **"Docs" link in the
  shared site footer** rather than a home-page hero button: the landing page was later
  rebuilt around the handle input (see `docs/superpowers/specs/2026-06-09-landing-cta-and-handle-input-design.md`),
  which retired the multi-button hero.
- **Goal:** Add a public, plain-spoken page at `/lexicon` that highlights and documents the
  data SkyPress writes to a writer's PDS — narrative up top, technical reference below — and
  link to it from the site chrome.

Builds on [Decision 0005](../decisions/0005-lexicon-and-publish-model.md) (the lexicon &
publish model) and [`lexicons/README.md`](../../lexicons/README.md), the existing internal
documentation this page makes public-facing.

## Why

SkyPress's promise is "your words, your account, the open web." The lexicon is the concrete
proof of that promise — the open, inspectable format your writing lives in — but today it's
only documented in the repo (`lexicons/README.md`, the JSON schema, Decision 0005). This
page surfaces it to the people deciding whether to trust SkyPress, and to AT Protocol
developers evaluating interop.

## Audience & framing (blend)

A narrative lede in the landing page's honest, plain-spoken voice ("your words live in
*your* account, in an open format any AT Protocol reader can understand"), followed by a
real technical reference (field tables + the actual schema) for those who want it. Not a
dry developer-only reference; not a marketing page with the substance hidden.

## Success criteria

1. **Route `/lexicon`** renders server-side via `Base.astro` with **no `@wordpress/*`
   imports** (it's a reading page — Decision 0003).
2. **The owned schema is single-sourced**: the `blog.skypress.content.gutenberg` section is
   derived from the real `lexicons/blog.skypress.content.gutenberg.json` file at build time,
   not retyped — so it cannot silently drift from the lexicon.
3. **Third hero button** "See the lexicon" appears in `.hero__actions` on the home page,
   linking to `/lexicon`, styled as a ghost button (inherits sky-phase contrast for free).
4. **Pure helper is unit-tested** (test written first): the schema→rows transform is locked
   to the real JSON file.
5. `npm run check` and `npm run test` pass.

## Architecture

```
src/pages/lexicon.astro              new route /lexicon — server-rendered, Base.astro,
                                     NO @wordpress (reading page, Decision 0003)
src/lib/lexicon/schema-doc.ts        PURE: imports blog.skypress.content.gutenberg.json,
                                     exposes its NSID + description and turns defs.main into
                                     ordered field rows [{ name, type, required, description }]
src/lib/lexicon/schema-doc.test.ts   Vitest (written first) — locks the rows to the real file
src/pages/index.astro                add the third hero button in .hero__actions
```

Only the **owned** lexicon (`blog.skypress.content.gutenberg`) is machine-derived from its
JSON. The `site.standard.*` field tables and all narrative prose are hand-authored page
content — they are stable, partly editorial, and the upstream lexicons are community-owned
(rewriting their internal-facing README tone into public prose, not mirroring a file).

## Page content (top → bottom)

1. **Minimal masthead** — `<Logo>` linking back to `/` for navigation.
2. **Narrative lede** — one short, honest paragraph: your words live in your account, in an
   open format, not locked inside SkyPress.
3. **"What gets written when you publish"** — the three records at a glance
   (`site.standard.publication`, `site.standard.document`, `app.bsky.feed.post`), the
   one-line publish flow, and the honest reminder that publishing also creates a public
   Bluesky post (consistent with the landing page and brief §10).
4. **"The format we own: `blog.skypress.content.gutenberg`"** — *single-sourced section.*
   Renders the NSID, description, and the `version` / `blocks` field rows straight from the
   JSON via `schema-doc.ts`; shows the actual schema JSON; states the graceful-degradation
   rule (readers that don't understand the `$type` fall back to `textContent`).
5. **"Interop: the `site.standard.*` surface"** — hand-authored field tables for `document`
   and `publication`, framed as "we reuse community lexicons so your articles are
   discoverable beyond SkyPress."
6. **Footer** — links to the canonical source ([standard.site]), the repo's `lexicons/`
   directory, and the GPL-2.0 mark (matching the existing site footer).

## Design / styling

- Themed `--paper` surface (like `/preview` and the "How it works" section), not the
  atmospheric sky — this is a calm reference page.
- Reuse existing design tokens (`--sun`, `--ink`, `--ink-soft`, `--muted`, `--line`,
  `--font-mono`) and the `.btn` system. No new global CSS; page-scoped `<style>` only.
- The home-page button needs **no new layout code**: `.hero__actions` already uses
  `flex-wrap: wrap` + `justify-content: center`, so three buttons reflow on narrow screens,
  and `.btn--ghost` already adapts to every sky phase via `--sky-chip` / `--sky-line`.

## TDD plan (pure `schema-doc.ts`)

Write `schema-doc.test.ts` first. Given the real imported schema, the helper returns:
- the NSID `blog.skypress.content.gutenberg` and the `defs.main` description;
- ordered field rows for `version` (integer, required) and `blocks` (array, required) with
  the descriptions from the file.

If the lexicon JSON changes shape, the test and page follow it; if the page would drift, the
test fails. The `.astro` page is static markup over the helper's output — no separate page
test; `npm run check` (astro/tsc) covers its types.

## Out of scope

- No changes to the lexicon itself or new lexicon files.
- No editor / publish / renderer code changes.
- No routing config beyond adding the page (Astro file-based routing).
- No build-time validation of the `site.standard.*` shapes against upstream (those tables
  are hand-authored; upstream is community-owned).

[standard.site]: https://tangled.org/standard.site/lexicons
