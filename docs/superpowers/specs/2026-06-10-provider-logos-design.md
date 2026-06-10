# Provider logos next to foreign-publication hostnames — design

**Date:** 2026-06-10
**Status:** Approved (ready for implementation)

## Goal

When a "foreign" publication (a `site.standard.publication` record SkyPress doesn't
own — written by Leaflet, pckt, Offprint, …) is shown, display the originating
service's logo next to its hostname **if** we can recognise the service.

Two interfaces, sharing one detection + logo core:

- **Dashboard "From other apps"** (`src/components/Dashboard.tsx`) — logo before the
  hostname in the existing `.dash__pubhost` pill.
- **Public profile "Elsewhere"** (`src/pages/[author]/index.astro`) — currently shows
  the publication name only; now also shows a hostname pill with the logo before it.
  (This reverses the "name only, no hostname" decision in
  `2026-06-09-profile-elsewhere-section-design.md`, which is updated accordingly.)

## Detecting the service

A two-step strategy, because the hostname alone misses services on custom domains:

1. **Record discriminator (primary).** App-specific records carry namespaced `$type`s
   that survive a custom domain. Observed: pckt embeds `theme.$type ===
   "blog.pckt.theme"`. Detect pckt this way regardless of hostname.
2. **Hostname suffix (fallback).** `*.leaflet.pub` → leaflet, `*.pckt.blog` → pckt,
   `*.offprint.app` → offprint. Suffix test is exact-or-dot-boundary
   (`host === domain || host.endsWith('.' + domain)`) to avoid `evil-leaflet.pub.com`.

**Known limitation:** Leaflet records are fully standard (no app-specific `$type` —
verified against a real `*.leaflet.pub` record) and Offprint is unsampled. So Leaflet
and Offprint published on a **custom domain** can't be recognised and fall back to a
bare hostname, exactly as today. Acceptable for v1.

## Shared core — `src/lib/publish/providers.ts` (new)

Framework-agnostic, pure TS (no JSX), the reusable part both interfaces consume:

```ts
export type ProviderId = 'leaflet' | 'pckt' | 'offprint';
export interface KnownProvider { id: ProviderId; label: string; viewBox: string; body: string; }
export const KNOWN_PROVIDERS: Record<ProviderId, KnownProvider>;
export function detectProvider( url: string, value: unknown ): ProviderId | null;
```

- `body` is the inner SVG markup (paths/etc.), self-contained and monochrome
  (`currentColor` — fill-based for pckt/offprint, `fill="none" stroke="currentColor"`
  for the leaflet feather). Rendered inside a fixed-size `<svg viewBox>` wrapper, so the
  source asset's dimensions don't matter, and both fill- and stroke-based glyphs work.
- `label` (e.g. "Leaflet") is the SVG's accessible name (`aria-label`).

### Logo assets

- **pckt, offprint** — extracted from the vector SVGs the user saved in `public/`
  (already single-colour). pckt's hardcoded `fill="black"` becomes `currentColor`.
- **leaflet** — the saved `public/leaflet.svg` is a 147KB raster PNG wrapped in SVG, so
  there is no vector to recolour. Substitute a clean vector **feather** glyph
  (Leaflet's mark is a feather), monochrome, `currentColor`.
- The now-inlined `public/{leaflet,pckt,offprint}.svg` files are removed.

## Data layer

Both mappers call `detectProvider( url, value )` and store the result.

- `ForeignPublication` (`src/lib/publish/publications.ts`) gains
  `provider: ProviderId | null`.
- `ReaderForeignPublication` (`src/lib/reader/publications.ts`) gains
  `provider: ProviderId | null` **and** `hostname: string` (it has neither today; the
  profile page needs the hostname to display it).

## Renderers — share the data, one thin renderer per framework

Astro can't server-render a React component, and the read path must not take a client
island just for a logo. So the *data + detection* is shared; each framework gets a
~5-line SVG renderer reading from `KNOWN_PROVIDERS[ id ]`:

- **`src/components/ProviderLogo.tsx`** (React) — used in `Dashboard.tsx`. Renders
  `null` when `provider` is null. Placed before the hostname text in `.dash__pubhost`.
- **`src/components/ProviderLogo.astro`** — used in `[author]/index.astro` "Elsewhere"
  rows, which gain a hostname pill (logo + hostname) reusing the dashboard's pill look.

## Tests (TDD — failing test first)

- `src/lib/publish/providers.test.ts` (new): `detectProvider` →
  - pckt via `theme.$type === 'blog.pckt.theme'` even on a non-pckt hostname;
  - leaflet/pckt/offprint via hostname suffix (exact + subdomain);
  - rejects look-alike hosts (`evil-leaflet.pub.com`, `notleaflet.pub`);
  - returns null for unknown hosts / unparseable urls;
  - `KNOWN_PROVIDERS` has an entry for every `ProviderId`.
- `src/lib/publish/publications.test.ts`: `listAllPublications` sets `provider` on
  foreign entries (pckt by discriminator, leaflet by host, null when unknown).
- `src/lib/reader/publications.test.ts`: `listAllReaderPublications` sets `provider`
  and `hostname` on foreign entries; owned-only regression still holds.

## Out of scope

No lexicon changes, no curated-block changes, no reader-sanitiser changes. The read
path still never imports `@wordpress/*`. Custom-domain Leaflet/Offprint detection is
explicitly not solved.
