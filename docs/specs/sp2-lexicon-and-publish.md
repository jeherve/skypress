# SP2 — Lexicon + two-record publish

- **Date:** 2026-06-08
- **Status:** ✅ Complete — verified end-to-end with a real account (see Outcome)
- **Goal (brief §1, §3, §9.3):** On publish, write the writer's content to their PDS as a
  `site.standard.document` (block tree in `content` + `textContent`), create their
  `site.standard.publication` if missing, and post a companion `app.bsky.feed.post`
  linking to the public article. Define + document `blog.skypress.content.gutenberg`.

Design + verified lexicon shapes: [Decision 0005](../decisions/0005-lexicon-and-publish-model.md)
and [`lexicons/`](../../lexicons/README.md).

## Success criteria

1. **Lexicon defined + documented** (`lexicons/`). ✅ (done up front)
2. **Pure record builders** produce valid `site.standard.publication`,
   `site.standard.document` (with the Gutenberg content object + `textContent`), and
   `app.bsky.feed.post` records — unit-tested.
3. **Publisher** orchestrates via the `Agent`: ensure-publication (list/reuse or create),
   create post, create document with `bskyPostRef`. Returns the document URI, post URI,
   and canonical article URL.
4. **Write scope**: the dev loopback client requests `atproto transition:generic` so
   `createRecord` is authorized (one re-auth).
5. **Publish UI**: title field + publish action that **unmistakably states it also posts
   to Bluesky** (brief §10) and requires confirmation; shows result links.
6. **Live-verified**: publishing a test article to a real account creates the records and
   a real Bluesky post (consent given).

## Architecture

```
src/lib/publish/
  records.ts        PURE, TESTABLE: slugify, canonical URLs, build {content, document,
                    publication, bskyPost} record objects
  records.test.ts   Vitest unit tests (written first)
  publisher.ts      browser: ensurePublication() + publish() via the Agent
src/components/
  PublishPanel.tsx  title input + "Publish" + Bluesky-post disclosure/confirm + result
  Studio.tsx        lifts block state from SkyEditor; renders PublishPanel when signed in
src/lib/auth/oauth.ts   loopback client_id now carries scope = OAUTH_SCOPE (writes)
```

## TDD plan (pure `records.ts`)

- `slugify('Hello, World!')` → `hello-world`
- `articlePath(slug)` → `/hello-world`; `publicationHomeUrl(handle)` →
  `https://skypress.blog/<handle>`; `canonicalArticleUrl(handle, slug)`
- `buildContentObject(blocks)` → `{ $type, version:1, blocks }`
- `buildDocumentRecord(...)` → required `site`/`title`/`publishedAt`, embeds content +
  textContent + bskyPostRef
- `buildPublicationRecord(...)` → required `url`/`name`
- `buildBskyPost(...)` → text + createdAt + `app.bsky.embed.external` → article URL

## Out of scope for SP2

Edit / re-publish (SP5), cover-image & inline-image blobs (SP3), the live reading page at
the canonical URL + link tags (SP4), granular per-collection scopes, self-hosted handle
resolver.

## Outcome (2026-06-08)

Verified by publishing twice to a **real** account (`jeherve.com`). Records fetched back
from the PDS (`com.atproto.repo.getRecord`) confirm:

| Check | Result |
|---|---|
| 22 unit tests (config + records) | pass |
| `site.standard.document` created | `$type`, `site`, `title`, `path` (`/skypress-publication-test`), `publishedAt` all correct |
| Gutenberg `content` | `$type: blog.skypress.content.gutenberg`, `version: 1`, block tree stored as **clean JSON** (rich-text → plain string — `normalizeBlocks` works) |
| `textContent` | correct plain text |
| `app.bsky.feed.post` | created (real Bluesky post), `app.bsky.embed.external` → canonical article URL; PDS validated it |
| `bskyPostRef` | document points back at the post (`{uri, cid}`) |
| publication | reused SkyPress's own (`url: https://skypress.blog/jeherve.com`), exactly one |

**Bug found & fixed by the live test:** the account already had 3
`site.standard.publication` records from other standard.site tools. `ensurePublication`
originally reused `records[0]` (a foreign publication with a `localhost` URL), wrongly
attaching the document to it. Fixed to match SkyPress's own publication by `url`
(`publicationHomeUrl(handle)`), creating one only if absent.

**Notes:**
- Write access uses `atproto transition:generic`; wiring it into the dev loopback
  client_id required a one-time re-auth. The handle now resolves (the broader scope
  grants the appview `getProfile` read).
- Two test articles + posts now exist on the account (consented). A delete/unpublish flow
  comes with the edit work (SP5); meanwhile they can be removed via Bluesky.
- The Bluesky link card will only render richly once the reading page is live with the
  `site.standard` `<link>` tags (SP4) and the app is deployed (SP7).
