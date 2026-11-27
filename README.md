# Product Bet Review Studio

**An idea is a bet. Not a verdict.** Turn a product hypothesis and its supporting material into useful questions, a small proposed test and a human-owned decision.

**Signal → Question → Test → Decision**

| Explore | Location |
|---|---|
| Public product story | [GitHub Pages](https://amit1858.github.io/product-bet-review-studio/) |
| Interactive production app | [Open the protected production app](https://product-bet-review-studio-production.up.railway.app) — ask the host for the production passphrase. |
| Methodology and build pack | [Download the actual authored pack](showcase/assets/product-building-pack.md) |
| Idea starter | [Download the Product Bet starter](showcase/assets/product-bet-starter.md) |
| Full technical and operating guide | [Architecture, provider setup, privacy, tests and deployment boundaries](docs/technical-guide.md) |

## What it does

- **Material:** capture a hypothesis and supplied signals, with source labels and limits.
- **Questions:** correct the interpretation, answer what you know and leave gaps unknown.
- **Review:** connect claims to sources, consider a counterargument and propose a small test.
- **Decision:** choose proceed, test first, reshape or stop, then deliberately copy/export the rationale.

The optional guided tour teaches controls without changing work. **Try an example** explores a prewritten fictional journey without provider keys. **Presenter Demo** is a separate, deterministic click-through; it makes no provider or microphone requests and leaves the workspace unchanged.

All examples are **fictional and unverified**. Quotes checked against a supplied source do not become independently verified evidence. Proposed tests are not measured results. The agent advises; the human decides.

## Run the application locally

Requires Node.js 22+ and npm.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open **http://localhost:3000**. The prewritten example needs no credentials. Optional live analysis uses Claude; speech/translation/playback uses Sarvam. Personal tab keys require HTTPS and pass through the trusted same-origin backend. Never put keys in `VITE_` variables, commits, browser storage or static Pages files. See the [technical guide](docs/technical-guide.md) for precise setup and access boundaries.

```powershell
npm run check
npm run build
npm test
npm run test:e2e
```

Browser tests need Playwright Chromium installed. Provider tests use mocks. Physical devices, real screen readers, broader browser/zoom coverage and live-provider quality remain a separate validation pass.

## Two deployments, deliberately separate

**Railway runs the interactive app:** React/TypeScript/Vite assets plus the Express API, server-only integrations and existing access controls. Released application candidate: `bd5107fe7dd7fb253debdbc25e750ca74c8b9dc7`. Production uses a dedicated project and a manual approved-source upload, with no GitHub auto-deploy connection. Pages commits cannot redeploy it. No service, domain, authentication setting or secret is created or changed by the Pages workflow.

**GitHub Pages runs only `showcase/`:** a static product story, original diagrams, public-safe fictional screenshots and authored Markdown packs. It has no application API, keys, microphone integration, analytics or user-content collection. The Actions workflow checks relative assets and section links, then uploads only that directory. All site asset paths work below `/product-bet-review-studio/`.

To preview the public story, serve the repository with any local static HTTP server and open `/showcase/`. Run `node tools/check-showcase.mjs` before publishing. The workflow is `.github/workflows/pages.yml`; its pinned actions publish on relevant `main` changes or a manual dispatch.

### Production links and access

`showcase/config.json` is public and contains **no secrets**. Its verified production URL and `protected` access policy appear prominently in the story. Static HTML also contains the working app/guide links. Production access requires the host's shared passphrase; it is not published here. The unchanged candidate retains the legacy `STAGING_PASSWORD` configuration name and “Private staging access” sign-in wording, including in the separate production service.

For a future release, update `productionUrl`, `accessPolicy`, `accessNote` and the matching static HTML only after verification. A null/unverified configuration or loading error disables enhanced live links with an explicit notice. Recheck the app, idea-guide and builder-guide links before publishing. Never point it to protected staging and call that production.

## Privacy in brief

App work is in memory by default. Explicit draft consent saves only idea/supporting-material fields on that device until removed. Explicit app theme selection is persisted. Personal provider keys are tab-memory-only, but the backend necessarily receives a selected key for a live operation. Provider processing and hosting policies are separate from browser-state behavior. Read the [detailed boundaries](docs/technical-guide.md#session-only-bring-your-own-keys) before using sensitive material.
