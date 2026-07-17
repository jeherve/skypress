# Publication subscriptions — plan

**Design:** [2026-06-17-publication-subscriptions-design.md](../specs/2026-06-17-publication-subscriptions-design.md)
**Branch:** `subscriptions-button-support`

TDD throughout: failing test first, then the implementation that satisfies it.

## 1. Subscription record builder (pure)

- [ ] `src/lib/subscribe/records.test.ts` — `buildSubscription` returns
      `{ $type:'site.standard.graph.subscription', publication, createdAt }`; exports
      `SUBSCRIPTION_COLLECTION`.
- [ ] `src/lib/subscribe/records.ts` — implement.

## 2. Agent orchestration

- [ ] `src/lib/subscribe/subscriptions.test.ts` — mock-agent tests for `subscribe`
      (createRecord, right collection/record, returns uri), `unsubscribe` (deleteRecord by
      rkey), `fetchSubscriptionUri` (listRecords, matches by `publication`, returns uri or
      null; no match → null).
- [ ] `src/lib/subscribe/subscriptions.ts` — implement.

## 3. SubscribeButton island

- [ ] `src/components/SubscribeButton.tsx` — `<AuthProvider>` wrapper + `SubscribeGate`.
      Loads state on mount (signed-in), toggle subscribe/unsubscribe, signed-out sign-in
      prompt, inline error, "Subscribed ✓" active state, public-action note.
- [ ] Reuse `.post-actions*`-style classes or add `.subscribe*` styles in the page.

## 4. Wire into the publication page

- [ ] `src/pages/[author]/[slug]/index.astro` — mount `<SubscribeButton client:only="react"
      publicationUri={publication!.uri}>` in the hero, with a fallback slot.
- [ ] Scoped CSS for the button.

## 5. Option C — discoverability preference

- [ ] Extend `PublicationRecord` + `buildPublicationRecord` with
      `preferences?: { showInDiscover?: boolean }`; default `{ showInDiscover: true }` on
      create, round-trip on update.
- [ ] `Publication` resolved type + `toPublication` carry `preferences`.
- [ ] `createPublication` writes the default; `updatePublication` preserves `existing.preferences`.
- [ ] Tests in `src/lib/publish/records.test.ts` (builder) + `publications.test.ts`
      (round-trip) as the existing suites dictate.

## 6. Docs

- [ ] `lexicons/README.md` — add `site.standard.graph.subscription` (reader-written) and the
      `preferences` field on the publication table.
- [ ] `docs/decisions/0020-publication-subscriptions.md` — durable rationale (button is
      Bluesky-allowlist; subscriptions written to reader PDS; no relay/feed; preferences).

## 7. Verify

- [ ] `npm run test` green.
- [ ] `npm run check` clean (types + astro).
