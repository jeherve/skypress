# Publish success pill

**Date:** 2026-06-10
**Status:** Approved (brainstorm)

## Goal

After a writer publishes (or updates) an article, give them a clear, glanceable
confirmation that the process finished — plus a one-click link to the live
article. Today there is **no visible indicator** for a new publish.

## Current state — and the bug

- `PublishPanel` (`src/components/PublishPanel.tsx`) already models a success
  phase: `phase === 'done'` renders a "Published ✓ / Updated ✓" message with the
  article URL (`PublishPanel.tsx:223`).
- `Studio` (`src/components/Studio.tsx:182`) wraps `PublishPanel` (and the rest
  of the editor) in `<div key={editorKey}>`, where
  `editorKey = editing ? 'edit-${rkey}' : 'new-${refreshKey}'`
  (`Studio.tsx:150`).
- On a **new** publish, `onComplete` calls `setRefreshKey(k => k + 1)`
  (`Studio.tsx:204`) to reset the editor to a blank canvas. That bumps
  `refreshKey` → changes `editorKey` → **remounts the whole subtree, including
  `PublishPanel`** → its `phase` resets to `'idle'`.
- Net effect: for a new article the success state is destroyed the instant it's
  created. (Editing works — `edit-${rkey}` doesn't depend on `refreshKey`, so the
  panel survives and "Updated ✓" shows.) This is the root cause of "no indicator
  the publication process finished."
- Both `publish()` and `updateDocument()` already return `{ articleUrl }`
  (`src/lib/publish/publisher.ts:51,205`), so the live URL is available without
  new plumbing below the panel.
- Theme tokens for the sunrise callback already exist: `--sun` (`#e8920c`),
  `--sun-strong`, `--sun-tint`, `--ember`, and a sunrise radial-gradient pattern
  in `global.css:170`.

## Decisions locked during brainstorm

1. **Lift the success state above the remount boundary.** The indicator moves
   from `PublishPanel` up to `Studio`, rendered *outside* `<div key={editorKey}>`
   so it survives the post-publish reset.
2. **`onComplete` carries a payload.** Change the prop from `() => void` to
   `onComplete?({ articleUrl: string; isEditing: boolean }) => void`. `Studio`
   stores it in `published` state and renders the pill from it.
3. **Remove the in-panel `done` block** from `PublishPanel` (and the now-unused
   `resultUrl` state). For new articles it never showed; for edits it would
   duplicate the pill. `PublishPanel` keeps owning `confirm` / `working` /
   `error`. The button-visibility condition already covers `phase === 'done'`, so
   the Update button re-enables correctly after an edit.
4. **Pill placement:** the `studio__mode` top-chrome bar, where the publish
   action lives — visible and outside the keyed div.
5. **Pill is a small presentational component** (`PublishedPill`) so it is
   trivially unit-testable. `Studio` owns the state; the pill owns the markup.
6. **Copy (short, plain, no AI-isms):**
   - New publish: `🌅 It's live` · `Read it →`
   - Update: `🌅 Updated` · `Read it →`
   The sunrise emoji carries the playfulness; the words just state what happened.
   `Read it →` is an inline link to `articleUrl`.
7. **Sunrise styling:** a soft `--sun-tint` → `--sun` gradient, rounded ("pill")
   shape, warm — not the conventional green success chip. Entrance is a gentle
   "rise" (translateY + fade, ~400ms) nodding to a sunrise, gated behind
   `@media (prefers-reduced-motion: reduce)`.
8. **Persistence (chosen behavior A):** the pill stays until the writer
   - publishes again (replaced by the next pill),
   - clicks **+ New article** (`startNew`), or
   - **starts typing a new title or subtitle**.
   Wired by calling `setPublished(null)` in the existing title/lede `onChange`
   handlers and in `startNew`. The programmatic reset after publish
   (`setTitle('')`) does **not** flow through `onChange`, so it won't clear the
   pill it just set. The pill is **not** tied to `SkyEditor`'s block `onChange`
   (which can fire programmatically on remount and would race the reset).

## Components & data flow

```
publish()/updateDocument() ──{ articleUrl }──▶ PublishPanel.run()
        │
        └─ onComplete({ articleUrl, isEditing })
                   │
                   ▼
   Studio: setPublished({ url, isEditing })   ← state lives ABOVE the keyed div
                   │
                   ▼
   <PublishedPill url isEditing />  (rendered in studio__mode bar)
                   ▲
   cleared by: title/lede onChange, startNew, next publish
```

## Testing (TDD — failing test first)

- **`PublishedPill` unit test** (new): renders the new-publish copy + a `Read it →`
  link pointing at the URL; renders the update copy for `isEditing`.
- **`PublishPanel.test.tsx`** (extend): clicking Publish / Update calls
  `onComplete` with `{ articleUrl, isEditing }` (the regression contract that the
  URL now travels upward).
- **`Studio` wiring** ("survives remount / clears on typing") lives in an
  auth-gated component with no test harness today. Covered indirectly by the two
  tests above; a full `Studio` integration test is out of scope unless requested.

## Out of scope

- Consuming `articleUrl` anywhere else (OG tags, dashboard) — separate follow-ups.
- Toasts / auto-dismiss timing — behavior A is persistent-until-acted-on.
- Any change to the publish/update network flow.
