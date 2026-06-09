# 0015 — Reader social actions write `app.bsky.feed.*` (not `site.standard.*`)

- **Status:** Accepted
- **Date:** 2026-06-09
- **Scope:** The first write-path feature on the *reading* side — like / repost / quote /
  reply on a published article (design
  `docs/superpowers/specs/2026-06-09-social-actions-on-posts-design.md`).

## Context

The brief asked whether reader replies could be **unlimited-length, block-editor-authored**,
and written as a `site.standard.*` record (the lexicon family used for publications +
documents), while *also* appearing as a reply under the companion Bluesky post that publish
already creates (Decision 0005 / 0013).

Research against the canonical lexicons (2026-06-09) showed these goals are mutually
exclusive:

1. **Only `app.bsky.*` records thread / federate on Bluesky.** The Bluesky AppView is a
   Lexicon-specific indexer; it materialises only `app.bsky.*` collections into threads,
   like/repost counts, and notifications. A `site.standard.*` (or any non-`app.bsky`) record
   is never indexed into a bsky thread — which is exactly why `site.standard` has **no**
   comment/reply type and instead carries `bskyPostRef` to delegate comments to a companion
   `app.bsky.feed.post`.
2. **`app.bsky.feed.post.text` is hard-capped at `maxGraphemes: 300`.** There is no
   sanctioned threaded longform — whitewind / leaflet longform records don't thread either;
   they live off-thread behind a short companion post.

## Decision

Reader actions are **native `app.bsky.feed.*` records targeting the article's companion
post** by its strongRef (`bskyPostRef`, Decision 0013). A reply that should show on Bluesky
**must** be an `app.bsky.feed.post`; it is therefore capped at 300 graphemes, and the block
editor is **not** reused for replies — a plain composer with an `Intl.Segmenter` grapheme
counter is used instead.

- **like** → `app.bsky.feed.like` `{ subject, createdAt }`
- **repost** → `app.bsky.feed.repost` `{ subject, createdAt }`
- **reply** → `app.bsky.feed.post` `{ text, createdAt, reply: { root, parent } }` — the
  companion post is the thread origin, so `root === parent === bskyPostRef`.
- **quote** → `app.bsky.feed.post` `{ text, createdAt, embed: { $type:
  'app.bsky.embed.record', record: bskyPostRef } }` — a standalone post, not threaded.

`unlike` / `unrepost` delete the viewer's own like/repost record (atproto has no native
"unlike"); the record URI to delete comes from `app.bsky.feed.getPosts`' `viewer.like` /
`viewer.repost`, which also drives counts + active button state.

No SkyPress lexicon change — these are Bluesky-native records, not part of `site.standard.*`
or `blog.skypress.*`.

## Consequences

- **No new OAuth scope:** the existing `transition:generic` (`OAUTH_SCOPE`) already
  authorizes writing `app.bsky.feed.*`. Granular `repo:app.bsky.feed.*` scopes are a later
  tightening (Decision 0005's scope-narrowing note).
- **Auth on the read path:** the article page mounts a `client:only` `PostActions` island
  wrapping the existing `AuthProvider`; the OAuth redirect returns to the article URL. The
  read path still imports **no** `@wordpress/*` (Decision 0003) — the island uses only
  `@atproto/api` + the OAuth client.
- **No CSRF surface added:** all writes go browser → the reader's own PDS over OAuth/DPoP;
  there is no SkyPress server write endpoint. Rate-limiting / abuse is the PDS's concern.
- **Legacy documents without `bskyPostRef`** (pre–Decision 0013, or a failed third write)
  render no action bar — there is no Bluesky thread to act on.
- **"Don't surprise users" (brief §10):** the UI states, in both signed-out and signed-in
  states, that actions are public and happen on Bluesky.

## Out of scope (v1)

Inline rendering of the reply thread (we link out to Bluesky), rich-text facets (clickable
links/mentions) in replies, and the granular `repo:app.bsky.feed.*` scopes.
