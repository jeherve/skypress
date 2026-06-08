# SkyPress

A standalone, long-form writing studio for the **AT Protocol** (the open network
behind Bluesky). Write rich, block-based articles in the WordPress "Gutenberg" editor
— used entirely on its own, no WordPress behind it — and publish them to **your own
Personal Data Server (PDS)**. Your data is yours; SkyPress is just the studio you write
in.

> Status: early construction. **SP0 (Foundations + Editor Spike) is complete** — the
> riskiest path is proven end-to-end. See the roadmap below.

## How it works

- The editor is Automattic's [`isolated-block-editor`](https://github.com/Automattic/isolated-block-editor)
  (standalone Gutenberg). The canonical content is the **Gutenberg block tree**.
- On publish (SP2+), SkyPress writes two records to the writer's PDS: a
  `site.standard.document` holding the block tree, and a companion `app.bsky.feed.post`
  (the POSSE pattern). Reading pages are rendered back from the block tree.
- It's an **editor + OAuth client + public renderer** — never a PDS, never a relay.

## Architecture at a glance

- **Stack:** [Astro](https://astro.build) + **React 18** islands (Decision 0001).
  React 18 is required by the bundled `@wordpress/*` packages.
- **Editor** (`/editor`): a `client:only="react"` island — its weight is confined to
  that route.
- **Reading pages** (`/`, `/preview`, later `/<handle>/<slug>`): rendered to light HTML
  with a **dependency-free renderer** (`src/lib/blocks/render.ts`) whose fidelity is
  locked to the real `@wordpress/blocks.serialize()` by tests. Reading pages ship **0
  JS** (Decision 0003).

## Getting started

```sh
npm install      # installs @wordpress/* pinned to one consistent version line
npm run dev      # dev server (editor at /editor, sample article at /preview)
npm run build    # static production build
npm test         # Vitest: block round-trip + render fidelity + textContent
```

Requires Node ≥ 20.

## Project layout

```
src/
  pages/        index, editor (island), preview (server-rendered article)
  components/   SkyEditor.tsx — the editor island
  lib/blocks/   render.ts (dependency-free reader) · serialize.ts (@wordpress oracle)
                allowlist.ts (curated content model) · sample.ts (fixture)
docs/
  decisions/    one file per non-obvious decision (context, options, choice, why)
  specs/        per-sub-project specs (SP0, SP1, …)
```

## Roadmap

| | Sub-project | Status |
|---|---|---|
| SP0 | Foundations + editor spike | ✅ Complete |
| SP1 | atproto OAuth, session, the `Agent` | ✅ Complete |
| SP2 | Lexicon (`blog.skypress.*`) + two-record publish | ✅ Complete |
| SP3 | Image/blob pipeline (`mediaUpload` → `uploadBlob`) | ✅ Complete |
| SP4 | Public renderer (`/@<handle>/<rkey>`, link tags, edge SSR, sanitisation) | ✅ Complete |
| SP5 | Edit flow (the "puppy problem") + unpublish | ✅ Complete |
| SP6 | Brand identity | ✅ Complete |
| SP7 | Deploy to Cloudflare | ✅ Deploy-ready (edge-verified; `npm run deploy`) |

## Deploy (Cloudflare)

SkyPress deploys to **Cloudflare Workers (Static Assets)** via `@astrojs/cloudflare`
(Decision 0009). The read-through renderer runs as the Worker; everything else is static.
No database/KV — `nodejs_compat` (in `wrangler.toml`) lets the reader's sanitiser run on
the edge.

```sh
npx wrangler login   # one-time, owner's Cloudflare account
npm run deploy        # astro build && wrangler deploy
```

Then attach `skypress.blog` as a custom domain in the Cloudflare dashboard. Full runbook +
verification: [`docs/specs/sp7-deploy.md`](./docs/specs/sp7-deploy.md).

## License

[GPL-2.0-only](./LICENSE) — WordPress/Gutenberg lineage; aligns with the
open-source, your-data-is-yours ethos.
