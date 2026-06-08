# SP3 — Image / blob pipeline

- **Date:** 2026-06-08
- **Status:** ✅ Complete — verified end-to-end with a real account (see Outcome)
- **Goal (brief §5, §9.4):** Bridge Gutenberg's URL-based media with atproto blobs:
  custom `mediaUpload` → `uploadBlob` → blob ref, store the ref in the document content
  so images are PDS-owned and portable.

Design: [Decision 0006](../decisions/0006-image-blob-pipeline.md).

## Success criteria

1. Inserting an image in the editor uploads it to the writer's PDS and previews via a
   local object URL (a just-uploaded, unreferenced blob can't be served by `getBlob` yet
   — see Decision 0006).
2. On publish, image blocks carry a proper `skypressBlob` ref (`{$type:'blob',…}`) in the
   stored `content`, keeping the blob in-use (not GC'd) and portable.
3. Pure helpers (`getBlob` URL builder, blob-ref attach transform) unit-tested.
4. Live-verified: upload an image, publish, confirm the blob exists on the PDS and the
   document content references it as a blob ref.

## Architecture

```
src/lib/media/
  blob.ts          PURE, TESTABLE: buildGetBlobUrl(), attachBlobRefs(blocks, lookup)
  blob.test.ts     Vitest unit tests (written first)
  pds.ts           browser: resolvePdsUrl(did) from the DID document
  mediaUpload.ts   browser: createMediaUpload({ agent, did, pdsUrl, registry })
  registerMediaUpload.ts  browser: disables the wp.media "Media Library" button
src/lib/auth/AuthProvider.tsx   resolves + exposes `pdsUrl` on sign-in
src/components/Studio.tsx       owns the blob registry; wires mediaUpload + publish
src/components/SkyEditor.tsx    accepts `mediaUpload`, sets settings.editor.mediaUpload
src/components/PublishPanel.tsx attachBlobRefs(blocks, registry) before publishing
```

## TDD plan (pure `blob.ts`)

- `buildGetBlobUrl(pds, did, cid)` → `<pds>/xrpc/com.atproto.sync.getBlob?did=…&cid=…`
- `attachBlobRefs(blocks, lookup)` sets `skypressBlob` on image blocks whose `url` resolves
  to an uploaded blob (via `lookup`), recursing inner blocks; leaves external images alone

## Out of scope for SP3

Reading-page reconstruction of blob URLs + sanitisation (SP4), a caching/resizing media
proxy, cover-image UI, ingesting remote URLs to blobs, persisting blob refs in drafts.

## Outcome (2026-06-08)

Verified by uploading an image in the editor and publishing to a **real** account.

| Check | Result |
|---|---|
| 25 unit tests (incl. blob helpers) | pass |
| Editor upload | `mediaUpload` → `uploadBlob` → image previews via a local object URL |
| Stored content | image block carries `skypressBlob` = `{$type:'blob', ref:{$link:'bafkrei…'}, mimeType:'image/png', size:70}` |
| Blob served | `getBlob` returns the bytes (200, 70 bytes) |
| **Blob in-use** | the CID appears in `com.atproto.sync.listBlobs` — referenced by the record, so **not garbage-collected** (the load-bearing reason to store a typed ref, Decision 0006) |

Notes: the editor curated inserter shows exactly the allowlist (Paragraph, Image,
Heading, Gallery, List, Quote). The reading page still renders the stored `url`; SP4 will
prefer `skypressBlob`, reconstruct `getBlob` from the article's DID + CID, and sanitise.
