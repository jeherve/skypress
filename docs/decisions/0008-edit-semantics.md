# 0008 — Edit semantics (the "puppy problem")

- **Status:** Accepted
- **Date:** 2026-06-08
- **Scope:** SP5 — editing and unpublishing a published article

## Context (brief §3)

Bluesky deliberately does **not** auto-refresh stale embeds. When a writer edits a
published article, the brief asks us to choose and justify one of:

1. **Mutate** the existing record — simple, but silently changes shared context (anyone
   who saw/shared the old version now sees new content under the same link).
2. **Create a new record** — preserves an audit trail, but loses URL stability (the
   article gets a new rkey → a new URL; old links/cards break).
3. **Version with explicit "edited" markers** — mutate, but be transparent about it.

## Decision

**Mutate the existing record (option 1 + 3): `putRecord` on the same rkey, with an
explicit `updatedAt` and an "Updated" marker on the reading page.**

- **URL stability wins.** SkyPress URLs are `…/@<handle>/<rkey>` (Decision 0005/0006), and
  the Bluesky post embeds that URL. Creating a new record would orphan the post's link
  card and every shared link. Mutating keeps the one canonical URL working.
- **Transparency mitigates the silent-change downside.** We set `updatedAt` on edit and
  the reader shows "Updated <date>" alongside "Published <date>". Honest about edits
  without breaking links.
- **No new Bluesky post on edit.** Publishing creates the social post once; editing must
  not spam the timeline. The original post keeps pointing at the (now-updated) article;
  its card stays stale by Bluesky's design — that's the accepted "puppy problem" cost of
  option 1, made visible by the `updatedAt` marker.
- **`publishedAt` and `bskyPostRef` are preserved** across edits (only `content`,
  `textContent`, `title`, `description`, `updatedAt` change).

A future, heavier option (versioned history records) is left open by the lexicon's
open-ended design, but is not warranted for v1.

## Unpublish / delete

Deleting an article removes **both** records it owns: the `site.standard.document` and the
companion `app.bsky.feed.post` (via `deleteRecord`). The `site.standard.publication` is
left intact (it may front other articles). Blobs become unreferenced and the PDS
garbage-collects them in time. The UI confirms before deleting, since the Bluesky post
disappears too.

## Consequences

- Editing requires loading a stored article back into the editor: stored `BlockNode[]`
  → `@wordpress/blocks.serialize()` → the editor's `onLoad(parse)`. Core blocks are
  globally registered by the time `onLoad` runs, so this round-trips.
- `updatedAt` is additive to the lexicon (already a `site.standard.document` field) — no
  schema change.
