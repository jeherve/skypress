# 0020 — Publication subscriptions write `site.standard.graph.subscription` to the reader's repo

- **Status:** Accepted
- **Date:** 2026-06-17
- **Scope:** Letting a reader *follow* a SkyPress publication, and declaring publications
  discoverable (design `docs/superpowers/specs/2026-06-17-publication-subscriptions-design.md`).

## Context

The trigger was a question: SkyPress publications shared on Bluesky show a generic **"View
publication"** link in their card, whereas Leaflet/pckt show a branded **"Subscribe on
\<tool\>"** button — could SkyPress get the same?

Investigation (against live records + the Bluesky client source) settled it:

1. **The Bluesky card button is not ours to ship.** It is gated by a hardcoded host
   allowlist in `bluesky-social/social-app`
   (`StandardSiteEmbed/publishers.ts` → `STANDARD_SITE_PUBLISHERS`, currently
   `leaflet.pub`, `pckt.blog`, `offprint.app`). `matchStandardSitePublisher()` matches the
   host of the publication `url`; an unlisted host falls through to "View publication". **No
   SkyPress record/field changes this** — and even the matched button is just a `<Link>` to
   the publication URL; it writes no subscription record. Getting `skypress.blog` listed is
   an external PR to Bluesky ("Option A"), tracked separately.
2. **Real in-app subscriptions *are* ours to ship**, using the community follow primitive
   `site.standard.graph.subscription`.

## Decision

A reader subscribes by writing a **`site.standard.graph.subscription`** record to **their
own PDS** over their OAuth agent — the same browser → reader-PDS trust model as the social
actions (Decision 0015). Unsubscribe deletes it.

- **record** → `{ $type: 'site.standard.graph.subscription', publication, createdAt }`
- `publication` is the publication's **bare `at://` URI**, *not* a strongRef: a subscription
  follows the publication's identity, so editing the publication (new cid) never invalidates
  it.
- The Subscribe button's active/idle state comes from listing the reader's **own**
  subscription records and matching on `publication` (`fetchSubscriptionUri`).
- Builders in `src/lib/subscribe/records.ts`; orchestration in `subscriptions.ts`; the UI is
  a `client:only` `SubscribeButton` island wrapping the existing `AuthProvider`, mounted on
  the public publication page.

Separately, SkyPress publications now carry a **`preferences: { showInDiscover: true }`**
field on the `site.standard.publication` record. SkyPress publications are already wholly
public (public renderer + full-content RSS + Bluesky POSSE), so declaring discoverability
just makes that intent legible to standard.site-aware surfaces. New publications write it;
edits round-trip the stored value (defaulting to discoverable when absent). It is **not**
read by the Bluesky allowlist and has **no** effect on the card button.

## Consequences

- **No new OAuth scope:** writing/deleting a `site.standard.graph.subscription` in the
  reader's own repo is covered by the existing `transition:generic` scope, like the social
  actions.
- **Not a relay (brief guardrail):** SkyPress reads only the *signed-in reader's own*
  subscriptions. It deliberately does **not** aggregate subscription records across PDSes —
  so there are **no subscriber counts** and **no personalised following feed**. The record
  is still portable: any standard.site-aware reader can consume it.
- **"Don't surprise users" (brief §10):** the button states, signed-out and signed-in, that
  the subscription is a public record in the reader's own AT Protocol repo.
- **Read path stays `@wordpress`-free (Decision 0003):** the island uses only
  `@atproto/api` + the OAuth client.
- **Reversibility:** `preferences` is one optional, open field; it can be dropped without a
  breaking lexicon change.

## Out of scope (for now)

- The Bluesky card "Subscribe on SkyPress" button (external allowlist PR — Option A).
- A Subscribe button on the **article** page — that page already mounts a `PostActions`
  auth island, and a second OAuth-client init on one page is a real risk; deferred until an
  `AuthProvider` can wrap both islands.
- Subscriber counts, a following feed, and any cross-PDS aggregation (relay territory).

## Amendment (2026-07-17) — OAuth round-trip from the dynamic publication page

The initial cut had a gap: sign-in from the publication page couldn't come back to it, and
sign-in alone didn't subscribe.

- **Problem.** atproto only redirects back to a `redirect_uri` **registered** in
  `client-metadata.json` (generated from `OAUTH_REDIRECT_PATHS`, static island routes). The
  publication page is a **dynamic** route (`/[author]/[slug]/`) — unboundedly many, so it can
  never be registered. `redirectUriForLocation` fell back to `/editor/`, so signing in from
  the Subscribe button dropped the reader on the editor. And even fixed, OAuth only
  *establishes a session* — the `subscribe()` write happens on a button click that never came,
  so no `site.standard.graph.subscription` record was created.
- **Fix — a static return-only callback route.** Add one registered route,
  `OAUTH_CALLBACK_PATH = '/oauth/callback/'` (in `redirect_uris` alongside the island routes).
  Off-island sign-in (`signIn(handle, { returnTo })`) routes the hosted round-trip there and
  stashes the originating path (`auth/oauth-return.ts`); the `OAuthCallback` island completes
  the token exchange, then `location.replace`s back to the stashed path — guarded by
  `safeOAuthReturnPath` (same-origin absolute paths only, no open redirect). Loopback (dev)
  needs no callback: its per-page client already redirects back to the current page.
- **Fix — subscribe intent survives the round-trip.** The button stashes the target
  publication (`subscribe/intent.ts`) before redirecting; back on the publication page,
  signed-in and once current state has loaded, `SubscribeGate` consumes the intent and, if it
  targets this publication and the reader isn't already subscribed, auto-writes the record —
  so "Sign in to subscribe" actually subscribes. Both stores use `localStorage` (survives the
  OAuth excursion, same rationale as the writing-first `draft-store`).
- **Reusable.** The callback route + `oauth-return` are generic: any future signed-out action
  on a non-island page returns through the same path.
