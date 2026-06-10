# Per-article cover image picker

**Date:** 2026-06-10
**Status:** Approved (brainstorm)

## Goal

Give creators an explicit way to choose the image that represents an article,
instead of silently using the first image found in the body. The picker lives
**outside** the block editor — a distinct strip directly below it — and writes
the chosen image to the standard `site.standard.document.coverImage` blob field.

## Current state

- `firstImageBlobRef(blocks)` (`src/lib/media/blob.ts:45`) walks the block tree
  depth-first and returns the first usable uploaded `core/image` blob ref
  (`image/*`, `0 < size ≤ BSKY_THUMB_MAX_BYTES` = 1,000,000 bytes).
- It is used in **exactly one place**: the companion Bluesky post's
  `embed.external.thumb` (`src/lib/publish/publisher.ts:115`). It is **not**
  stored on the document record.
- `site.standard.document` (external *standard.site* lexicon) **already defines**
  an optional `coverImage` blob field (`accept: image/*`, `maxSize: 1000000`).
  Persisting a cover is therefore lexicon-clean — a standard field, not a
  SkyPress addition, no `-v2`.
- Image uploads go through `createMediaUpload` (`src/lib/media/mediaUpload.ts:57`),
  which enforces `maxUploadFileSize`, uploads to the writer's PDS, and records
  `{ ref, url }` in the blob `registry` keyed by the preview `data:` URL.
- The editor layout (`Studio.tsx`) stacks: PublishPanel → title → lede → SkyEditor,
  all within a centered `--studio-measure` column (`editor-chrome.css`).

## Decisions locked during brainstorm

1. **Scope:** per-article cover image (not a publication-level banner).
2. **Fallback:** purely additive override. No explicit cover → fall back to
   `firstImageBlobRef()`. Nothing regresses for existing articles.
3. **Storage:** persist to `site.standard.document.coverImage`. It survives
   edits and unlocks future reading-page/OG use (consuming it elsewhere stays a
   separate follow-up).
4. **Build approach:** a lightweight custom React picker reusing the existing
   `createMediaUpload` handler + blob `registry` — **not** a second
   `IsolatedBlockEditor` instance.
5. **Max-size in UI:** surface the 1 MB cap as static helper text *and* as the
   rejection message for oversize files.
6. **Remove behavior (option b):** removing a cover shows a visible hint that the
   first body image will be used as the fallback, honoring the "don't surprise
   users" guardrail.

## Approach

### 1. Data model & state

- New `Studio.tsx` state: `cover: { ref: BlobRefJson; previewUrl: string } | null`.
- `PublishInput` (`src/lib/publish/publisher.ts`) gains `coverImage?: BlobRefJson`.
- `DocumentRecord` + `buildDocumentRecord` (`src/lib/publish/records.ts:180`) gain
  optional `coverImage`, spread-included only when set (same pattern as
  `description` / `bskyPostRef`).
- Threaded through **both** publish writes (initial create and the `bskyPostRef`
  update) and through the edit/`updateDocument` path.

### 2. Thumb resolution

`buildBskyPost` thumb argument becomes:

```
input.coverImage ?? firstImageBlobRef(input.blocks)
```

Today's behavior is the tail of this chain, so articles without an explicit
cover behave exactly as before.

### 3. `CoverImagePicker` component

- Rendered under `<SkyEditor>` in `Studio.tsx`, inside the same centered
  `--studio-measure` column, styled as a labeled "Cover image" strip distinct
  from the editor canvas.
- States:
  - **empty:** drop-zone + "Upload cover image" button + helper text
    "PNG/JPG/GIF, max 1 MB".
  - **uploading:** in-progress affordance.
  - **set:** preview thumbnail + "Replace" + "Remove".
- Upload reuses `createMediaUpload` (same PDS path as content images). On success
  it reads the resulting `BlobRefJson` from the `registry` by the returned
  preview key.
- Client-side size guard at 1 MB via the handler's existing `maxUploadFileSize`
  check; oversize files are rejected with an inline message naming the limit.
- **Remove** clears `cover` and shows the fallback hint ("No cover set — the
  first image in your article will be used").

### 4. Edit reload

- `getMyArticle` already returns the document. Read `coverImage` back and build a
  `getBlob` preview URL from the author DID + CID (same construction
  `resolveBlobImageUrls` uses) so an existing cover renders on edit. A
  committed cover blob is already referenced, so `getBlob` works directly (no
  `data:` URL needed for the edit-load case).

## Components / units

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `CoverImagePicker` (component) | UI: empty/uploading/set states, size error, remove hint | `createMediaUpload`, blob `registry`, pure helpers below |
| `validateCoverFile` (pure helper) | enforce `image/*` + ≤ 1 MB; return error string or ok | `BSKY_THUMB_MAX_BYTES` |
| `coverPreviewUrl` (pure helper) | `BlobRefJson` + DID + PDS → `getBlob` URL for edit-load preview | existing getBlob URL builder |
| `Studio.tsx` | owns `cover` state, passes `cover.ref` to PublishPanel | `CoverImagePicker`, `PublishPanel` |
| `buildDocumentRecord` / `DocumentRecord` | persist `coverImage` | `BlobRefJson` |
| `buildBskyPost` / `publisher` | cover-over-auto thumb resolution | `firstImageBlobRef` |

## Testing (TDD — failing tests first)

- `records.test.ts`: `coverImage` included when provided, omitted when not.
- `publisher.test.ts`: thumb prefers explicit cover; falls back to
  `firstImageBlobRef` when no cover; edit preserves the cover.
- `validateCoverFile`: 1 MB boundary (just under accepted, at/over rejected),
  non-image rejected.
- `coverPreviewUrl`: builds the expected `getBlob` URL from a ref.
- `CoverImagePicker` component test: empty → upload → preview → remove flow, and
  oversize rejection surfaces the limit message.

## Out of scope (YAGNI)

- Image cropping / OG-canvas generation.
- Wiring `coverImage` into the reading-page hero, OG/Twitter tags, or RSS — the
  field gets *populated*; consuming it stays a separate follow-up (now possible).
- Publication-level banner/cover (distinct from `publication.icon`).

## Follow-ups unlocked

- Reading-page hero image from `coverImage`.
- OG/Twitter `og:image` chain: `document.coverImage → publication.icon →
  /og-default.png` (extends the 2026-06-09 OG design, which deferred the
  per-article field).
