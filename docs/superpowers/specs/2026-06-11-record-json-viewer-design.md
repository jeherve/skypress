# PDS record JSON viewer on single documents — design

**Date:** 2026-06-11
**Status:** Approved, ready for planning

## Goal

Add a small "code" icon at the end of the `reader__meta` eyebrow on the public
single-document reading page (`/@<handle>/<slug>/<rkey>`). Clicking it opens a modal
showing the exact PDS record body for that post as pretty-printed, syntax-highlighted
JSON. It's a read-only "view the raw record" affordance that builds directly on the
existing frontend syntax-highlighting work.

## Decisions (settled during brainstorming)

| Question | Choice |
| --- | --- |
| What JSON is shown | **The record `value` only** (the `com.skypress.*` document body), *not* the `{ uri, cid }` envelope |
| Source of the data | **The already-resolved `document.value`** on the read path — no extra fetch, no live re-fetch at click time |
| Display | **Modal/dialog overlay** with dimmed backdrop, matching the existing `PostActions` client-island pattern |
| Highlighting | **Reuse the server-side `highlight.js` setup** — pre-highlight on the server, ship ready HTML to the client (no `highlight.js` in the client bundle) |
| Copy button | **No** — view-only for now |

## Constraints that shaped the design

1. **Untrusted content (AGENTS.md rule 6).** The record `value` comes from arbitrary
   PDSes. The highlighted JSON HTML is injected into the DOM, so it MUST be sanitised
   before reaching the client — same order as the article path (highlight → sanitise).
2. **Reader pages never import `@wordpress/*` (Decision 0003).** The viewer is a plain
   React island (like `PostActions`), and highlighting stays in `highlight.ts`, the
   single home for `highlight.js` — neither touches `@wordpress/*`.
3. **`highlight.js` stays off the client.** The page is SSR (`prerender = false`), so
   the JSON is serialized + highlighted + sanitised server-side and the island receives
   a ready HTML string. No new client-side highlighting dependency.
4. **JS-only enhancement.** `client:only="react"` renders nothing until hydrated; the
   icon is absent without JS rather than showing a dead control.

## Architecture

### Server side — in `[rkey].astro`

At render time, with `document` already resolved on the read path:

```
JSON.stringify(document.value, null, 2)  →  highlightJson(...)  →  sanitizeArticleHtml(...)
```

1. Pretty-print the record body with two-space indentation.
2. `highlightJson` tokenises it as JSON (below).
3. `sanitizeArticleHtml` runs as the final step — the highlighter's
   `<span class="hljs-…">` output is already allowlisted by the sanitiser, and
   sanitise neutralises anything hostile that survived escaping.

The resulting HTML string is passed to the island as a prop.

### New export in `src/lib/reader/highlight.ts`

```ts
export function highlightJson( json: string ): string;
```

Behaviour:
- Runs `hljs.highlight( json, { language: 'json' } )` — `json` is already registered
  in this module's curated language set, so no new import.
- Returns `<code class="hljs language-json">${value}</code>` where `value` is
  highlight.js's already-escaped token HTML. (The `<pre>` wrapper is left to the
  island's markup so the modal controls its own chrome.)
- On a highlighter error, falls back to a plain entity-escaped `<code>` — never throws
  into the page render.

This reuses the existing module exactly as `highlightCodeBlocks` does; both share the
registered grammars and the established escape/fallback discipline.

### New client island — `src/components/RecordJsonViewer.tsx`

Mounted `client:only="react"` at the end of the `reader__meta` eyebrow (after
"· N min read"), mirroring how `PostActions` is wired in.

- **Prop**: `highlightedHtml: string` — the sanitised token markup.
- **Trigger**: an inline code icon (`</>`) button, `aria-label="View record JSON"`.
- **Modal**: a dialog with a dimmed backdrop showing the highlighted JSON in a
  scrollable `<pre>`. Dismisses on Esc, backdrop click, and an explicit close button;
  focus moves into the dialog on open and returns to the trigger on close.
- **Fallback slot**: empty (no icon until hydrated), matching `PostActions`' loading
  fallback — this is a JS-only enhancement.

### Styling — `src/styles/record-json.css`

A new global stylesheet imported in the page (the same way `post-actions.css` is),
prefixed `.record-json__*`, built from existing design tokens. Because the existing
`hljs-*` token theme in `[rkey].astro` is scoped to the article container, this
stylesheet carries the same token→`var(--…)` mapping scoped under `.record-json__code`
so the modal is self-contained and doesn't depend on article scope.

## Testing (TDD — failing tests first)

1. **`highlight.test.ts`** (extend): `highlightJson` emits `language-json` token markup
   for a normal record; a string value containing HTML / `</script>` stays escaped (no
   raw tags leak); an empty object is handled.
2. **`RecordJsonViewer.test.tsx`** (new): the icon button renders with its accessible
   label; the modal is absent initially; clicking opens it and the JSON content is
   shown; Esc / close button / backdrop each dismiss it; focus returns to the trigger.
3. **`RecordJsonViewer.presence.test.tsx`** (new, matching the `PostActions`
   convention): the island file exists and default-exports a component taking the
   expected prop.

## Out of scope

- Copy-to-clipboard, the `uri` / `cid` envelope, and re-fetching the live record from
  the PDS at click time.
- Any non-JS fallback view of the record.
- A language picker or showing other record types (publication, profile) — single
  document only.

## Durable rationale

If the "pre-highlight + sanitise the record JSON server-side, hand a ready HTML string
to a thin client island" pattern survives review, note it alongside the existing
highlighting decision (the prospective `docs/decisions/0019-*.md`) rather than as a
separate decision — it's the same highlight → sanitise invariant applied to a second
surface.
