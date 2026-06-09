# 0014 — Thumbnail (`embed.external.thumb`) on the companion Bluesky post

- **Status:** Accepted
- **Date:** 2026-06-09
- **Scope:** The `app.bsky.feed.post` SkyPress writes alongside each published document
  (Decision 0005 publish flow; link facet + `associatedRefs` added in Decision 0013).

## Context

Decision 0013 gave the companion post a clickable link facet and `associatedRefs` for the
rich standard.site card, but left `embed.external.thumb` unset (explicitly deferred). Without
a `thumb`, clients that don't resolve standard.site cards — and the default card before the
AppView resolves the refs — show no image. The reference post (`bsky.app/profile/pckt.blog`)
includes a `thumb` blob.

### What the references do (researched against live records + source, 2026-06-09)

- **pckt.blog**: `thumb` is a **dedicated, OG-shaped blob** (JPEG, 2000×1050, 1.91:1, 805 KB)
  — a *different CID* from the document's own `coverImage` (JPEG, 1200×630, 45 KB). The thumb
  CID is not present anywhere inside the referenced document. It is a purpose-built share card.
- **Leaflet** (`actions/.../publishBskyPost.ts`): sources a **cover image** (re-fetched from
  the PDS by CID) or a **server-rendered page screenshot**, then always `sharp`-resizes to
  1200×630 (`fit: cover`), re-encodes to webp q85, and `uploadBlob`s a **fresh** blob.

Shared pattern: a fresh, OG-cropped (1.91:1), re-encoded blob from a designated cover image,
with a screenshot fallback — done **server-side** (`sharp` + a screenshot service).

## Decision

Set `embed.external.thumb` to the **first uploaded content image's existing in-repo blob ref**
— `image/*`, `0 < size ≤ 1,000,000` bytes — selected depth-first from the document's block
tree. Omit `thumb` entirely when there is no usable uploaded image; the standard.site card
still renders via `associatedRefs`.

- `firstImageBlobRef(blocks)` (`src/lib/media/blob.ts`, pure) selects the ref; `BSKY_THUMB_MAX_BYTES`
  (1,000,000) encodes the post lexicon's thumb size cap.
- `buildBskyPost` (`src/lib/publish/records.ts`) gains an optional `thumb` field, included only
  when provided — `records.ts` stays free of `@atproto/*` (`thumb` is just a typed `BlobRefJson`).
- `publish` (`src/lib/publish/publisher.ts`) computes the thumb from the prepared blocks and
  passes it through. `updateDocument` is unchanged — edits never create a post.

### Why reuse the existing blob ref, not re-upload

atproto blobs are **content-addressed and repo-scoped**: re-uploading identical bytes yields
the *same CID*, so there is no separate "post-owned" copy — "ownership" is per-repo-by-CID, not
per-record. The Decision 0013 write order creates the **document first**, committing/retaining
the image blob, *before* the post — so the post can reference that same CID and the AppView
resolves `thumb` by `did + cid` from the PDS. (Leaflet re-uploads only to **OG-reshape**; its
cover blob already lives in the same PDS, confirming ownership is not the constraint.) Reuse
needs no `uploadBlob`, no byte-fetch, and therefore no SSRF guard.

## Consequences

- **Divergence from the references:** the thumb is the image at its native aspect ratio, which
  bsky.app center-crops into the ~1.91:1 card frame — no OG-shaping in v1. Acceptable; the card
  still gets a real image.
- **External images** (remote URL, no `skypressBlob`) are skipped — making a thumb from one
  would need a byte-fetch + the SSRF guard (`src/lib/net/safe-fetch.ts`), deferred.
- No SkyPress lexicon change: `thumb` is a Bluesky-native field on `app.bsky.feed.post`.
- Publish is still three PDS writes (Decision 0013); no extra round-trip for the thumb.

## Follow-ups (out of scope)

- Browser-canvas OG-crop (first image → 1200×630 → webp → fresh `uploadBlob`) for a proper
  1.91:1 card, matching pckt/Leaflet.
- A designated **cover-image** picker (the source the references prefer).
- Publication-`icon` fallback when no content image exists.
