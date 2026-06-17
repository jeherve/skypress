# Writing-first flow — design

**Date:** 2026-06-17
**Status:** Design — approved, pending spec review
**Branch:** `chicago-v2`

## Summary

An alternative entry experience for SkyPress where **writing is the first thing you do**.
Today the flow is login-first: `/` is a marketing landing page and the editor at `/editor`
gates the entire writing surface behind `status === 'signed-in'`. This design inverts that:
the writer lands directly on an editor, starts writing immediately, and only encounters
auth and publication selection at publish time.

This ships as a **parallel experience** at a new route — `/`, `/editor`, and `/dashboard`
are left untouched so the two funnels can be compared side by side.

## Goals

- A writer can land on a page and start writing with zero friction — no login gate.
- Authentication is deferred to publish time and resumes the publish flow automatically
  after the OAuth redirect round-trip.
- Image insertion works while signed out; uploads are deferred to publish.
- Publishing branches sensibly on how many publications the writer owns (one / many / zero).
- A returning, already-signed-in writer gets a small account pill but the editor stays the
  focus.

## Non-goals

- **Not** a replacement for the current landing page or `/editor`. This is option B
  (parallel route), explicitly for comparison.
- **No remote account creation.** atproto OAuth is a sign-in protocol; a third-party client
  cannot create accounts on a big PDS, and SkyPress must never become a PDS/signup broker
  (product guardrail). We surface only a lightweight "Need an account? →" link to Bluesky's
  hosted signup.
- **New-document only.** This is a "start writing" funnel. Editing an existing article stays
  on `/editor` (`Studio`). No `?edit=<rkey>` load path here.
- **No inline publication management.** Creating/editing publications in general stays on the
  existing `/dashboard`. The one exception is a focused inline "create your first publication"
  step inside the zero-publication publish branch.

## Decisions (from brainstorming)

| # | Decision |
|---|----------|
| Q1 | Positioning: **parallel route** (`/write`), existing routes untouched. |
| Q2 | Account creation: **sign-in only** for now, with a "Need an account? →" link to Bluesky signup. No real create-account branch. |
| Q3 | Images signed-out: **insert freely, upload silently at publish** (invisible deferral). |
| Q4a | Single-publication publish: **always show a lightweight confirm** ("Publish to *Name* — also posts to Bluesky"), never silent auto-publish. |
| Q4b | Zero-publication publish: **inline create-publication step** (reuse `PublicationForm`), not a redirect to `/dashboard`. |
| Q5 | Signed-in pill: **links out to existing `/dashboard`** for management; pill itself is the only new account surface. |
| Q6 | Media: **always defer (one path)** — hold locally and upload at publish regardless of auth state. |

## User journey

### Signed-out writer
1. Lands on `/write` → clean editor (title, lede, blocks, cover). No gate.
2. Writes; inserts images (held locally, previewed inline).
3. Clicks **Publish** → draft + images persisted locally, `publishIntent` set → OAuth redirect.
4. Returns signed in → draft restored, `publishIntent` detected → publish flow auto-resumes,
   branching on publication count (see below).
5. Success → draft cleared, published pill/link shown.

### Already-signed-in writer
1. Lands on `/write` → same editor, plus an **account pill** (avatar + handle) top-right.
2. Clicks **Publish** → no redirect; publish flow runs in place, same branching.

### Publish branching (after auth is guaranteed)
- **Exactly one publication** → "Publish to *Name* (also posts to Bluesky)" confirm →
  upload held images → commit document + Bluesky post.
- **More than one** → publication picker step → confirm → publish.
- **Zero** → inline "create your first publication" step (`PublicationForm`) → publish.

## Architecture

### Route & island
- New page `src/pages/write.astro` mounting a client-only island **`WriteStudio`**.
- `WriteStudio` wraps `AuthProvider` (reused) but, unlike `Studio`, **renders the editor for
  every auth status** (`loading` / `signed-out` / `signed-in`). There is no login gate.
