# Publication subscriptions (follow a SkyPress publication) — design

**Date:** 2026-06-17
**Status:** Approved, ready for plan
**Branch:** `subscriptions-button-support`

## Problem

A reader who finds a SkyPress publication (on its public page, or via an article shared on
Bluesky) has no way to *follow* it. The `site.standard.*` family already defines the
follow primitive — `site.standard.graph.subscription` — and other tools on the same
lexicon (Leaflet, pckt) let readers subscribe. SkyPress writes none of it.

This work came out of a question: *"can we get the **Subscribe on SkyPress** button that
Leaflet posts show in their Bluesky link card?"* Investigation settled that question and
split it cleanly in two:

1. **The Bluesky link-card button is not ours to ship.** It is gated by a hardcoded host
   allowlist in Bluesky's first-party app
   (`bluesky-social/social-app`, `StandardSiteEmbed/publishers.ts` →
   `STANDARD_SITE_PUBLISHERS = [leaflet.pub, pckt.blog, offprint.app]`). The CTA reads
   `Subscribe on <name>` only when the publication `url` host matches an entry; everyone
   else falls through to `View publication`. **No SkyPress-side record/field changes that
   button** — it is purely Bluesky client branding, and even Leaflet's button is just a
   `<Link>` to the publication URL (it does *not* write a subscription record). Getting
   `skypress.blog` onto that list is an external PR to Bluesky (tracked separately as
   "Option A"), out of scope here.

2. **Real in-app subscriptions are ours to ship** — and that is what this design covers.

## Scope

- **In scope:** a signed-in reader can **subscribe / unsubscribe** to a SkyPress
  publication; the action writes/deletes a `site.standard.graph.subscription` record in
  the **reader's own PDS** via the OAuth agent. A `SubscribeButton` island on the public
  publication page reflects and toggles that state. Signed-out readers get the same
  sign-in prompt the post-actions bar uses.
- **In scope (Option C):** SkyPress publications declare discoverability by carrying a
  `preferences` object (`{ showInDiscover: true }`) on the `site.standard.publication`
  record, matching the shape Leaflet/standard.site emit. This is independent of the
  button and of subscriptions; it is a one-field interop signal.
- **Out of scope (deliberately):**
  - **Subscriber counts** and a **personalised "following" feed**. Both require
    aggregating subscription records across arbitrary PDSes — that is relay/AppView work,
    and the brief is explicit: *SkyPress is an editor + OAuth client + public renderer —
    never a PDS or relay.* A reader's subscription record is still portable and useful to
    standard.site-aware readers; SkyPress simply doesn't aggregate it.
  - **Subscribe button on the article page.** The article page already mounts one
    `AuthProvider` island (`PostActions`). A second OAuth-client init on the same page is
    a real risk (double `client.init()` / callback processing). Deferred until an
    `AuthProvider` can be hoisted to wrap both islands. The publication page (the natural
    "follow this publication" surface) has no other auth island, so it ships first.

## The record

`site.standard.graph.subscription` — written to the **reader's** repo:

| Field | Req | Value |
|---|---|---|
| `publication` | ✓ | the publication's `at://…/site.standard.publication/<rkey>` URI |
| `createdAt` | | ISO datetime of the subscribe action |

The subject is an **at-uri, not a strongRef** (the lexicon takes a bare URI). That matches
how a follow should behave: it tracks the publication identity, not a specific record
version, so a publication edit (new cid) never breaks an existing subscription.

## Shape of the work (mirrors the social-actions slice, Decision 0015)

- **`src/lib/subscribe/records.ts`** — pure builder. `SUBSCRIPTION_COLLECTION`,
  `SubscriptionRecord`, `buildSubscription(publicationUri, createdAt)`. No `@atproto/*`,
  no network — unit-testable in isolation, exactly like `social/records.ts`.
- **`src/lib/subscribe/subscriptions.ts`** — agent orchestration:
  - `subscribe(agent, did, publicationUri)` → `createRecord`, returns the new record URI.
  - `unsubscribe(agent, did, subscriptionUri)` → `deleteRecord` by rkey.
  - `fetchSubscriptionUri(agent, did, publicationUri)` → `listRecords` on the reader's own
    `site.standard.graph.subscription` collection (limit 100, the codebase-wide cap),
    returns the matching record's URI or `null`. This is how the button knows whether to
    render "Subscribe" or "Subscribed ✓".
  - Reads the reader's **own** repo only — no AppView, no cross-PDS fan-out.
- **`src/components/SubscribeButton.tsx`** — island wrapping `<AuthProvider>` (same pattern
  as `PostActions`). `useAuth()` for `{ status, agent, did, signIn }`. Loads existing
  subscription state on mount when signed in; toggles on click; signed-out shows the
  sign-in prompt. Optimistic-but-honest: a failed write surfaces an inline error.
- **Publication page** (`src/pages/[author]/[slug]/index.astro`) mounts the island in the
  hero with `client:only="react"`, passing `publicationUri={publication.uri}`.

## Option C — discoverability preference

Extend `PublicationRecord` (and `buildPublicationRecord`) with an optional
`preferences?: { showInDiscover?: boolean }`. SkyPress publications are already wholly
public (public renderer + full-content RSS + Bluesky POSSE), so declaring
`showInDiscover: true` is consistent with what they already are — it just makes the intent
legible to standard.site-aware discovery surfaces. New publications write it by default;
edits round-trip the existing value (defaulting to `true` when absent). Reversible: it is
one optional field, removable without a breaking change. Note clearly: **this does not
affect the Bluesky card button** (the allowlist never reads `preferences`).

## Guardrail check

- Writes go browser → the reader's **own** PDS over their OAuth agent — identical trust
  model to likes/reposts (Decision 0015). Not a relay.
- No PDS-sourced HTML is rendered by this feature, so the sanitise/SSRF read-path rules
  (AGENTS.md §6) are untouched.
- Lexicon discipline: `site.standard.graph.subscription` is consumed as shipped
  (additions-only); `preferences` is optional and open.
