# 0022 — Resolve did:plc via the Eurosky mirror first, plc.directory as fallback

## Context

The read-through renderer turns a writer's DID into their PDS `serviceEndpoint` in
`src/lib/media/pds.ts` (`resolvePdsUrl`). For `did:plc` this means fetching the DID
document from a PLC directory. Until now that was hard-coded to `https://plc.directory`,
the canonical directory operated by Bluesky PBC in the US.

That is the one remaining centralised, US-operated dependency on the otherwise
self-hostable read path (handle resolution already prefers the handle's own
`/.well-known/atproto-did`; `did:web` resolves from the domain itself). For an instance
positioning itself around European data sovereignty, every `did:plc` reader request
leaving for `plc.directory` undercuts that.

Eurosky (Modal Foundation, NL non-profit) runs a public `plc-mirror` on EU infrastructure
at `https://plc.eurosky.network`. Verified 2026-06-19: same `GET /{did}` API and DID-doc
shape (`#atproto_pds` / `AtprotoPersonalDataServer` → `serviceEndpoint`) as the canonical
directory; sampled DIDs (incl. `eurosky.social` and Bluesky-era DIDs) all return `200`.

## Options

1. **Replace** `plc.directory` with the mirror. — Maximal sovereignty, but a mirror can
   lag or go down, and lag means serving a *stale* `serviceEndpoint` right after a writer
   migrates their PDS (article 404s until the mirror catches up). Single point of failure.
2. **Mirror first, canonical fallback.** — Sovereignty by default; canonical (source of
   truth) catches misses/lag/outages. Accepts a brief, self-healing staleness window only
   in the rare case the mirror answers but is behind.
3. **Canonical first, mirror fallback.** — Never stale, but barely uses EU infra.
4. **Configurable single host (env), default canonical.** — Simple, but no resilience and
   off-by-default for sovereignty.

## Decision

**Option 2.** `PLC_HOSTS = ['https://plc.eurosky.network', 'https://plc.directory']`, tried
in order; any failure falls through to the next host. A "failure" is broader than a bad
HTTP response: the doc is parsed and the PDS endpoint extracted *inside* the same try, so a
mirror that returns `200` with a malformed doc (no `#atproto_pds` service, or a
`serviceEndpoint` that fails `assertSafeUrl`) also falls back to canonical rather than
failing the read. `did:web` is unchanged (resolves from the domain). Both hosts are public,
so each request still passes the `safeFetch` SSRF guard; the DID-doc `serviceEndpoint` is
still validated through `assertSafeUrl` before use, regardless of which host produced it.

## Why

- Keeps DID resolution on European infrastructure by default — the point of this instance.
- Canonical fallback means a mirror miss/outage/malformed response degrades gracefully
  instead of breaking reads. Staleness is only *partially* self-correcting: the fallback
  fires when a stale endpoint is unreachable/non-ok, but mirror-first cannot detect a
  stale-**but-still-live** endpoint — if the mirror returns `200` with an old-yet-resolvable
  `serviceEndpoint` (e.g. just after a PDS migration, while the old host still answers), that
  endpoint is used and canonical is never consulted. Accepted for a renderer: worst case is
  briefly serving a writer's article from their previous PDS until the mirror syncs. If this
  ever matters, the fix is to consult canonical for freshness, not a deeper fallback.
- Drop-in: the mirror speaks the same API, so this is a host-ordering change, not a new
  protocol path. No change to the SSRF guarantees (Decision 0016 / `safe-fetch.ts`).

## Consequences / follow-ups

- Resolution order is hard-coded. If other self-hosters want canonical-first (or a
  non-Eurosky mirror), promote `PLC_HOSTS` to an env-configured list. Deferred until needed.
- The handle→DID fallback in `src/lib/reader/identity.ts` still uses `https://bsky.social`
  as its XRPC resolver (only when a handle lacks `/.well-known/atproto-did`). Same
  sovereignty shape, lower traffic; left as a separate, lesser follow-up.
