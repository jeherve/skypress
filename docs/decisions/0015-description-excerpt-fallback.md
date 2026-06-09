# 0015 — Editor lede field + publish-time description excerpt fallback

- **Status:** Accepted
- **Date:** 2026-06-09
- **Scope:** The editor's new lede/excerpt field (`Studio.tsx` → `PublishPanel.tsx`), the
  publish flow's `description` (Decision 0005), and the reader's `og:description`
  (`[author]/[slug]/[rkey].astro`). Design: `docs/superpowers/specs/2026-06-09-editor-lede-excerpt-design.md`.

## Context

The companion Bluesky post (and its standard.site link card) showed an **empty description**
whenever the writer didn't supply one: the editor had no description field at all, so
`PublishPanel` never passed `description`, and the document record + `app.bsky.embed.external`
were written with none / `""`. Observed live on
`app.bsky.feed.post/3mnur47pyns27` (`"description": ""`).

Lexicon limits researched (2026-06-09): Bluesky's `app.bsky.embed.external.description` is an
**unconstrained string** (no `maxLength`/`maxGraphemes`); Bluesky's composer doesn't expose it
(it auto-fills from `og:description`). `site.standard.document.description` is optional with
`maxLength: 30000` / `maxGraphemes: 3000` and guidance "a brief description or excerpt." Neither
recommends a display length; the repo's own house convention is ~200 chars (the reader's
`og:description` and RSS both derive a 200-char excerpt).

## Decision

1. **A visible lede field**, not an invisible auto-derivation. A controlled, auto-growing italic
   `<textarea class="studio__lede">` sits under the title (echoing it: display face, borderless,
   but quieter), value held as Studio's `excerpt` state and passed to `PublishPanel` as the
   `description` prop. `maxLength={ 3000 }` guards the standard.site grapheme ceiling so a publish
   is never rejected; a soft `> 200` hint warns about Bluesky-card truncation without blocking.
2. **Publish-time fallback, written into the record.** The publisher is the single source of
   truth: `description = input.description?.trim() || deriveExcerpt( textContent )`, used for
   **both** the document record and the Bluesky embed. A blank lede therefore yields a real,
   stored description (not just a rendered-meta fallback) — so the card, the publication
   article-list blurb, and `og:description` are all populated.
3. **One shared excerpt convention.** `deriveExcerpt` (`src/lib/publish/excerpt.ts`, pure,
   dependency-free per Decision 0003) collapses whitespace, cuts on a word boundary at ≤ 200
   chars, and appends an ellipsis. The reader's legacy fallback (`doc.description ||
   deriveExcerpt(textContent)`) uses the same helper, replacing the old ad-hoc
   `textContent.slice(0, 200)`, so the convention can't drift.

## Why a visible field over silent auto-derivation

The first instinct was to auto-generate `og:description` from body text. A visible lede is
better: it gives the writer control over the share blurb (the reference tool, `pckt.blog`,
auto-derives but offers no control), surfaces the behaviour (placeholder: "defaults to the
opening of your post"), and still degrades to the auto-excerpt when left blank. Writing the
derived value **into the record** (not deriving only at render) keeps the document, the Bluesky
card, and the reader meta consistent, and means the standard.site card an external AppView
renders is never empty.

## Notes / non-goals

- The *image* half of the same bare-card bug (a content image over the 1 MB `thumb` cap) is
  separate — see Decision 0014 and `2026-06-09-bsky-post-thumb-design.md`.
- Edits (`updateDocument`) refresh the stored description but don't re-post; the original
  Bluesky post keeps its description (the panel already warns the preview may not refresh).
- RSS keeps its own 200-char fallback for now; a later pass could re-point it at `deriveExcerpt`.
- No lexicon change: `description` already exists on both records.
