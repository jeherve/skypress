# 0019 — Editor @mentions and Bluesky mention notifications

- **Status:** Accepted
- **Date:** 2026-06-12
- **Scope:** the `skypress/mention` rich-text format, the companion `app.bsky.feed.post`
  (Decision 0005 / 0013 publish flow), `collectMentions`/`buildBskyPost`
  (`src/lib/publish/records.ts`), the reader render + sanitizer, and `PublishPanel`

## Context

Writers want to mention atproto users in an article and have those users notified.
Bluesky only generates a mention notification when it indexes an `app.bsky.feed.post`
whose `facets` contain `app.bsky.richtext.facet#mention`; the AppView indexes per
collection and never scans custom records (`site.standard.document`) for facets.

## Decision

- **Notifications ride the companion post.** Publish appends a `cc @a @b` line (plus the
  writer's lede) to the `app.bsky.feed.post` body and attaches a `#mention` facet per
  handle. A facet on the document record would be inert.
- **Storage is inline.** Mentions are a registered `skypress/mention` rich-text format
  serializing to `<a class="skypress-mention" href="https://bsky.app/profile/{handle}"
  data-did="{did}">@{handle}</a>`. This is the single source of truth; `collectMentions`
  derives the cc list and the document's flat `mentions` list from it at publish.
- **Link target is Bluesky.** Correct for every mentionable user; no SkyPress-profile 404s.
- **Interop is the inline anchors + a flat `mentions` list** on
  `blog.skypress.content.gutenberg`, not a byte-offset facet (no flat-text host fits our
  block content model). The reader renders the mention from the inline anchor; the
  sanitizer keeps `class` + `href` and strips `data-did`.
- **Body only.** Lede-field mentions, edit-time notifications, and SkyPress-internal
  mention links are out of scope.

## Consequences

- The post body can approach Bluesky's 300-grapheme limit; PublishPanel shows a live count
  and blocks publish over the limit, with a backstop guard in `buildBskyPost`.
- Adding the format means a `render.ts` fidelity assertion and a sanitizer lock test.
- DIDs are resolved once, at pick time, and baked into the block — publish never
  re-resolves.
