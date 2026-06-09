# Editor lede / excerpt field + description fallback — design

- **Date:** 2026-06-09
- **Scope:** The editor writing surface (`Studio.tsx`), the publish flow
  (`PublishPanel.tsx` → `publisher.ts` → `records.ts`), and the single-post reader's
  `og:description` (`[author]/[slug]/[rkey].astro`).
- **Related:** `docs/superpowers/specs/2026-06-09-bsky-post-thumb-design.md` (the *image*
  half of the same bare-card bug — tracked separately, not in scope here).

## Problem

A published article's companion Bluesky post (and its standard.site link card) shows an
**empty description** whenever the writer didn't supply one. The editor has **no field**
for a description/excerpt at all, so `PublishPanel` never passes `description` to
`publish()`. The result: `site.standard.document.description` is omitted, and the
`app.bsky.embed.external.description` is written as `""` — a bare card.

Observed live: `at://did:plc:e6grv4cc6jxdhnjo22szkayq/app.bsky.feed.post/3mnur47pyns27`
has `"description": ""` and no `thumb`.

## What the lexicons say (research, 2026-06-09)

- **Bluesky** (`app.bsky.embed.external#external.description`): plain `string`, **no
  `maxLength` / `maxGraphemes`**. The bsky composer doesn't let users edit it — it
  auto-fills from the link's `og:description`. The card UI truncates visually (~2–3 lines).
- **standard.site** (`site.standard.document.description`): optional `string`,
  **`maxLength: 30000` / `maxGraphemes: 3000`**, guidance *"A brief description or excerpt
  from the document."* The 3000-grapheme cap is a hard ceiling, not a style recommendation.
- **House convention** is the real signal: SkyPress already derives a ~200-char excerpt
  everywhere it needs one — the single-post reader uses `textContent.slice(0, 200)`
  (`[rkey].astro:89`) and the RSS feed uses a "200-char `textContent` fallback" (sp11).

Neither spec recommends a display length; "brief" + the ~200-char house convention guide
the field design.

## What's already wired (no change needed)

The single-post page already prefers the document's stored description for its social meta:

```js
// [author]/[slug]/[rkey].astro:89
description = doc.description || textContent.slice( 0, 200 );
// → buildMetaTags({ description, … }) → og:description + twitter:description
```

So **`og:description` uses the stored `description` automatically** the moment we write the
lede into the PDS record. The two requirements ("og:description uses the field" + "auto-
generate when empty") therefore collapse into one real change: **do the empty fallback at
publish time, persisted into the record**, rather than leaving it to the reader's ad-hoc
slice.

## Decision

1. Add a visible **lede** field to the editor.
2. Persist it as the document's `description` and the Bluesky embed's `description`.
3. When it's empty, **derive an excerpt from the post text at publish time** and write that
   derived value into *both* records (so the stored record — not just the rendered meta —
   carries a description). One shared helper, ~200 chars, used by the publisher and the
   reader's legacy fallback so the convention never diverges.

## Components

### 1. `src/lib/publish/excerpt.ts` — `deriveExcerpt` (pure, new)

```ts
/**
 * A brief plain-text excerpt for a document/card description. Collapses whitespace, cuts on
 * a word boundary at or before `maxChars`, and appends an ellipsis when truncated. Returns
 * '' for empty/whitespace input. Pure + dependency-free — safe for the server reader and the
 * browser publisher alike (read path must not pull browser-only deps, AGENTS.md §3).
 */
export function deriveExcerpt( text: string, maxChars = 200 ): string;
```

- `200` matches the house convention. No `@wordpress/*` / network — unit-testable.

### 2. `src/lib/publish/publisher.ts` — publish-time fallback (single source of truth)

`publish()` already computes `const textContent = blocksToText( input.blocks )`. Add:

```ts
const description = input.description?.trim() || deriveExcerpt( textContent );
```

Pass this one `description` into **both** `buildDocumentRecord` and `buildBskyPost`. Same
treatment in `updateDocument()` (it recomputes `textContent`), so an edited article's stored
`description` stays populated even if the writer clears the lede. (Update never creates a
post — the original card keeps its old description, as the panel already warns.)

`records.ts` is unchanged: `buildDocumentRecord` still conditionally includes `description`
(now near-always truthy), and `buildBskyPost` still writes `description ?? ''` (now near-
always non-empty). When `textContent` is itself empty (e.g. image-only post), the derived
excerpt is `''` and behaviour matches today.

### 3. `src/components/PublishPanel.tsx` — pass the lede through

- New prop `description: string` (the raw lede from Studio). Passed verbatim into
  `publish()` / `updateDocument()` as `description` — the publisher owns trim + fallback, so
  the panel stays dumb. No validation gate (an empty lede publishes fine, as today).

### 4. `src/components/Studio.tsx` — the lede field

- New state `const [ excerpt, setExcerpt ] = useState( '' )`.
- Hydrate on edit-load: `setExcerpt( article.description ?? '' )` (currently
  `MyArticle.description` is fetched but dropped).
- Reset to `''` in `startNew()` and in the new-publish branch of `onComplete`.
- Render a `<textarea class="studio__lede">` **between** the title `<input>` and `<SkyEditor>`.
  Pass `excerpt` to `<PublishPanel description={ excerpt } />`.
- `maxLength={ 3000 }` as a cheap guard against standard.site's `maxGraphemes: 3000` ceiling
  (a publish-time lexicon rejection otherwise). A lede never approaches this; the soft hint
  keeps writers near ~200.

### 5. `src/components/Studio.tsx` (cont.) / `editor-chrome.css` — styling + auto-grow

- `.studio__lede`: same column/width/gutter as `.studio__title`; `--font-display`,
  borderless, transparent background; smaller (`~1.2rem`), **italic**, `--muted` colour;
  `resize: none; overflow: hidden`. Placeholder *"Add a lede… (defaults to the opening of
  your post)"* makes the auto-fill discoverable.
