# Bluesky post embed thumbnail (`embed.external.thumb`) — design

- **Date:** 2026-06-09
- **Scope:** The companion `app.bsky.feed.post` SkyPress writes alongside each published
  document (Decision 0005 publish flow, extended by Decision 0013).
- **Decision doc:** `docs/decisions/0014-bsky-post-thumb.md` (to be written with the code).

## Problem

The companion Bluesky post already carries a clickable link facet + `associatedRefs` for
the rich standard.site card (Decision 0013), but no `embed.external.thumb` blob. Clients
that don't understand standard.site cards (and the default card before the AppView resolves
the refs) show no image. The reference post (`pckt.blog`) includes a `thumb` blob.

## What the references actually do (research, 2026-06-09)

- **pckt.blog**: `embed.external.thumb` is a **dedicated, OG-shaped blob** (JPEG, 2000×1050,
  1.91:1, 805 KB) — a *different CID* from the document's own `coverImage` (JPEG, 1200×630,
  45 KB). The thumb CID appears nowhere inside the referenced document. It is a purpose-built
  social-card image.
- **Leaflet** (`actions/.../publishBskyPost.ts`): sources a **cover image** (re-fetched from
  the PDS by CID) or, failing that, a **server-rendered page screenshot**, then *always*
  `sharp`-resizes to **1200×630 `fit: cover`**, re-encodes to **webp q85**, and
  `uploadBlob`s a **fresh** blob — `thumb: blob.data.blob`.

**Shared pattern:** a fresh, OG-cropped (1.91:1), re-encoded blob from a *designated cover
image*, with a screenshot fallback. Both do this **server-side** (Next.js + `sharp` +
screenshot service).

## Why SkyPress diverges (constraints)

SkyPress is a **browser public client** that publishes from the client, plus a **static
Cloudflare Workers renderer**. It has no server-side image pipeline (`sharp`, screenshots),
no `coverImage` concept on the document yet (Decision 0006 deferred it), and OG-image
generation is explicitly out of scope for v1. Full pckt/Leaflet parity = a cover-image
picker **and** an OG-card pipeline — a separate project.

Therefore v1 follows the *spirit* (give the card a real image blob), not the letter
(OG-shaped, freshly processed).

## Decision (v1)

Set `embed.external.thumb` to the **first uploaded content image's existing blob ref** —
no re-upload, no OG-shaping. Omit `thumb` entirely when the document has no usable uploaded
image (the card still renders via `associatedRefs`).

### Why reuse the existing blob ref (not re-upload)

atproto blobs are **content-addressed and repo-scoped**: re-uploading identical bytes yields
the *same CID*, so there is no separate "post-owned" copy — "ownership" is per-repo-by-CID,
not per-record. The publish order (Decision 0013) writes the **document first**, which
commits/retains the image blob, *before* the post is created — so the post can reference that
same CID and the AppView resolves `thumb` by `did + cid` from the PDS. (Leaflet re-uploads
only to **OG-reshape**, not for ownership; its cover blob already lives in the same PDS.)

The single divergence from the references: the thumb is the image at its native aspect ratio,
which bsky.app center-crops into the ~1.91:1 card frame. Acceptable for v1.

## Components

### 1. `src/lib/media/blob.ts` — `firstImageBlobRef` (pure, new)

```ts
/** bsky `app.bsky.embed.external` thumb constraint: image/*, ≤ 1,000,000 bytes. */
export const BSKY_THUMB_MAX_BYTES = 1_000_000;

/**
 * The blob ref to use as a companion Bluesky post's `embed.external.thumb`: the first
 * uploaded `core/image` block's `skypressBlob` (depth-first, innerBlocks included) that the
 * post lexicon will accept (`image/*`, 0 < size ≤ 1 MB). Returns undefined when there is no
 * usable uploaded image. Reuses `IMAGE_BLOCKS` + `normalizeBlobRefJson`.
 */
export function firstImageBlobRef( blocks: BlockNode[] ): BlobRefJson | undefined;
```

- Walks the tree depth-first. For each `core/image` block, normalises `attributes.skypressBlob`
  via `normalizeBlobRefJson` (defensive: handles both JSON and `BlobRef` shapes; drops refs
  with no CID). Accepts it only if `mimeType` starts with `image/` **and**
  `0 < size ≤ BSKY_THUMB_MAX_BYTES`. Returns the first acceptable ref.
- External images (no `skypressBlob`) and non-image blocks are skipped — making a thumb from a
  remote URL would need byte-fetch + the SSRF guard, deferred.

### 2. `src/lib/publish/records.ts` — typed `thumb` field (stays pure)

- `BskyPostRecord.embed.external.thumb?: BlobRefJson`.
- `buildBskyPost` input gains `thumb?: BlobRefJson`; the field is included in `external` only
  when provided (same conditional-spread style as `associatedRefs`). No `@atproto/*` import.

### 3. `src/lib/publish/publisher.ts` — wiring (no `uploadBlob`)

- In `publish()`: `const thumb = firstImageBlobRef( input.blocks );` then pass `thumb` to
  `buildBskyPost`. `input.blocks` is already `attachBlobRefs`-prepared by `PublishPanel`, so
  `skypressBlob` is present on session-uploaded images.
- `updateDocument()` unchanged — edits never create a post.

## Testing (TDD — failing test first)

- **`blob.test.ts` / `firstImageBlobRef`:** first `core/image` ref returned; recurses into
  `innerBlocks`; picks the *first* usable when several; skips images without `skypressBlob`;
  skips non-image blocks; skips `size > 1 MB`; skips non-`image/*` mimeType; `undefined` when
  none usable.
- **`records.test.ts` / `buildBskyPost`:** includes `embed.external.thumb` when a ref is
  passed; omits the `thumb` key otherwise.
- **`publisher.test.ts` / `publish`:** with blocks containing a usable uploaded image, the
  created post's `embed.external.thumb` equals that image's blob ref; with no usable image, the
  created post has no `thumb` key.

## Out of scope / follow-ups

- Browser-canvas OG-crop (draw first image → 1200×630 → webp → fresh `uploadBlob`) for a
  proper 1.91:1 card.
- A designated **cover-image** picker (the source pckt/Leaflet prefer).
- Publication-`icon` fallback when no content image exists.
- No SkyPress lexicon change: `thumb` is a Bluesky-native field on `app.bsky.feed.post`.
