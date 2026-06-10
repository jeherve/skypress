# 0016 — Read routes delegate orchestration to the read-context module

- **Status:** Accepted
- **Date:** 2026-06-10
- **Scope:** the public read path (`src/pages/[author]/**`, `src/lib/reader/read-context.ts`)

## Context

Every read route (author index, publication home, article, RSS) hand-assembled the same
resolution spine in its frontmatter: strip the `@` from the URL param, resolve
handle → DID → PDS (Decision 0007), match a publication by slug, join documents by
`value.site === publication.uri` (Decision 0010), and map each miss to an error scene.
That was ~230 near-duplicate lines across four files, and the join key, the 100-document
fetch bound, and the blob-ref → logo-URL construction were caller knowledge repeated
3–4×. Because the orchestration lived in `.astro` frontmatter, it could only be "tested"
by regex pins against the page source (see rule 8 in AGENTS.md for why container
rendering is out).

## Decision

One deep module, `src/lib/reader/read-context.ts`, owns the spine behind three entry
points — `resolveAuthorContext`, `resolvePublicationContext`, `resolveArticleContext` —
each returning `{ ok: true, context }` or `{ ok: false, error: ErrorSceneCopy }`.

- **Pages keep only presentation.** A new read surface (AMP, embeds, …) must call the
  read-context interface, not re-assemble `resolveAuthor` + slug-match + site-join.
- The module returns publications with `logoUrl` prebuilt, so callers never touch
  `BlobRefJson` internals.
- The per-route independent fetches (profile, publication list, documents/record) run
  in parallel inside the module; the old pages ran them serially.
- The article render pipeline (`resolveBlobImageUrls → renderBlocks →
  sanitizeArticleHtml`) deliberately stays in the article page / feed builder — sealing
  it behind its own interface is a separate, orthogonal deepening. *(Since done:
  Decision 0018 sealed it behind `src/lib/reader/render-article.ts`.)*
- The shallow wrappers this obsoleted (`listReaderPublications`,
  `resolveReaderPublication`) were deleted; `listAllReaderPublications` remains the one
  reader-side publication fetch.

## Consequences

- The orchestration is behaviourally unit-tested in `read-context.test.ts` (mocking only
  the network seam: `identity.ts` + `records.ts`); the colocated `_*.meta.test.ts` source
  pins shrank to template-wiring guards.
- On not-found paths the module may fetch slightly more than the old serial code did
  (the parallel fetches start before the publication match is known) — accepted for the
  happy-path latency win.
- RSS 404 bodies are now a uniform `Not found` instead of echoing the handle.