- The OAuth `redirect_uri` is the current pathname (existing `oauth.ts` behavior), so a
  sign-in initiated from `/write` returns to `/write` automatically. No new redirect config.

### Top-right corner states
- **Signed out:** a "Sign in" affordance + a small "Need an account? →" link to Bluesky
  signup. Reuses the existing handle-input / `signIn()` path from `AuthProvider`.
- **Signed in:** the **account pill** — avatar + handle opening a menu: *Manage publications*
  (→ `/dashboard`), *Profile*, *Sign out*.

### Draft persistence (survives the OAuth redirect)
Sign-in is a full-page redirect that destroys in-memory state, so before any redirect we
persist a **single draft slot**:
- **localStorage** — title, lede, serialized blocks, cover ref/preview, and a `publishIntent`
  flag.
- **IndexedDB** — held image bytes (data URLs can exceed localStorage quota), keyed so blocks
  can reference them on restore.

On `/write` load we **auto-restore** the draft if present. After a successful publish we
**clear** both stores. Abandoned drafts persist for the next visit.

### Deferred media (one path)
A new **local-hold media handler** replaces the eager PDS-upload handler for this flow, used
regardless of auth state:
- On insert: store image bytes in IndexedDB, render an inline preview (data URL), and record
  the mapping (preview → held key) in the in-memory blob registry.
- At publish: for every held image, `agent.uploadBlob()` → real `BlobRef`, then reuse the
  existing `attachBlobRefs()` registry mechanism to swap preview URLs for blob refs before the
  document record commits.
- Errors surface at publish (acceptable trade-off vs. eager-upload early feedback).

### Publish-flow stepper
A small state machine driven by `publishIntent` + publication count:
- `idle` → (Publish clicked) → persist + maybe-redirect → `resolving-auth`
- `resolving-auth` → (signed in) → `branch`
- `branch` → one of `confirm-single` / `pick` / `create-pub`
- any terminal step → upload images → `publish()` (document + post) → `done` (clear draft).

Reuses `publisher.ts` (`publish`), `publications.ts` (`listPublications`, `createPublication`),
`PublicationForm`, and the published-pill UI.

## Reuse vs. build

**Reuse (unchanged):** `AuthProvider`, `oauth.ts`, `SkyEditor`, `PublicationForm`,
`publisher.ts` (`publish`), `publications.ts`, `attachBlobRefs`, published-pill UI.

**Build new:**
- `src/pages/write.astro` route.
- `WriteStudio` island (editor for all auth states; corner state; publish stepper host).
- Local-hold media handler.
- Draft-persistence module (localStorage + IndexedDB; save / restore / clear).
- Account pill / signed-out corner component.
- Publish-flow stepper component (confirm / pick / create-pub) driven by `publishIntent`.

**Untouched:** `/` (`index.astro`), `/editor` (`Studio`), `/dashboard`.

## Testing

- Colocated page tests under `src/pages/` MUST be underscore-prefixed (e.g.
  `_write.meta.test.ts`) per the Astro file-router constraint.
- Draft persistence: save → simulate reload → restore yields identical editor state
  (title/lede/blocks/cover); clear empties both stores.
- Deferred media: held images survive a persist/restore round-trip; at publish each held
  image is uploaded once and its preview URL is swapped for the blob ref before commit.
- Publish branching: one / many / zero publications each route to the correct step; the
  single-publication case still shows a confirm (never silent).
- Resume-after-redirect: a `publishIntent` present on load auto-resumes the publish flow
  rather than dropping into the editor.
- `WriteStudio` renders the editor for `loading`, `signed-out`, and `signed-in` (no gate).

## Open questions

None outstanding. Durable rationale (e.g. the deferred-media single-path choice and the
no-remote-account-creation constraint) should graduate to a `docs/decisions/NNNN-*.md` during
implementation.
