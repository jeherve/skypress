# 0015 — Linkified author bios from detected facets

## Context

Author pages show the writer's Bluesky bio (`app.bsky.actor.profile.description`). On
bsky.app that bio has clickable URLs, `@mentions`, and `#tags`, but those links are **not
in the PDS record** — profile descriptions are plain text and carry no `facets` (unlike
`app.bsky.feed.post`). Bluesky's client computes them at render time with
`RichText.detectFacets()`. We want the same on the author page.

## Options

1. **Hand-rolled regex detector.** Full control, no extra import, but "match Bluesky
   fully" becomes a hand-maintained moving target (URL tokenizer subtleties, bare domains,
   trailing punctuation, unicode tags) that silently drifts from bsky.app.
2. **`@atproto/api` `RichText.detectFacets(agent)`.** Exact Bluesky behaviour *including*
   handle→DID resolution — but resolution means network calls and new SSRF surface, for no
   benefit since we link mentions by handle.
3. **`@atproto/api` `RichText.detectFacetsWithoutResolution()`.** The same detection code
   Bluesky runs, minus mention resolution. Pure, no network.

## Choice

Option 3. A pure module `src/lib/reader/rich-text.ts` exposes `detectBioSegments()`, which
returns ordered `text`/`link` segments. The author page renders them with Astro
auto-escaping (no `set:html`). Mentions link to `https://bsky.app/profile/<handle>`, tags
to `https://bsky.app/hashtag/<tag>`, URLs to the detected uri. An http(s) scheme guard
(`safeHttpHref`) drops any non-http(s) link as defence in depth.

## Why

- **Fidelity by construction.** Reusing atproto's detection means our links can't drift
  from bsky.app's.
- **No new read-path risk.** No network call, so the SSRF guard (AGENTS.md constraint 6a)
  does not apply; no `set:html`, so the sanitiser (6b) does not apply — Astro escapes both
  text and attributes, and the scheme guard blocks hostile URL schemes.
- **No DID resolution needed** because mentions link by handle (we accept linking to
  Bluesky rather than internal author pages for now).

## Scope

Author bios only. Publication descriptions, display names, and post excerpts are
unchanged. Article body links are unaffected — they are authored HTML anchors in the block
tree, never facets.
