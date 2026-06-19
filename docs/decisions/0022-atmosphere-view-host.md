# 0022 — View records on mu.social, not bsky.app

## Context

SkyPress publishes to the Bluesky/atproto network, but it also links readers out to
an AppView to *view* profiles, posts, and hashtags. Those links pointed at `bsky.app`
and were marked with the Bluesky butterfly.

## Decision

- View-links (author profile, bio mentions/hashtags, editor-inserted mentions, post
  "view" links, sign-in account creation) point at `mu.social`, a Bluesky AppView with
  the same `/profile`, `/profile/<did>/post/<rkey>`, and `/hashtag` path scheme.
- The host lives in one place: `src/lib/social/atmosphere-url.ts`.
- Link labels/aria say "the ATmosphere". Network/protocol copy ("creates a public
  Bluesky post", `app.bsky.feed.post`) stays "Bluesky" — it describes the real network.
- The butterfly icon is replaced by the 🌀 emoji.
- `public.api.bsky.app` API calls are unchanged — mu.social does not serve that data API.

## Consequences

- `src/lib/publish/mentions.ts` `PROFILE_RE` accepts both `bsky.app` and `mu.social`, so
  mentions in drafts saved before this change still get cc'd on the companion post.
- Already-published articles keep the `bsky.app` mention links stored in their content;
  only newly authored mentions use `mu.social`.
- Changing the AppView again is a one-line edit to `ATMOSPHERE_WEB_BASE`.
