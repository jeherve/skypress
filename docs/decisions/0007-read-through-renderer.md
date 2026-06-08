# 0007 — Read-through public renderer

- **Status:** Accepted (verified against real published articles)
- **Date:** 2026-06-08
- **Scope:** SP4 — public reading pages

## Context

Brief §2's key insight: to display an article, resolve on demand —
`handle → DID → PDS → fetch the record → render` — with no firehose indexer, no
database, no persistent worker. SP4 implements exactly that.

## Decision

### On-demand SSR (not prerendered)
Articles live on arbitrary PDSes and change independently of our deploys, so the
reading routes are **server-rendered per request** (`export const prerender = false`).
This needs an Astro adapter; SP4 uses **`@astrojs/node`** (standalone). The rest of the
site (landing, editor, sample) stays statically prerendered — a hybrid build. SP7 swaps
the Node adapter for the chosen edge host without touching the render logic.

### Routes
- `/@<handle>/<rkey>` → `src/pages/[author]/[rkey].astro` — one article.
- `/@<handle>` → `src/pages/[author]/index.astro` — the publication homepage (lists the
  writer's SkyPress documents).

The dynamic segment captures the whole `@handle` (validated to start with `@`); static
routes (`/editor`, `/`, …) take priority, so they're unaffected.

### Resolution chain (`src/lib/reader/`)
- `identity.resolveHandleToDid` — the handle's own `/.well-known/atproto-did` first (no
  third party), falling back to a public `resolveHandle` XRPC. DIDs pass through.
- `media/pds.resolvePdsUrl` — the `#atproto_pds` endpoint from the DID document.
- `records.getRecord` / `listRecords` — public `com.atproto.repo` XRPC (no auth).

### Rendering
`fetch document → resolveBlobImageUrls → renderBlocks → sanitizeArticleHtml → inject`.
- **Images:** `resolveBlobImageUrls` rebuilds each blob-backed image's `getBlob` URL from
  the article's DID + the stored CID (portable across PDS migrations, Decision 0006);
  external images keep their URL.
- **Sanitisation (load-bearing):** article HTML is UNTRUSTED (arbitrary PDS records).
  `sanitizeArticleHtml` (sanitize-html) allows only the curated blocks' tags/attributes,
  strips `<script>`/event handlers/`javascript:` URLs, and hardens external links
  (`rel="noopener noreferrer nofollow ugc"`, `target="_blank"`). Unit-tested.
- **Light pages:** no client islands → **zero JS** in production (verified); only the
  block-library frontend CSS ships.
- **Graceful degradation:** unknown content falls back to the document's `textContent`.

### Indexing (brief §3)
Each article page emits `<link rel="site.standard.document">` + (when linked)
`<link rel="site.standard.publication">`; the homepage emits the publication ref. Plus a
`<link rel="canonical">` and Open Graph tags pointing at the canonical
`skypress.blog/@<handle>/<rkey>` URL. With these + the publication `url` pointing back at
skypress.blog, no separate `.well-known` route is needed for verification.

## Security — SSRF guard

The renderer fetches hostnames derived from untrusted input: the `@handle` in the URL,
a `did:web` host, and the PDS `serviceEndpoint` from a DID document. Unguarded, a request
like `/@169.254.169.254/x` or a `did:web` pointing at an internal host would make the
server fetch loopback / cloud-metadata / private addresses (SSRF).

Every such fetch goes through **`src/lib/net/safe-fetch.ts`**, which allows only `https://`
to syntactically valid **public** domains — rejecting IP literals, single-label/`localhost`,
and reserved/internal TLDs — and refuses to follow redirects (no pivot to an internal
host). Verified: legit handles render (200) while `/@127.0.0.1/…` and `/@169.254.169.254/…`
are rejected (404, no internal request made). Unit-tested in `net/safe-fetch.test.ts`.

**Residual:** a public domain whose DNS resolves to a private IP (DNS rebinding) can't be
closed portably without resolving DNS and inspecting the address (Node-only, fights edge
portability). Close it at the network/egress layer of the chosen host in SP7.

## Consequences

- `@astrojs/node` is a placeholder host; `sanitize-html` is Node-oriented. SP7 must
  confirm both work (or swap) on the chosen edge runtime (Cloudflare). The render logic
  itself is runtime-agnostic.
- No caching yet — every request re-resolves + re-fetches. SP7/edge should add caching
  (the read-through design is cache-friendly: content is immutable per rkey until edited).
- Handle resolution falls back to a public resolver (a third-party dependency / privacy
  note); a self-hosted resolver is a later improvement.
