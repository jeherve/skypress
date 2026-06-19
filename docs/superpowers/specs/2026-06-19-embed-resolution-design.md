# Embeds for SkyPress — server-rendered cards for atproto posts and video

**Date:** 2026-06-19
**Status:** Approved (design)

## Problem

Article content can contain URLs to atproto posts and to video providers, but
SkyPress renders them as plain links. In the editor, pasting such a URL does not
even produce an embed block.

The root cause is that `core/embed` resolves its preview by calling a WordPress
oEmbed proxy (`/wp-json/oembed/1.0/proxy`). SkyPress has no WordPress backend, so
that request has nothing to answer it — which is why *even `bsky.app`* (a provider
core recognises) stays a dead link in the editor, and why `src/lib/blocks/render.ts`
(the reader) has no `core/embed` case, so embeds render as nothing on reading pages.

Fixing the general case (any embed) and adding atproto post embeds is therefore one
job: **give SkyPress its own embed-resolution path**, server-side for the reader and
in the browser for the editor where it can.

## Goal

Turn recognised URLs in article content into rich, **server-rendered static cards**
on the reading page, and give the editor a **live preview for atproto posts** while
writing. Anything outside the curated provider registry stays a plain link, exactly
as today — no silent failure, no broken card.

## Decisions taken during brainstorming

- **Scope:** atproto posts (improvement) + general video providers (fix). v1 registry
  is **atproto posts, YouTube, Vimeo**. More providers are one registry entry + a test.
- **Rendering model:** **server-side static cards**, resolved at read time. No
  third-party scripts/trackers on readers' pages by default. Fits the existing
  dependency-free + `safeFetch` + sanitise pipeline (AGENTS.md rule 6).
- **Video playback:** **facade → inline iframe on click**. The static thumbnail card
  loads no third-party code; the provider `<iframe>` is inserted only when the reader
  clicks play.
