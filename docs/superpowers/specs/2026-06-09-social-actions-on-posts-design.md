# Social actions on published articles (like / repost / quote / reply) — design

- **Date:** 2026-06-09
- **Scope:** The public reader article page (`src/pages/[author]/[slug]/[rkey].astro`).
  Adds the first **write-path / interactive** feature on the reading side; reading pages
  were anonymous and read-only until now.
- **Decision doc:** `docs/decisions/0015-social-actions-on-posts.md` (to be written with
  the code) — records the record-type / unlimited-length resolution below.

## Problem

Readers can read a SkyPress article but cannot react to it. We want like, repost,
quote-repost, and reply surfaced at the bottom of every post, and a reader's reply should
appear on Bluesky as a reply under the **companion `app.bsky.feed.post`** that publishing
already creates alongside each document (Decision 0005 / 0013).

## Research that settled the open questions (2026-06-09, verified against canonical lexicons)

The brief asked whether replies could be unlimited-length, block-editor-authored, and
written as a `site.standard.*` record. Research closed all three:

1. **Only `app.bsky.*` records thread/federate on Bluesky.** The Bluesky AppView is a
   Lexicon-specific indexer; it materialises only `app.bsky.*` collections into threads,
   like/repost counts, and notifications. A `site.standard.*` (or any non-`app.bsky`)
   record is never indexed into a bsky thread — which is exactly why `site.standard` has
   **no** comment/reply type and instead carries `bskyPostRef` to delegate comments to a
   companion `app.bsky.feed.post`. So a reply that should appear on Bluesky **must** be an
   `app.bsky.feed.post`.
2. **`app.bsky.feed.post.text` is hard-capped at `maxGraphemes: 300`** (`maxLength: 3000`
   bytes is a secondary guard). There is **no sanctioned threaded longform** — whitewind /
   leaflet longform records don't thread either; they live off-thread behind a short
   companion post. So **unlimited-length is impossible if the reply is to appear on
   Bluesky**.
3. **Decision: replies are `app.bsky.feed.post`, 300-grapheme cap, threaded under the
   companion post** (option A, user-approved). The block editor is dropped for replies in
   favour of a simple text composer. This matches the whole ecosystem and the user's stated
   expectation ("my reply shows up on the Bluesky thread").

Record shapes (all `subject`/`root`/`parent`/`record` are `com.atproto.repo.strongRef`
`{uri, cid}`; rkey = TID; required fields per lexicon):

- **like** — `app.bsky.feed.like` `{ subject, createdAt }`
- **repost** — `app.bsky.feed.repost` `{ subject, createdAt }`
- **reply** — `app.bsky.feed.post` `{ text, createdAt, reply: { root, parent } }`
- **quote** — `app.bsky.feed.post` `{ text, createdAt, embed: { $type:
  'app.bsky.embed.record', record } }`

OAuth: `transition:generic` (the existing `OAUTH_SCOPE`) already authorizes writing all
`app.bsky.feed.*` records. **No scope change.** Granular `repo:app.bsky.feed.*` scopes are
a later tightening (out of scope).

## Architecture

### The target post

The reader page already fetches the `site.standard.document`. We extend its interface with
`bskyPostRef?: StrongRef`. Every action targets that strongRef:

- like / repost / quote → `subject` / `record` = `bskyPostRef`.
- reply → the companion post is the thread origin, so `root === parent === bskyPostRef`.

If `bskyPostRef` is absent (legacy documents published before Decision 0013, or a failed
third write), there is no Bluesky thread to act on → **the action bar is not rendered**.

### Auth on the reader page

A new **client-only island** `PostActions` (`client:only="react"`) wraps the existing
`AuthProvider` and consumes `useAuth()` — the same OAuth machinery Studio uses. `redirect_uri`
is the current page (already how `createOAuthClient` works), and the loopback `client_id` is
already path-less, so the OAuth round-trip returns the reader to the article URL. Signed-out
readers see a "Sign in to react" affordance that kicks off the same `signIn` flow as
`LoginForm`.

**Hard constraint upheld:** the reader page must never import `@wordpress/*` (Decision 0003).
`PostActions` imports only React, `@atproto/api`, and the OAuth client — no editor stack.

