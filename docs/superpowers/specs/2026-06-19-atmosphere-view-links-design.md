# Switch Bluesky view-links to mu.social + 🌀 icon

**Date:** 2026-06-19
**Status:** Approved (design)

## Problem

SkyPress sends readers to `bsky.app` to view profiles, posts, and hashtags, and
marks those links with a Bluesky butterfly icon. We want those *view* links to
point at `mu.social` (an alternative AT Protocol AppView, e.g.
`https://mu.social/profile/skypress.blog`) and to mark them with the `🌀` emoji
instead of the butterfly.

This only concerns where we send a reader to *view* something. SkyPress still
publishes to the Bluesky/atproto network exactly as before.

## Scope

### In scope — view-links move to `mu.social`

| Place | File | Today |
|---|---|---|
| Author profile `@handle` link | `src/pages/[author]/index.astro` | `bsky.app/profile/<handle>` |
| Bio `@mention` links | `src/lib/reader/rich-text.ts` | `bsky.app/profile/<handle>` |
| Bio `#hashtag` links | `src/lib/reader/rich-text.ts` | `bsky.app/hashtag/<tag>` |
| Editor mention autocomplete (stored in content) | `src/lib/editor/mention-autocompleter.ts` | `bsky.app/profile/<handle>` |
| Post "view" links | `src/lib/social/records.ts` (`bskyPostWebUrl`) | `bsky.app/profile/<did>/post/<rkey>` |
| "Create an account" link | `src/components/SignInPanel.tsx` | `https://bsky.app` |

`mu.social` is a Bluesky AppView client and uses the same path scheme
(`/profile/<id>`, `/profile/<did>/post/<rkey>`, `/hashtag/<tag>`). The profile
path is confirmed live; the post/hashtag paths are the standard AppView scheme
and will be verified with a real link during the smoke test.

### Out of scope — deliberately unchanged

- `public.api.bsky.app` API calls (actor lookup in `src/lib/landing/actor-lookup.ts`,
  interaction counts in `src/lib/social/interactions.ts`). mu.social does not serve
  that data API.
- Network/protocol descriptions: "publishing creates a public Bluesky post", the
  `app.bsky.feed.post` lexicon record on `src/pages/lexicon.astro`, unpublish
  warnings, and publish-disclosure copy. These describe the real atproto/Bluesky
  network and stay accurate.
- **Existing published articles** keep the `bsky.app` mention links already stored
  in their document HTML. We do not rewrite saved content; only newly authored
  mentions get `mu.social` links.

## Architecture

Introduce a single dependency-free helper module so the host lives in one place
and is safe to import from the reader path (no `@wordpress/*`):

```ts
// src/lib/social/atmosphere-url.ts
export const ATMOSPHERE_WEB_BASE = 'https://mu.social';
export function atmosphereProfileUrl( identifier: string ): string; // handle or DID
export function atmospherePostWebUrl( atUri: string ): string;      // at:// → web URL
export function atmosphereHashtagUrl( tag: string ): string;
```

- `atmospherePostWebUrl` absorbs the existing `bskyPostWebUrl` logic (parses
  `at://<did>/app.bsky.feed.post/<rkey>`, falls back to `ATMOSPHERE_WEB_BASE` on an
  unparseable URI). `bskyPostWebUrl` is removed and its one caller
  (`src/components/PostActions.tsx`) updated.
- All six call sites switch to these helpers.

### Critical coupling

`src/lib/publish/mentions.ts` (`PROFILE_RE`) parses stored mention `href`s to
decide who gets cc'd on the companion Bluesky post. Because the editor will now
insert `mu.social` hrefs, this regex MUST match both hosts, or mentions silently
stop being cc'd. Widen it to accept `bsky.app` **and** `mu.social` (this also keeps
already-saved drafts working).

## Wording

Link labels / aria-labels that say "Bluesky" become **"the ATmosphere"**:

- `src/components/PostActions.tsx`: "View this post on Bluesky" → "View this post on
  the ATmosphere"; "View on Bluesky" → "View on the ATmosphere".
- `src/pages/[author]/index.astro`: aria-label "View @handle on Bluesky" → "View
  @handle on the ATmosphere".
- `src/components/SignInPanel.tsx`: "Create one on Bluesky" and its aria-label →
  "…on the ATmosphere".

Disclosure / network text stays "Bluesky" (it describes the network, not a link):
"Likes, reposts… happen on Bluesky", "creates a public Bluesky post", unpublish
warnings, the lexicon page.

## The 🌀 icon

- **Author profile** (`src/pages/[author]/index.astro`): replace the inline
  butterfly SVG with the `🌀` emoji as text.
- **Article mentions** (`src/pages/[author]/[slug]/[rkey].astro`): replace the CSS
  `mask-image` butterfly on `a.skypress-mention::before` with `content: "🌀"`. The
  glyph becomes multicolor (no longer tinted by the publication theme); the hover
  slide-in transform is preserved.

## Testing (TDD)

Write/extend failing tests first:

- New `src/lib/social/atmosphere-url.test.ts` — profile (handle + DID), post
  (`at://` → web URL, plus fallback), hashtag.
- Update `src/lib/reader/rich-text` tests — profile and hashtag URLs now `mu.social`.
- Update `src/lib/publish/mentions` tests — `PROFILE_RE` matches both `bsky.app`
  and `mu.social` hrefs.
- Update any post-URL test currently asserting `bskyPostWebUrl`/`bsky.app`.

Run `npm run test` and `npm run check`.

## Decision record

Record the canonical view-host change (bsky.app → mu.social, and the
"the ATmosphere" link wording) as `docs/decisions/0022-atmosphere-view-host.md`.