- Auto-grow: a tiny ref + handler setting `el.style.height = 'auto'; el.style.height =
  el.scrollHeight + 'px'` on input and on hydrate.
- A soft, non-blocking hint shown when length exceeds ~200 (e.g. *"Long ledes get truncated
  on the Bluesky card."*). `aria`-friendly; never disables publish.

### 6. `[author]/[slug]/[rkey].astro` — unify the reader's fallback

Replace `textContent.slice( 0, 200 )` (line 89) with `deriveExcerpt( textContent )`, so the
legacy-document fallback (docs published before this feature carry no `description`) matches
the new publish-time logic — one excerpt convention, word-boundary + ellipsis everywhere.

## Data flow

```
Studio.excerpt ──prop──▶ PublishPanel.description ──▶ publish()/updateDocument()
                                                          │
                          description = excerpt.trim() || deriveExcerpt(textContent)
                                                          ├──▶ buildDocumentRecord → site.standard.document.description
                                                          └──▶ buildBskyPost      → app.bsky.embed.external.description
                                                                                          │
reader [rkey].astro: doc.description (||deriveExcerpt for legacy) ──▶ og:/twitter:description
```

## Testing (TDD — failing test first)

- **`excerpt.test.ts` / `deriveExcerpt`:** empty/whitespace → `''`; short text returned
  whole, no ellipsis; long text cut on a word boundary `≤ maxChars` with a trailing ellipsis;
  whitespace collapsed; custom `maxChars` honoured.
- **`publisher.test.ts` / `publish`:** empty `description` → both the document record and the
  created post carry `deriveExcerpt(textContent)`; non-empty `description` → both carry the
  trimmed lede verbatim; empty text + empty lede → no document `description`, post
  `description: ''`.
- **`publisher.test.ts` / `updateDocument`:** empty `description` → updated record carries the
  derived excerpt.
- **Reader meta** (`_[rkey].meta.test.ts`, colocated + underscore-prefixed per AGENTS.md §8):
  `og:description` uses `doc.description` when present, else `deriveExcerpt(textContent)`.
- `records.test.ts` / `meta.test.ts`: unchanged contracts still pass.

## Out of scope / follow-ups

- The **image/thumb** half of the bare-card bug (1.9 MB content image > the 1 MB
  `embed.external.thumb` cap) — see `2026-06-09-bsky-post-thumb-design.md`.
- **Live preview** of the auto-derived excerpt in the editor — the placeholder sets the
  expectation; a live preview would need Studio to hold live `textContent`.
- **RSS** already has its own 200-char `textContent` fallback (sp11). Left as-is; a candidate
  to re-point at `deriveExcerpt` later for full convention unity.
- No SkyPress lexicon change: `description` already exists on `site.standard.document` and
  `app.bsky.embed.external`.
