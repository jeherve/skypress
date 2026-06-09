# 0006 — Image / blob pipeline

- **Status:** Accepted
- **Date:** 2026-06-08
- **Scope:** SP3 (uploads). Reconstructing blob URLs on the reading page is SP4.

## The conflict (brief §5)

Gutenberg blocks reference media **by URL**. AT Protocol stores media as **blobs** on
the PDS (`com.atproto.repo.uploadBlob` → a typed blob ref; served via
`com.atproto.sync.getBlob?did=…&cid=…`). The editor wants a URL; the network wants a
blob ref. Bridging them is a named goal.

## Decision

Use Gutenberg's stable **`mediaUpload`** seam (passed through
`settings.editor.mediaUpload`, which `isolated-block-editor` forwards to the
`BlockEditorProvider`). On file insert:

1. Upload to the writer's PDS: `agent.uploadBlob(file, { encoding: file.type })` →
   `BlobRef`.
2. Hand the editor a **`data:` URL** (`FileReader.readAsDataURL(file)`) via
   `onFileChange([{ url, alt }])` so the image previews immediately. **No `id`** — PDS
   blobs aren't WP attachments; an `id` makes the Image block fetch `/wp/v2/media/<id>`,
   which 404s.
3. **Retain the blob ref + the canonical `getBlob` URL** in an in-memory registry keyed
   by the object URL.

### Preview via a `data:` URL, not the live `getBlob` URL (corrected 2026-06-08)
A just-uploaded blob is **unreferenced** (temporary on the PDS) until a record commits a
reference to it; `com.atproto.sync.getBlob` fails for it (observed: **500** on a
bsky.network PDS). So the original "preview from the live `getBlob` URL" plan below is
wrong for in-editor preview — it only resolves *after* publish. We preview from a `data:`
URL instead, and `attachBlobRefs` rewrites that transient `data:` URL to the canonical
`getBlob` URL at publish (so the stored record stays portable, never a dead preview URL).
The reader (SP4) still reconstructs the URL from `skypressBlob` + the author's current PDS.

### Why a `data:` URL and NOT a `blob:` object URL (corrected 2026-06-09)
The first cut used `URL.createObjectURL(file)`, a `blob:` URL. That **hangs the editor**:
the Image block (`@wordpress/block-library@9.24.0`) treats *any* `blob:` URL as a
still-uploading image — it sets `temporaryURL` (`is-transient` + a `<Spinner/>`) and runs
`useUploadMediaFromBlobURL`, which re-invokes `mediaUpload` for the file behind that URL
and only clears the transient state when `onChange` returns a **non-`blob:`** URL. Stock
WordPress satisfies this by calling `onFileChange` twice (temporary `blob:`, then the
final `http(s)` URL+id); our handler calls it once. Handing back another `blob:` URL means
the spinner never clears (and `uploadBlob` may fire twice). A `data:` URL is not a `blob:`
URL, so the block renders it as an ordinary inline image immediately — no transient state,
no re-upload loop. (Unit tests assert the preview is a `data:` URL and never `blob:`.)

A `data:` URL is a plain string (no `File` pinned in memory), so there is nothing to
revoke; `revokeBlobRegistry` just clears the map at teardown — switching/starting an
article and Studio unmount — so a later article can't resolve a stale preview at publish.
The trade-off is that `data:` URLs are base64, so they bloat the block tree and the
localStorage draft; a large image can approach the ~5MB localStorage quota. Acceptable for
v1 — drafts-with-images is already a known stopgap (see Consequences) — and revisited if
quota becomes a real problem (e.g. strip preview URLs from the persisted draft).

The "Media Library" button (Gutenberg's `editor.MediaUpload`, which opens the legacy
`wp.media` Backbone frame) is **disabled** via a filter override — SkyPress has no media
library; uploads go straight to the PDS through the Upload/drop-zone path. See
`src/lib/media/registerMediaUpload.ts`.

At **publish**, `attachBlobRefs` walks the block tree and, for every image whose `url` is
one we uploaded, writes the blob ref (`BlobRef.ipld()` →
`{$type:'blob',ref:{$link:cid},mimeType,size}`) onto the block as a `skypressBlob`
attribute inside the document `content`.

### Why store the blob ref, not just the URL (brief §5)
- **Garbage collection:** a PDS deletes blobs not referenced by any record *as a typed
  blob ref*. Storing the raw `getBlob` URL (a string) would NOT keep the blob alive;
  embedding the proper `{$type:'blob',…}` object does. This is the load-bearing reason.
- **Portability:** the `getBlob` URL hard-codes the current PDS host; the blob ref (CID)
  is stable. The reader (SP4) reconstructs the URL from the document's DID + the CID,
  resolving the writer's *current* PDS — so the image survives a PDS migration.

### In-editor URL strategy
Local object URL for preview; the canonical `getBlob` URL (not a SkyPress media proxy) is
persisted at publish. A caching/resizing proxy through the edge is a later optimisation
(brief §5).

### Externally-URL'd images
Allowed **as-is** for v1 (no `skypressBlob`, just their `url`). Only files added through
`mediaUpload` are ingested to blobs. Ingesting remote URLs to blobs is a later option.

### Size/format
Enforce the editor's `allowedTypes` (images) and surface `maxUploadFileSize` errors via
`onError`. The document `coverImage` (≤1MB, brief §3) reuses `uploadBlob` — deferred
until a cover-image UI exists.

## Consequences / limits

- The registry is **in-memory (per session)**. Upload-then-publish in one session works.
  A reloaded draft that still references earlier uploads would lose the refs — drafts
  with images need the refs persisted too (future; SP0's localStorage draft is a stopgap).
- The reading page currently renders the stored `url`; SP4 will prefer `skypressBlob`,
  reconstruct `getBlob` from the article's DID + CID, and **sanitise** image URLs.
- `getBlob` requires the writer's PDS URL — resolved once from the DID document at
  sign-in and kept in the auth context.