- **Editor preview:** **live for atproto, placeholder for the rest.** atproto post
  cards render live (the AppView API is CORS-friendly); video/other providers show a
  tidy placeholder (their oEmbed isn't browser-CORS-reachable).

## Architecture

### Data model — nothing new stored

The existing `core/embed` block is kept; it stores `{ url, providerNameSlug }` as core
does. No lexicon change, no new block in the allowlist (Decision 0002). All richness is
**derived at read time** — so old content and content from other apps works, and we
never persist stale post text or thumbnails.

### A shared, dependency-free embeds module

New `src/lib/embeds/` — imports nothing from `@wordpress/*`, so the reader path *and*
the editor can both use it (Decision 0003):

- `registry.ts` — `detectEmbed( url ) → { kind: 'atproto' | 'youtube' | 'vimeo', id } | null`.
  Mirrors the `detectProvider` / `KNOWN_PROVIDERS` pattern (Decision 0017): hosts matched
  at a dot boundary (`host === domain || host.endsWith('.' + domain)`) so look-alike hosts
  do not match. atproto accepts `bsky.app`, `mu.social`, any AppView host using the
  standard `/profile/<id>/post/<rkey>` path, and raw `at://…app.bsky.feed.post/…` URIs.
- `card.ts` — pure functions: resolved data → a **trusted card HTML string**, with every
  PDS-/provider-derived value (post text, author, title) escaped at interpolation. The
  same code builds the editor preview and the reader card → single source of truth.

### Reader pipeline — async pre-pass, then the existing sync path

`renderArticle` (`src/lib/reader/render-article.ts`) is synchronous and dependency-free;
embed resolution needs async network fetches, so it cannot live inside it. We add one
async step *before* the load-bearing order (Decision 0018), which is otherwise unchanged:

1. **`resolveEmbeds( blocks )` (new, async)** — walks the tree; for each `core/embed`
   whose URL `detectEmbed` recognises, fetches data via `safeFetch` (with a timeout) and
   attaches a resolved payload onto the node. Any failure/timeout → no payload.
2. `renderBlocks` gains a **`core/embed` case** (still sync) that renders the trusted card
   from the attached payload; with no payload it falls back to a plain link to the URL.
3. `sanitizeArticleHtml` runs last, as always.

The read route frontmatter (`src/pages/[author]/[slug]/[rkey].astro`, already SSR with
`prerender = false`) calls `resolveEmbeds` before `renderArticle`. RSS, having no JS,
renders the atproto card statically and a plain link for video.

### ATProto post card (the improvement)

Fetched from the public AppView (`public.api.bsky.app`, `app.bsky.feed.getPosts`,
unauthenticated) via `safeFetch` — `interactions.ts` already reads from this host. The
card shows: author avatar + display name + `@handle`, post text, post images (if any),
timestamp, and a "view on the ATmosphere" link built with the existing
`atmospherePostWebUrl` helper — so it honours Decision 0022 regardless of whether the
pasted URL was `bsky.app` or `mu.social`. Fully static: no script, no iframe.
Quote-posts / video-in-post / external link-cards degrade to text + the view link in v1.

### Video card (the fix) — facade → inline iframe

Resolved via the providers' public oEmbed endpoints (YouTube, Vimeo) through `safeFetch`
for title + thumbnail. The sanitised HTML contains **only a static facade** — thumbnail,
title, a play `<button>`, and a scoped `data-` attribute identifying provider + video id.
**No iframe is present in the sanitised output.** A tiny reader script inserts the
`<iframe>` (`youtube-nocookie.com/embed/…`, `player.vimeo.com/video/…`) only when the
reader clicks play.

**Security (the rule-6 reasoning).** The sanitiser allowlist is widened just enough for
the facade (`figure.wp-block-embed`, `button`, the scoped `data-*`, the thumbnail `img`)
— **not** for `iframe`. The reader JS **reconstructs and validates** the playback URL
from provider + id against the two trusted hosts; it never trusts a raw URL pulled from
the document. So a malicious PDS that hand-writes facade markup (or a crafted
`data-embed-*`) into its content cannot smuggle an arbitrary iframe through the new
allowance.

### Editor experience — apiFetch middleware shim over `core/embed`

A `@wordpress/api-fetch` middleware intercepts the embed-preview request `core/embed`
makes (`/oembed/1.0/proxy`), extending core's normal flow instead of fighting it — so
**pasting a URL still auto-creates the embed block**:

- **atproto URL** → middleware fetches the AppView (CORS-friendly) and returns the real
  card from the shared `card.ts` → live preview while writing.
- **YouTube / Vimeo** → returns a tidy placeholder ("▶ YouTube — renders on your
  published page"), since their oEmbed is not browser-CORS-reachable.
- **unrecognised** → behaves as today (stays a link).

A custom block was considered and rejected: it would lose core's bare-URL paste
detection and duplicate the embed UI for no benefit.

## Failure handling & performance

- **Never break the page.** Any fetch failure/timeout → plain link (atproto and video),
  surfaced as a normal link rather than a blank or an error card.
- **SSR cost.** Reading pages are rendered per request, so each embed is a fetch per
  render. v1 ships with a short `safeFetch` timeout + graceful fallback; resolved
  payloads should be cached (Cloudflare Cache API or a small in-worker memo keyed by URL)
  as a fast follow if render latency warrants it.

## Testing (TDD)

Write failing tests first:

- `src/lib/embeds/registry.test.ts` — URL → provider, dot-boundary host safety, `at://`
  URIs, junk → `null`.
- `src/lib/embeds/card.test.ts` — hostile post text / video title is escaped; structure
  is well-formed.
- `resolveEmbeds` — mocked `safeFetch`: success, timeout/failure → no payload,
  non-provider URL passthrough.
- `src/lib/blocks/render.test.ts` — `core/embed` case (with payload → card, without →
  link); note that the embed card intentionally diverges from `serialize()` output (a
  read-time enhancement, like blob-image resolution already is — rule 4).
- Sanitiser tests — facade markup survives; a document-injected `<iframe>` or arbitrary
  `data-embed-*` is neutralised.
- Reader-JS test — the play handler only builds an iframe for a validated trusted host.

Run `npm run test` and `npm run check`.

## Docs

- This design + an implementation plan under `docs/superpowers/specs/` and
  `docs/superpowers/plans/`.
- New `docs/decisions/0023-embed-resolution-pipeline.md` — durable rationale: read-time
  resolution over stored previews, the provider registry, server-side static cards, and
  the facade + client-side host-validation security model.
