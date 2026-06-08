# 0010 — Publication system: handle-namespaced URLs, frozen slugs, ownership, delete

- **Status:** Accepted
- **Date:** 2026-06-08
- **Scope:** SP10 — publication dashboard, creation flow, publication pages

## Context

SkyPress auto-created one invisible publication per user (name = handle, `url = /@handle`)
and matched it by URL. We now support **multiple, user-managed publications** with a
dashboard, logos, and publication-centric public pages. This forces decisions on the URL
model, slugs, which publications SkyPress "owns", and what deleting one does — all under the
brief's hard **no-database / no-KV** constraint.

## Decision

### 1. Handle-namespaced URLs (option A), no global slug registry

```
/@handle              author index
/@handle/{slug}       publication home
/@handle/{slug}/{rkey} document
```

A publication's `url` becomes `https://skypress.blog/@{handle}/{slug}`. Everything resolves
from the PDS: resolve handle → DID → PDS, list that one repo's publications, match by slug
segment. **No global registry** means subdomains (`slug.skypress.blog`) are explicitly out
for v1 (they'd need a KV/D1 registry + wildcard DNS — a separate sub-project).

### 2. Slugs are auto-derived and frozen

The slug is derived from the name at creation (`slugify`), de-duplicated **within the user's
own repo only** (`-2`, `-3`, …), and **frozen into `publication.url`**. Later name edits never
change it — URLs must never break (consistent with documents addressed by stable rkey,
Decisions 0005/0008). Empty/emoji-only names fall back to `pub-{rkey}` (the publication
record's own TID rkey is globally unique → no collision check). The rkey is generated up
front (`TID.nextStr()`, the publisher.ts pattern) so the fallback URL is known before the
record is written.

### 3. SkyPress only manages publications it owns (origin === SITE_BASE)

A user may hold `site.standard.publication` records from other tools sharing the lexicon
(Leaflet, etc.). SkyPress lists, edits, deletes, renders, and resolves **only** publications
whose `url` origin equals `SITE_BASE` (`isSkyPressPublicationUrl`). This keeps the dashboard
from offering to delete a foreign tool's publication, keeps slug resolution unambiguous, and
honours the lexicon's "additions only / don't touch others' data" discipline. The replaced
`ensurePublication` matched a single pub by exact URL for the same reason; this generalises it.

### 4. Publishing targets a chosen publication

`ensurePublication` (auto-create one pub per handle) is removed. `publish()` now takes the
target publication's `{ uri, slug }`; the editor presents a selector. A user with no
publication is sent to the dashboard to create one first. Resolution still verifies
`doc.site === publication.uri` so a document only renders under its true publication.

### 5. Deleting a publication cascades

Danger-zone delete removes the publication **and** its documents **and** each document's
companion `app.bsky.feed.post` (reusing `unpublish` semantics, Decision 0008), then the
publication record. The alternative — refusing to delete a non-empty publication — leaves
orphaned, unreachable documents in the PDS and is worse UX. The confirm dialog states exactly
how many articles and Bluesky posts will be removed, since this is destructive and outward-
facing. Blobs (logo, images) become unreferenced and the PDS garbage-collects them.

## Consequences

- `publicationHomeUrl(handle, slug)` and `canonicalArticleUrl(handle, slug, rkey)` change
  signatures; `records.test.ts` is updated (TDD).
- The reader route splits: `[author]/[slug]/index.astro` + `[author]/[slug]/[rkey].astro`;
  `[author]/[rkey].astro` is removed. No migration — skypress.blog is not yet live.
- `/@handle` becomes the author index, reviving the paused profile work: it reads
  `app.bsky.actor.profile` from the PDS directly (no Bluesky appview dependency) for
  name/bio/avatar/banner; those are rendered as **text**/images, never injected as HTML.
- Slug freezing means a renamed publication keeps a slug derived from its old name. Accepted:
  URL stability beats prettiness, and there is no slug registry to rename against.
