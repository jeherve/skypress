# SP10 — Publication system (dashboard + creation flow + publication pages)

- **Status:** Built
- **Depends on:** SP2 (lexicon/publish), SP3 (blob pipeline), SP4 (public renderer), SP5 (edit/unpublish)
- **Decisions:** 0010 (URL model + slug + ownership + delete semantics)

## Goal

Turn SkyPress's single invisible auto-publication into a real, user-managed
**publication system**: a dashboard, a create/edit flow (name, logo, description), multiple
publications per user, a handle-namespaced URL model, and publication-centric public pages.
`/@handle` becomes an author index.

Everything resolves from the PDS — **no database, no KV, no global slug registry** (brief §2).

## URL model (Decision 0010)

```
skypress.blog/@handle                  → author index (the author's SkyPress publications)
skypress.blog/@handle/{slug}           → a publication's home (its article list + identity)
skypress.blog/@handle/{slug}/{rkey}    → a single document within that publication
```

Falls out of `standard.site`: document URL = `publication.url` + `document.path`.
- `publication.url` = `https://skypress.blog/@{handle}/{slug}` (was `…/@{handle}`).
- `document.path` stays `/{rkey}` (unchanged `articlePath`).

Resolving `/@handle/{slug}/{rkey}`:
1. `resolveAuthor(handle)` → `{ did, pdsUrl }`.
2. `listRecords(site.standard.publication)` for that repo; keep only **SkyPress-origin**
   publications (`url` origin === `SITE_BASE`); pick the one whose url slug segment === `{slug}`.
3. `getRecord` the document by rkey; **verify `doc.site === publication.uri`**.

## Slug rules (Decision 0010)

- Auto-derived from the name at creation, never user-entered.
- `slugify`: NFKD-normalise → lowercase → trim → spaces→`-` → strip to `[a-z0-9-]` →
  collapse/trim dashes.
- Uniqueness **within the user's own repo only** (their existing SkyPress pub slugs); on
  collision append `-2`, `-3`, …
- **Frozen at creation** — baked into `publication.url`; name edits never change it.
- Empty/emoji-only name → fallback `pub-{rkey}` (rkey of the publication record, globally
  unique, so no collision check needed).

## Lexicon additions (`site.standard.publication`)

Add the optional `icon` blob (the logo, ≤1MB, `image/*`). `theme`/`basicTheme`/`preferences`
remain out of scope. Additions only; treat shipped fields as frozen.

## Work breakdown

- **A. records.ts** — `PublicationRecord.icon`; slug in `url`; `publicationHomeUrl(handle, slug)`;
  `canonicalArticleUrl(handle, slug, rkey)`; pure `slugify` + `uniquePublicationSlug` +
  `publicationSlugFromUrl` + `isSkyPressPublicationUrl`. (TDD)
- **B. publications.ts** — `createPublication` / `listPublications` / `updatePublication` /
  `deletePublication` (cascade). Replace `ensurePublication`: `publish()` targets a **chosen**
  publication. (TDD with a mock Agent)
- **C. Logo upload** — `uploadImageBlob(agent, file)` reusing the blob pipeline; client-side
  ≤1MB / `image/*` enforcement.
- **D. Dashboard island** — `src/pages/dashboard.astro` → `Dashboard.tsx` (authed, client-only,
  no `@wordpress/*`). Lists publications + "New publication".
- **E. Create/edit UI** — `PublicationForm.tsx` (name, logo, description); edit preserves the
  frozen slug.
- **F. Routing** — `[author]/[slug]/[rkey].astro` (doc) + `[author]/[slug]/index.astro` (pub
  page); update document template links + head tags. Remove `[author]/[rkey].astro`.
- **G. `/@handle` author index** — list the author's SkyPress publications + profile hero
  (avatar/bio/cover) read from `app.bsky.actor.profile` on the PDS directly (no appview).
- **H. Migration** — none needed; skypress.blog is not live yet (§7 of the handoff).

## Guardrails (AGENTS.md + decisions)

No DB/KV. React 18 only; reading pages never import `@wordpress/*`. SSRF guard on every
user-derived server fetch. Sanitise PDS HTML; profile/pub name+description are plain text.
Keep the Bluesky-post disclosure on publish. License GPL-2.0-or-later.
