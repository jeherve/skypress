# 0024 — Preserve the image blob ref through the edit round-trip

- **Status:** Accepted
- **Date:** 2026-07-08
- **Scope:** `src/lib/blocks/serialize.ts`, `src/lib/media/blob.ts` (the `skypressBlob`
  attribute), the editor's edit-load path (`SkyEditor` `toEditorBlocks`).

## Context

The publish flow attaches a typed atproto blob ref to each uploaded image as a custom
`core/image` attribute, `skypressBlob` (`attachBlobRefs`, `src/lib/media/blob.ts`). That
ref (`{ $type: 'blob', ref: { $link: cid }, … }`) is the **only** thing in a stored
document that references an inline image blob — the block's `url` is a plain `getBlob`
string, not a typed ref.

In atproto a blob stays alive only while some record references it as a typed blob; the PDS
recomputes referenced blobs on every commit and garbage-collects the rest. So the document
MUST keep carrying `skypressBlob` for the image to keep resolving.

Reloading a published document for editing rebuilds each block with `createBlock`
(`SkyEditor`'s `toEditorBlocks`). `createBlock` (and `parse`) sanitise attributes down to
the block type's **registered** schema. `skypressBlob` is not a core attribute, so it was
silently dropped on load. On re-publish the image block went back to storage with only its
`url`; the PDS then had no reference to the blob and deleted it on the update commit. Result:
edit a post with images → the images 404 (`Blob not found`) even though the block is still
in the record.

## Decision

Register `skypressBlob` as a `core/image` attribute so it survives the parse/`createBlock`
round-trip. `registerSkyPressBlocks()` adds a `blocks.registerBlockType` filter (before
`registerCoreBlocks()`) that extends `core/image`'s attributes with
`skypressBlob: { type: 'object' }`. This also covers `core/image` nested in `core/gallery`.

Once registered, the full edit→publish chain preserves it: `toEditorBlocks` (`createBlock`)
keeps it → `normalizeBlocks` copies it → `attachBlobRefs` leaves it (session-upload lookup
misses, attribute already present) → `buildDocumentRecord` stores it → the PDS keeps the
blob.

## Why not the alternatives

- **Re-attach `skypressBlob` after `createBlock` in `toEditorBlocks`** — works, but is
  fragile: any editor-internal block re-creation (transforms, duplication) would strip it
  again. Registering the attribute fixes it at the source, once.
- **Store the ref as a core attribute the block already has** — there isn't one; the
  portable blob identity is SkyPress-specific.

## Consequences / notes

- The attribute is **default-unset**, so `serialize()` never emits it for images that don't
  have one. The dependency-free `render.ts` and its fidelity lock (Decision 0002/§4) are
  unaffected — `skypressBlob` is metadata, never rendered to HTML.
- This does not recover blobs already garbage-collected by a pre-fix edit; those images must
  be re-uploaded.
- Regression test: `src/lib/blocks/serialize.test.ts` asserts `createBlock('core/image', …)`
  keeps `skypressBlob`.
