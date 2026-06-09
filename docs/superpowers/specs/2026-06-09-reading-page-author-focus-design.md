# Reading-page author focus — design

**Date:** 2026-06-09
**Status:** Approved

## Problem

The reading pages (publication index and single post) lead with SkyPress's own
identity — the SkyPress logo + wordmark in the header. For readers, the focus should
be on the *publication* and its *author*, not on the platform.

## Goals

1. Publication page: drop the SkyPress header entirely.
2. Single post page: replace the SkyPress logo/title in the header with the
   **publication** logo + title.
3. Single post page: replace the publication name in the `reader__meta` eyebrow with
   the **author's** name, avatar, and handle.
4. Both pages: render dates in a long, human format (e.g. "June 9, 2026").

## Non-goals

- No client-side JavaScript on the reading pages (they stay server-only — see
  AGENTS.md hard constraint #3).
- No locale negotiation: the UI is English, so dates render in a fixed
  `en-US` long format. ("Controlled by the browser" was considered and dropped in
  favour of a simpler, JS-free fixed format.)
- No changes to the writer profile page, RSS feeds, theming, or OG meta.

## Design

### 1. Shared date helper (new)

`src/lib/reader/dates.ts` exports a pure function:

```ts
export function formatLongDate( iso: string ): string;
```

Implemented with `Intl.DateTimeFormat( 'en-US', { dateStyle: 'long', timeZone: 'UTC' } )`.

- `timeZone: 'UTC'` pins the rendered day: a `2026-06-09T23:00:00Z` timestamp must not
  roll to the 10th (or back to the 8th) depending on the server's local zone. It also
  keeps unit tests deterministic.
- Output example: `formatLongDate( '2026-06-09T12:00:00Z' ) === 'June 9, 2026'`.
- Callers keep their own null-handling (`publishedAt ? formatLongDate( publishedAt ) : null`),
  so the helper only ever receives a real ISO string.

### 2. Publication page — `src/pages/[author]/[slug]/index.astro`

- Remove the `<header class="masthead"><a href="/"><Logo /></a></header>` block.
- Remove the now-unused `Logo` import and the `.masthead` CSS rules.
- Change the article date mapping from `record.value.publishedAt?.slice( 0, 10 )` to
  `record.value.publishedAt ? formatLongDate( record.value.publishedAt ) : null`.

The publication hero (logo, title, byline, lede) already carries publication +
author identity, so no header is needed.

### 3. Single post page — `src/pages/[author]/[slug]/[rkey].astro`

**Data.** Add `fetchActorProfile` (mirroring the publication page) so the author's
`displayName` and `avatar` are available. Compute:

- `authorName = profile.displayName ?? \`@${ handle }\``
- publication `logoUrl` via `buildGetBlobUrl( pdsUrl, did, publication.icon.ref.$link )`
  when `publication.icon` exists, else `null`; `initial = publication.name.charAt(0).toUpperCase()`.

**Header.** Replace `<a href="/"><Logo /></a>` with a link to `pubUrl`
(`/@handle/slug`) containing the publication logo (or initial-letter fallback) and
the publication title.

**Eyebrow (`reader__meta`).** Replace the publication-name link with an author block
linking to `/@handle`:

```
[avatar] Author Name @handle · June 9, 2026 · updated June 10, 2026 · 5 min read
```

- Avatar shown only when `profile.avatar` exists.
- When `displayName` is absent, show just `@handle` once (no duplicated handle).
- Date(s) via `formatLongDate`.

**Cleanup.** Drop the `Logo` import and the `.reader__author` rule (replaced by new
author-block + header styles).

### 4. Tests

- TDD: write `src/lib/reader/dates.test.ts` first — covers the long-format output,
  UTC pinning (a late-evening UTC timestamp stays on its calendar day), and a
  date-only string.
- Inspect existing colocated `_*.test.ts` for these two pages; update any assertions
  that reference the removed masthead or the old `YYYY-MM-DD` date format.
- Gate: `npm run test` and `npm run check` must pass.

## Risks / notes

- Colocated tests under `src/pages/` MUST stay underscore-prefixed (AGENTS.md #8).
- Single post page newly depends on the actor profile fetch; if the profile fetch
  fails it should degrade to `@handle` rather than erroring the page (match the
  publication page's tolerance).
