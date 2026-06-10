# Profile "Elsewhere" section — design

**Date:** 2026-06-09
**Status:** Approved (ready for implementation)

## Goal

On the public author/profile page (`src/pages/[author]/index.astro`), display the
writer's publications that were published with **other tools** (Leaflet, …) — the
"foreign" `site.standard.publication` records SkyPress doesn't own — in a separate
section, the way the authed dashboard already does in its "From other apps" block.

Each entry links out to the foreign publication's own URL (external link,
`target="_blank" rel="noopener noreferrer"`) and shows an external-link icon on hover.

## Decisions (from brainstorming)

- **Section heading:** "Elsewhere".
- **Per-item content:** publication **name** only (plus its logo). No hostname.
  - **Superseded 2026-06-10** (`2026-06-10-provider-logos-design.md`): each row now also
    shows a hostname pill, with the originating service's logo before it when recognised
    (Decision 0017). `ReaderForeignPublication` gained `hostname` + `provider` for this.
- Render the section only when there is at least one foreign publication.

## Data layer — `src/lib/reader/publications.ts`

Mirror the authed-side pattern (`listAllPublications` → `{ owned, foreign }`, with
`listPublications` as a thin wrapper):

- New interface `ReaderForeignPublication`: `{ uri, name, url, icon }`.
  - `url` drives the external link; `icon` (a `BlobRefJson | null`) the logo.
- New `listAllReaderPublications(pdsUrl, did)`: fetch the
  `site.standard.publication` records **once** and partition them:
  - SkyPress-owned (`isSkyPressPublicationUrl`, with a slug) → `owned`
    (existing `toReaderPublication` logic).
  - Otherwise, a record with a valid `http(s)` `url` → `foreign`
    (new `toReaderForeignPublication` mapper).
- Refactor existing `listReaderPublications` to call `listAllReaderPublications` and
  return `.owned`, so the publication/document slug routes that depend on it are
  untouched.

Single fetch, no extra round-trip — matches the authed side.

## Profile page — `src/pages/[author]/index.astro`

- Change the `Promise.all` to call `listAllReaderPublications`, destructuring
  `owned` + `foreign`.
- After the existing **Publications** list, add an **Elsewhere** section
  (`foreign.length > 0` only). Reuse the existing `author__heading` + list/row
  styling; each row is an external `<a>` showing logo + name.
- Reuse the page's existing arrow SVG + `author__handle-arrow` fade/slide-in hover
  pattern (already used on the Bluesky handle link) for the external-link icon.

## Tests (TDD)

`src/lib/reader/publications.test.ts`:

- `listAllReaderPublications` partitions owned vs. foreign correctly; foreign mapped
  to `{ uri, name, url, icon }`; non-`http(s)` URLs and SkyPress-owned URLs excluded
  from `foreign`.
- `listReaderPublications` still returns owned-only (regression).

## Out of scope

No changes to the dashboard, the lexicon, the curated block model, or the reader
sanitiser. Reading pages still never import `@wordpress/*`.
