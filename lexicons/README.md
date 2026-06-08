# SkyPress lexicons

SkyPress publishes to the AT Protocol using a mix of the community **`site.standard.*`**
lexicons (for the interoperable publication + document surface) and **one SkyPress-owned
lexicon** for the rich content format. This directory documents all of them — the records
a SkyPress publish writes, and exactly which fields it populates.

See [Decision 0005](../docs/decisions/0005-lexicon-and-publish-model.md) for the design
rationale.

## Ownership

| Lexicon | Owner | Why |
|---|---|---|
| `site.standard.publication` | community ([standard.site]) | interop — other readers (Leaflet, Pocketblog, pdsls, Bluesky cards) already speak it |
| `site.standard.document` | community ([standard.site]) | interop — the discoverable article surface |
| `blog.skypress.content.gutenberg` | **SkyPress** | the Gutenberg block-tree content format; reverse-DNS of `skypress.blog` |
| `app.bsky.feed.post` | Bluesky | the social signal (POSSE) |

We only own the content format. Publication/document metadata reuses `site.standard.*` so
SkyPress articles are discoverable beyond SkyPress.

## `blog.skypress.content.gutenberg` (ours)

Schema: [`blog.skypress.content.gutenberg.json`](./blog.skypress.content.gutenberg.json).

An object placed inside a document's open `content` union (`$type:
"blog.skypress.content.gutenberg"`):

| Field | Type | Notes |
|---|---|---|
| `version` | integer | Serialization version (currently `1`). Breaking changes ship as a new `$type` (…`gutenberg` v2), never a silent mutation. |
| `blocks` | array&lt;unknown&gt; | The block tree from `onSaveBlocks`: `[{ name, attributes, innerBlocks }]`. `name` is the Gutenberg block name (`core/paragraph`, …). |

Authoring discipline (brief §3, Paul Frazee guidance): optional fields, open unions,
additions-only; shipped constraints are frozen. Readers that don't understand this `$type`
fall back to the document's `textContent`.

## `site.standard.document` — fields SkyPress writes

Record key: **TID**. ([source](https://tangled.org/standard.site/lexicons))

| Field | Req | SkyPress value |
|---|---|---|
| `site` | ✓ | the writer's `site.standard.publication` `at://` URI (links doc↔publication for high-fidelity Bluesky cards) |
| `title` | ✓ | document title (≤500 graphemes) |
| `publishedAt` | ✓ | ISO datetime of publish |
| `path` | | `/<rkey>` — the document's own record key; combined with the publication `url` to form the canonical URL |
| `description` | | excerpt (optional) |
| `textContent` | | **de-facto required** — plain text from the block tree; Bluesky uses it for reading-time + search and ignores `content` |
| `content` | | open union — our `blog.skypress.content.gutenberg` object |
| `bskyPostRef` | | strongRef (`{uri, cid}`) to the companion Bluesky post |
| `updatedAt` | | reserved for the edit flow (SP5) |

## `site.standard.publication` — fields SkyPress writes

Record key: **TID** (not a `self` singleton — reused by listing existing records).

| Field | Req | SkyPress value |
|---|---|---|
| `url` | ✓ | `https://skypress.blog/@<handle>` — the writer's SkyPress homepage; canonical doc URL = `url` + document `path` = `…/@<handle>/<rkey>` |
| `name` | ✓ | publication name (defaults from the handle) |
| `description` | | optional |
| `icon` | | optional blob (≤1MB) |

## `app.bsky.feed.post` — the social signal

| Field | SkyPress value |
|---|---|
| `text` | a short blurb (title + note) |
| `createdAt` | ISO datetime |
| `embed` | `app.bsky.embed.external` → the canonical article URL, title, description |

## The publish flow

`ensure publication → create post (embed → article URL) → create document (content +
textContent + bskyPostRef)`. The document's rkey is generated up front
(`TID.nextStr()`), so the article URL (`/@<handle>/<rkey>`) is known before any write —
avoiding a circular dependency between the post and the document. Builders live in
[`src/lib/publish/records.ts`](../src/lib/publish/records.ts); orchestration in
[`publisher.ts`](../src/lib/publish/publisher.ts).

[standard.site]: https://tangled.org/standard.site/lexicons
