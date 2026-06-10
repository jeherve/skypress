# 0017 — Recognising the app behind a foreign publication

- **Status:** Accepted
- **Date:** 2026-06-10
- **Scope:** foreign `site.standard.publication` records on both the authed dashboard
  ("From other apps") and the public profile ("Elsewhere") — `src/lib/publish/providers.ts`,
  the two `publications.ts` mappers, `ProviderLogo.{tsx,astro}`.

## Context

`site.standard.publication` is a shared collection: other apps (Leaflet, pckt, Offprint,
…) write their own records into a writer's repo. We list these as "foreign" and want to
show the originating app's logo next to its hostname. The obvious signal — the
publication's hostname — fails for the paid tiers of these services, which serve from a
**custom domain** (`myblog.com`, not `*.leaflet.pub`).

## Decision

`detectProvider( url, value )` recognises a provider in two steps, framework-agnostic
(no JSX) so the React dashboard and the server-rendered Astro reader share one core:

1. **Record discriminator (primary).** App-specific namespaced `$type`s embedded in the
   record survive a custom domain. Observed in real records: pckt writes
   `theme.$type === "blog.pckt.theme"`. This is the only custom-domain-proof signal.
2. **Hostname suffix (fallback).** `*.leaflet.pub`, `*.pckt.blog`, `*.offprint.app`,
   matched at a dot boundary (`host === domain || host.endsWith('.' + domain)`) so
   `evil-leaflet.pub.com` and `notleaflet.pub` do **not** match.

The logo glyphs live as monochrome (`currentColor`) inner-SVG `body` strings in
`KNOWN_PROVIDERS`, rendered inside each framework's own fixed-size `<svg>` wrapper.

## Consequences

- **Leaflet and Offprint on a custom domain are unrecognised** — their records carry no
  app-specific `$type` (verified against a real `*.leaflet.pub` record; Offprint
  unsampled), so they fall back to a bare hostname, exactly as before. Accepted for v1.
  If either later adds a discriminator, extend step 1.
- Recognising a new provider = one `KNOWN_PROVIDERS` entry + (its discriminator and/or)
  one `PROVIDER_DOMAINS` line + a `detectProvider` test case. No renderer changes.
- The glyph data is trusted constant content, so `ProviderLogo` injects it via
  `dangerouslySetInnerHTML` / `set:html` without sanitising — it is never PDS-derived,
  unlike article HTML (which still goes through the reader sanitiser, AGENTS.md rule 6).
- Leaflet's brand asset was a raster PNG, so its glyph is a substitute vector feather
  (Lucide, ISC) rather than the official mark.
