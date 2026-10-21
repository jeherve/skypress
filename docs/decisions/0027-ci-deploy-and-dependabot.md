# 0027 — CI, deploys from GitHub Actions, and Dependabot

- **Status:** Accepted
- **Date:** 2026-10-21
- **Scope:** `.github/workflows/ci.yml`, `.github/dependabot.yml`.

## Context

The code moved to GitHub. Until now, nothing ran automatically: tests and type checks
ran locally, and production was deployed by hand with `npm run deploy`. Two of the
costliest past breakages (a non-underscored test under `src/pages/`, AGENTS.md rule 8;
deduping before the hoist, rule 2) only show up in `astro build`, so they surfaced at
deploy time rather than in review.

## Options

**Where deploys run**

- **A. Keep deploying by hand.** No secrets anywhere, but `trunk` and production can drift,
  and nothing forces the build to pass first.
- **B. Cloudflare Workers Builds (Git integration).** No token in GitHub, but the build
  and the checks run in two different systems, and a deploy doesn't wait for CI.
- **C. A `deploy` job in the same GitHub Actions workflow.** ✅ **Chosen.** It `needs` the
  verify job, so only a commit that passed check, test and build reaches production, and
  everything is in one place. It costs one Cloudflare API token, stored as a secret on a
  `production` environment.

**Dependency updates**

- Dependabot for npm and for GitHub Actions, weekly. ✅ **Chosen**, with:
  - `@wordpress/*` grouped into one PR, since the editor needs one coherent line (rule 2).
    CI's build is what catches a bump that needs the dedupe backstop updated, and the
    React peer range still needs a human look before merging (rule 1).
  - `astro`/`@astrojs/*` and `@atproto/*` grouped, plus minor/patch dev dependencies.
  - `react`/`react-dom` **ignored**. They are pinned in both `dependencies` and
    `overrides` (Decision 0026). Dependabot only rewrites the former, and npm rejects an
    override that disagrees with a direct dependency, so those PRs could never pass.

## Decision

- One workflow: `verify` (`npm ci`, `check`, `test`, `build`) on PRs and pushes to
  `trunk`; `deploy` (`build`, then `wrangler deploy`) after it, on pushes to `trunk` only.
- The Cloudflare token is passed to the `wrangler deploy` step alone, not the whole job,
  so dependency install scripts and build plugins never see it. The `production`
  environment only accepts deployments from `trunk`.
- Node 22 only. Production runs on workerd, not Node; Node only drives the build, so one
  version is enough.
- The deploy job is skipped unless the repository variable `CLOUDFLARE_ACCOUNT_ID` is set.
  Forks and self-hosted copies get a green CI run instead of a failing deploy, and opt in
  by setting their own variable, `CLOUDFLARE_API_TOKEN` secret, and `PUBLIC_SITE_URL`.
- Deploys share a `deploy-production` concurrency group that never cancels, so two quick
  merges deploy in order instead of racing.

## Consequences

- Merging to `trunk` deploys. `npm run deploy` still works for a manual deploy.
- React bumps stay manual: update `dependencies` and `overrides` together.
