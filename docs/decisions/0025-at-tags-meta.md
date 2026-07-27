# 0025 — AT Tags meta tags on reader pages

- **Status:** Accepted
- **Date:** 2026-07-27
- **Scope:** `src/lib/seo/at-tags.ts`, the three public reader pages
  (`src/pages/[author]/index.astro`, `[author]/[slug]/index.astro`,
  `[author]/[slug]/[rkey].astro`), and `ActorProfile` (`src/lib/reader/profile.ts`)

## Context

The article page carries `<link rel="site.standard.document">` and
`<link rel="site.standard.publication">` tags, the publication page just the latter, each
pointing at the AT-URI the page was rendered from. A `<link rel>` with an unregistered
rel value isn't technically valid HTML, and the network has converged on a different
mechanism: the
[AT Tags](https://tangled.org/chrisshank.com/at-tags/) proposal, which maps a page to its
records through `<meta name="at:*">` tags.

Bluesky ([social-app#11243](https://github.com/bluesky-social/social-app/pull/11243))
swapped its `<link rel="alternate">` tags for `at:canonical` on post, profile, feed and
starter-pack pages. Leaflet emits `at:canonical` on document pages and publication homes,
with `at:alternate` for the parent publication — the same document/publication split we
have. The WordPress ATmosphere plugin
([#219](https://github.com/Automattic/wordpress-atmosphere/issues/219)) is adding them too.

## Decisions

**Additive, not a replacement.** Bluesky removed its `<link rel>` tags; we keep ours and
emit the meta tags alongside. Nothing currently reading SkyPress pages loses its input,
and the change is purely new output — all three page diffs delete nothing. Revisiting this
once the network has clearly moved over is a separate call.

**`at:author` and `at:me` are emitted.** The WordPress plugin deliberately skipped both:
WordPress has no per-post author → DID mapping, so on a multi-author site every post would
be attributed to the one connected account. That reason doesn't apply here. Every SkyPress
reader page resolves an author DID as part of the handle → DID → PDS chain, and a
publication has exactly one owner, so both tags carry that DID.

**The author page declares no `at:canonical`.** Bluesky's profile page renders
`app.bsky.actor.profile` — delete the record and the page has nothing left. Our `/@handle`
is an index of the writer's publications, merely decorated with their Bluesky profile. By
the proposal's own test ("if those AT records were deleted this web page would not exist
anymore") the profile record is auxiliary, so it goes out as `at:alternate` and the page
declares no canonical rather than a false one.

**No per-item tags on list pages.** The publication page doesn't tag each article it
lists, nor the author page each publication. The tag count would grow with the list for
little gain.

## Mapping

| Page | Tags |
| --- | --- |
| `/@handle/slug/rkey` | `at:canonical` = document URI; `at:alternate` = publication URI; `at:alternate` = `app.bsky.feed.post` URI (when present); `at:author`, `at:me` = `at://did` |
| `/@handle/slug` | `at:canonical` = publication URI; `at:author`, `at:me` = `at://did` |
| `/@handle` | `at:alternate` = `at://did/app.bsky.actor.profile/self` (when the record exists); `at:author`, `at:me` = `at://did` |

## Consequences

- `src/lib/seo/at-tags.ts` owns the whole tag model, shaped like `meta.ts` next to it:
  pure, dependency-free, unit-tested. Pages assemble input and render a one-line `.map()`.
  Emission order is fixed (canonical → alternate → author → me), and a name repeats once
  per URI — the proposal's array semantics.
- Values that aren't `at://` URIs (or, for author/me, bare DIDs) are dropped. Record URIs
  come back from arbitrary PDSes; Astro escapes attribute values so there's no injection
  risk, but a malformed record shouldn't produce a junk `at:canonical`.
- `ActorProfile` gained `exists`, because all-null fields meant both "no profile record"
  and "empty profile record" and the author page needs to tell them apart.
- Adding a tag means extending `buildAtTags` **and** the page's colocated source pin
  (`_index.meta.test.ts` / `_[rkey].meta.test.ts` — underscore-prefixed per AGENTS.md #8).
