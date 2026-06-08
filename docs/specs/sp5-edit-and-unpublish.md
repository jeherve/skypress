# SP5 — Edit flow + unpublish

- **Date:** 2026-06-08
- **Status:** Implemented + unit/build-verified. **Live edit/unpublish round-trip pending
  a re-auth** (a chrome-profile reset cleared the session mid-test).
- **Goal (brief §3, §9.6):** Resolve the "puppy problem" — let writers edit a published
  article and unpublish it.

Decision: [0008](../decisions/0008-edit-semantics.md) — mutate in place (`putRecord`,
same rkey), stamp `updatedAt`, preserve `publishedAt` + `bskyPostRef`, no new Bluesky
post; unpublish deletes the document + its post.

## What was built

- `publisher.updateDocument` — `putRecord` on the same rkey with `updatedAt`, preserving
  `publishedAt`/`bskyPostRef`. No new post.
- `publisher.unpublish` — `deleteRecord` the document + its companion `app.bsky.feed.post`.
- `publisher.listMyArticles` — the writer's SkyPress documents (scoped to their
  publication), including stored blocks for editing.
- `SkyEditor` loads existing content via `onLoad(parse) => parse(serialize(blocks))`.
- `MyArticles` — list with Edit / Unpublish (confirm before deleting).
- `PublishPanel` gains an update mode ("Update", no Bluesky-post confirmation).
- `Studio` lifts edit state, re-mounts the editor/panel per article, offers "+ New
  article".
- Reading page shows "updated <date>" when `updatedAt` is present.
- `buildDocumentRecord` gained an optional `updatedAt` (unit-tested).

## Verified

- 37 Vitest tests green (incl. `updatedAt` preserve-publishedAt); `astro check` clean;
  production build green.

## Pending (needs a signed-in session)

1. Edit an existing article → confirm the document updates at the **same rkey**,
   `updatedAt` is set, `publishedAt`/`bskyPostRef` preserved, content changed, and **no new
   Bluesky post** is created.
2. Unpublish → confirm both the document and its Bluesky post are deleted (also clears the
   accumulated test articles).

The publish path this builds on (SP2) is live-proven; `updateDocument`/`unpublish` use the
same `agent.com.atproto.repo.*` surface (`putRecord`/`deleteRecord`).

## Out of scope

Versioned history records, draft persistence with images, brand/design (SP6), deploy (SP7).
