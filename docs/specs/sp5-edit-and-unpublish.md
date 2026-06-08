# SP5 — Edit flow + unpublish

- **Date:** 2026-06-08
- **Status:** ✅ Complete — verified live against a real account.
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

## Live verification (2026-06-08)

- **Edit:** loaded "Record-key URLs" into the editor, changed the title, Update →
  document updated at the **same rkey** (`/3mnrkcsdflc24`), `updatedAt` set,
  `publishedAt` + `bskyPostRef` + content **preserved**, **no new Bluesky post**.
- **Unpublish:** "Image blob test" → both the `site.standard.document` and its
  `app.bsky.feed.post` returned 400 (deleted) and it left the list.

**Fix during verification:** loading stored content into the editor must rebuild block
instances with `createBlock` (returned from `onLoad`); serializing raw stored nodes
produced empty markup (no `isValid`/instance fields). `SkyEditor.toEditorBlocks` does this.

## Out of scope

Versioned history records, draft persistence with images, brand/design (SP6), deploy (SP7).
