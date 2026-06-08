# SkyPress

A standalone, long-form writing studio for the **AT Protocol** (the open network behind
Bluesky). Writers compose rich, block-based articles in the WordPress "Gutenberg" editor —
used entirely on its own, no WordPress behind it — and publish them to **their own Personal
Data Server (PDS)**. The writer owns their data; SkyPress is just the studio they write in,
plus a public renderer for reading.

SkyPress is an **editor + OAuth client + public renderer** — never a PDS, never a relay.
It runs as a single Astro app on Cloudflare with **no database**: the public reader
resolves articles on demand (`handle → DID → PDS → record → HTML`).

This guide is for developers who want to **run their own instance**.

---

## Prerequisites

- **Node ≥ 20** and npm.
- A **Cloudflare account** with a **domain managed in Cloudflare** (for production).
- An **AT Protocol / Bluesky identity** to sign in and test publishing.

---

## Quick start (local)

```sh
git clone <your fork> skypress && cd skypress
cp .env.example .env          # set PUBLIC_SITE_URL (see Configuration)
npm install                   # installs the @wordpress/* tree (pinned — see Notes)
npm run dev                   # http://localhost:4321
```

Open the studio at **`http://127.0.0.1:4321/editor`** — use the IP, not `localhost`:
atproto's development ("loopback") OAuth client requires an IP origin, so sign-in only
works on `127.0.0.1`. Sign in with your handle, write, and publish.

> Publishing is real: it writes records to your PDS **and creates a public Bluesky post**
> linking to the article. The UI says so before you confirm.

Other scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (editor + reader, hot reload) |
| `npm run build` | Production build (Cloudflare Worker + static assets) |
| `npm run preview` | Run the built worker locally on `workerd` |
| `npm run deploy` | `astro build && wrangler deploy` |
| `npm test` | Vitest (block round-trip + render fidelity, publish builders, SSRF guard, …) |
| `npm run check` | `astro check` (types) |

---

## Configuration

One setting matters for self-hosting — your public origin:

```sh
# .env
PUBLIC_SITE_URL=https://yourdomain.example
```

It's baked into the build and used for the stored publication/article URLs and the Bluesky
post link, so it **must match the domain you serve from**. The OAuth client metadata and
redirect URIs adapt to the request origin automatically, so there's nothing else to set.

Optional: rename the worker in [`wrangler.toml`](./wrangler.toml) (`name`) and the
displayed app name in [`src/pages/client-metadata.json.ts`](./src/pages/client-metadata.json.ts)
(`client_name`, shown on the Bluesky consent screen).

---

## Deploy your own (Cloudflare)

SkyPress targets **Cloudflare Workers with Static Assets** (via `@astrojs/cloudflare`). The
on-demand reader runs as the Worker; everything else is static. No KV/D1/queues —
`nodejs_compat` (already set in `wrangler.toml`) lets the reader's HTML sanitiser run on the
edge.

```sh
npx wrangler login                      # once
echo "PUBLIC_SITE_URL=https://yourdomain.example" > .env
npm run deploy
```

Then, in the Cloudflare dashboard, attach **your domain** as a custom domain on the
deployed Worker. Verify:

1. `https://yourdomain.example/client-metadata.json` returns JSON (the OAuth client doc,
   generated from the request origin).
2. `https://yourdomain.example/editor` → sign in → publish → open the resulting
   `https://yourdomain.example/@<handle>/<rkey>`.

Use the **apex** origin you set in `PUBLIC_SITE_URL` (don't mix `www`), since the OAuth
`client_id` is origin-specific. Detailed notes + gotchas (e.g. the editor's canonical
trailing-slash path) live in [`docs/specs/sp7-deploy.md`](./docs/specs/sp7-deploy.md).

---

## How it works

- **Editor** (`/editor`): Automattic's [`isolated-block-editor`](https://github.com/Automattic/isolated-block-editor)
  (standalone Gutenberg) as a single `client:only` React island. The canonical content is
  the **Gutenberg block tree**.
- **Publish:** writes a `site.standard.publication` (once), a `site.standard.document`
  (block tree + plain-text `textContent`), and a companion `app.bsky.feed.post` — the POSSE
  pattern. Images upload to the PDS as blobs (`uploadBlob`); the document stores the typed
  blob ref.
- **Reader** (`/@<handle>/<rkey>`): resolves identity, fetches the record, and renders the
  block tree to **light HTML with zero JavaScript**, reconstructing blob image URLs and
  **sanitising** the untrusted content. Other apps that don't understand the block format
  fall back to `textContent`.
- **Auth:** a browser OAuth public client (PKCE/DPoP) — no backend, no secrets.

The content lexicon is documented in [`lexicons/`](./lexicons/README.md); the design
rationale for each non-obvious choice is in [`docs/decisions/`](./docs/decisions/).

---

## Project layout

```
src/
  pages/        index · editor · dashboard · client-metadata.json.ts (OAuth client doc, worker route)
                [author]/index.astro (author index) · [author]/[slug]/index.astro (publication)
                · [author]/[slug]/[rkey].astro (read-through document reader)
  components/   Studio · SkyEditor · PublishPanel · MyArticles · Dashboard · PublicationForm · Logo
  lib/
    blocks/     render.ts (dependency-free reader) · serialize.ts (@wordpress oracle) · allowlist.ts
    auth/       oauth.ts · AuthProvider.tsx · config.ts · LoginForm.tsx
    publish/    records.ts (pure builders) · publisher.ts (Agent orchestration) · publications.ts (publication CRUD)
    media/      mediaUpload.ts · uploadImage.ts (logo) · blob.ts · pds.ts
    reader/     identity.ts · records.ts · publications.ts · profile.ts · sanitize.ts
    net/        safe-fetch.ts (SSRF guard for the reader's outbound fetches)
lexicons/       blog.skypress.content.gutenberg.json + README
docs/           decisions/ (why) · specs/ (how) · brand/
astro.config.mjs · wrangler.toml
```

---

## Notes if you fork

- **React 18 only.** The bundled `@wordpress/*` packages require `react@^18.3`; React 19
  will break the editor.
- **The whole `@wordpress/*` tree is version-pinned** via `overrides` in `package.json` to
  the exact line `isolated-block-editor` bundles. Caret ranges otherwise pull a newer line
  and crash the editor with duplicate data registries. Bumping `isolated-block-editor`
  means regenerating that override map.
- **Reading pages never import `@wordpress`** — the editor stack is browser-only and can't
  render server-side. The reader uses the dependency-free `src/lib/blocks/render.ts`, whose
  output fidelity is locked to the real serializer by tests.
- **Untrusted content** from arbitrary PDSes is always sanitised before rendering, and any
  server-side fetch to a user-derived host goes through `src/lib/net/safe-fetch.ts`.

---

## License

[GPL-2.0-or-later](./LICENSE) — WordPress/Gutenberg lineage; aligns with the open-source,
your-data-is-yours ethos.
