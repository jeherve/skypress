# 0016. Per-article cover image picker

**Status:** Accepted
**Date:** 2026-06-10

## Context

Until now the Bluesky card thumb was auto-derived from the first usable content
image (`firstImageBlobRef`, Decision 0014), and articles had no explicit cover.
The standard `site.standard.document` lexicon already defines an optional
`coverImage` blob field (`image/*`, ≤1MB) that was never populated (deferred in
Decisions 0006 and 0014).

## Decision

Add a per-article cover image picker as a strip BELOW the block editor (outside
the editor canvas). It reuses the existing `mediaUpload` + blob-registry path
(no second isolated-block-editor instance) and writes the chosen blob to
`site.standard.document.coverImage`.

Thumb resolution becomes: explicit `coverImage` → `firstImageBlobRef(blocks)` →
omit. The auto-pick is now the fallback, so nothing regresses for articles
without an explicit cover.

The 1MB cap (equal to `BSKY_THUMB_MAX_BYTES` and the lexicon `maxSize`) is
surfaced in the picker UI as helper text and as the oversize rejection message.

## Consequences

- Covers persist on the document, survive edits (re-previewed via `getBlob`), and
  become available to future reading-page/OG/RSS surfaces (still unwired —
  separate follow-up; see the 2026-06-09 OG design which deferred this field).
- This partially supersedes Decision 0014: the first-image pick is retained only
  as the fallback when no explicit cover is set.
- Consuming `coverImage` on the reading page / OG tags remains out of scope.