### Counts + viewer state

On mount (and after each successful action), the island calls
`agent.app.bsky.feed.getPosts({ uris: [postUri] })`, which returns `likeCount`,
`repostCount`, `replyCount` and `viewer.like` / `viewer.repost` (the rkeys of the viewer's
existing like/repost records). This drives:

- active/inactive button state,
- the record URI to **delete** when toggling a like/repost off (atproto has no native
  "unlike"; you delete the like record).

A "View thread on Bluesky" link points at
`https://bsky.app/profile/<authorDid>/post/<postRkey>`. **Rendering the reply thread inline
is out of scope for v1.**

### Composer

A plain `<textarea>` (no block editor) used for both reply and quote, with a live grapheme
counter via the browser-native **`Intl.Segmenter`** (no new dependency; matches Bluesky's
300-grapheme rule). Plain text only in v1 — no facet/link/mention detection, so URLs in a
reply won't be clickable (acceptable for a simple composer; noted as a future addition).
Submit is disabled when over 300 graphemes; a reply must also be non-empty, but a quote
may be posted with no commentary (a bare quote-repost, as on Bluesky).

A small persistent note states that actions are **public and happen on Bluesky** — the
"don't surprise users" product guardrail (brief §10), the same principle the publish panel
follows.

### Guardrails

- All writes go **browser → the reader's own PDS** over OAuth/DPoP. There is no SkyPress
  server write endpoint, so there is **no CSRF surface to add**; rate-limiting / abuse is
  the PDS's concern.
- No secrets in the client (OAuth public client, Decision 0004).
- Reads via `getPosts` hit the AppView through the authenticated agent (signed-in only);
  signed-out readers see actions that prompt sign-in rather than live counts.

## Components / data flow

```
[rkey].astro (SSR, prerender=false)
  └─ reads site.standard.document  ──► doc.bskyPostRef {uri, cid}
  └─ mounts <PostActions client:only="react"
              postUri postCid authorDid postRkey articleTitle />   (only if bskyPostRef)

PostActions (island)
  └─ <AuthProvider>
       └─ signed-out → "Sign in to react" → useAuth().signIn()
       └─ signed-in  → action bar (like / repost / quote / reply) + counts
                       └─ composer (textarea + grapheme counter) for reply / quote
                       └─ calls src/lib/social/interactions.ts (agent orchestration)
```

## Modules (TDD — pure logic tested first)

- **`src/lib/social/records.ts`** — pure, no `@atproto/*`. `buildLike(subject)`,
  `buildRepost(subject)`, `buildReply({ text, root, parent, createdAt })`,
  `buildQuote({ text, subject, createdAt })`, `graphemeLength(text)`,
  `validateReplyText(text)` (non-empty, ≤300 graphemes). Mirrors `publish/records.ts`.
  Fully unit-tested with fidelity assertions on the emitted record shapes.
- **`src/lib/social/interactions.ts`** — thin orchestration over an `Agent`:
  `like` / `unlike`, `repost` / `unrepost`, `postReply`, `postQuote`, `fetchPostState`
  (wraps `getPosts`). Tested with a mocked agent.
- **`src/components/PostActions.tsx`** — the island UI.
- **`src/pages/[author]/[slug]/[rkey].astro`** — add `bskyPostRef` to `SkyDocument`; mount
  the island (guarded on `bskyPostRef` presence).

## Out of scope for v1

- Inline rendering of the reply thread (link out to Bluesky instead).
- Rich-text facets (clickable links / mentions) in replies.
- Granular `repo:app.bsky.feed.*` OAuth scopes (keep `transition:generic`).
- De-duplicating an accidental double-like server-side (we rely on `viewer.like` state to
  toggle; the PDS would otherwise allow duplicates, as it does for the official client).

## Testing

- Unit: `records.test.ts` (record shapes, grapheme counting, validation),
  `interactions.test.ts` (correct collection / record / rkey passed to a mocked agent;
  toggle deletes the right URI).
- Smoke: `npm run check` + `npm test`, then a browser pass on the reader page (sign in,
  like, reply, verify the record lands and the thread shows it on Bluesky).
