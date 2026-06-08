# 0002 — Curated block allowlist (the content model)

- **Status:** Accepted (initial set; will be revisited in the editor sub-project)
- **Date:** 2026-06-08
- **Scope:** Editor (`iso.blocks.allowBlocks`) and the render/serialize path

## Context

Gutenberg ships ~90+ core blocks, most of them WordPress-specific (`core/query`,
`core/post-template`, `core/navigation`, `core/site-title`, comment/widget blocks, …)
that make no sense without WordPress behind them (brief §4). Allowing them would surface
broken or meaningless UI and bloat the serializer's surface area. The brief is explicit:
**"Designing SkyPress's allowlist *is* defining its content model."**

## Decision

Ship a deliberately small, writing-focused allowlist. Initial set:

| Block | Purpose |
|---|---|
| `core/paragraph` | Body text |
| `core/heading` | Structure |
| `core/image` | Inline imagery (blob-backed in SP3) |
| `core/gallery` | Grouped imagery |
| `core/quote` | Block quotes |
| `core/pullquote` | Editorial emphasis |
| `core/list` + `core/list-item` | Ordered/unordered lists |
| `core/code` | Code (syntax highlighting added later) |
| `core/separator` | Section breaks |
| `core/embed` | External media (oEmbed) |

Excluded for v1: everything WordPress-/CMS-specific, plus blocks deferred until they earn
their place (table, columns, cover, buttons, media-text). The set is intentionally
conservative — easier to *add* a block than to support, serialize, and render one forever
under the lexicon's frozen-constraints discipline (brief §3).

## Why

- A small set keeps the `blog.skypress.content.gutenberg` content schema (SP2) tight and
  its serialization surface auditable.
- Matches the "calm, focused writing studio" north star (brief §1) — not a page builder.
- Smaller allowlist → smaller serializer test matrix → faster, safer iteration.
- Tree-shaking the render path is easier when the allowed set is explicit.

## Consequences

- `core/list` requires also allowing its inner `core/list-item` (nested block).
- `core/embed` introduces external network dependencies on the reading page — revisit
  privacy/perf handling when SP4 hardens the renderer.
- Adding blocks later is safe; removing a block after content exists is a breaking change
  for stored records, so additions must be deliberate.
