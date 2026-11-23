# Product Bet Review Studio

A mobile-first, editorial PWA for deciding whether a product bet should **proceed, be tested, be reshaped, or stop**. The agent advises; the PM makes and records the decision.

## Run locally

Requires Node.js 22+ and npm. The repository initially contained only this README; there was no application to replace.

```powershell
npm ci
Copy-Item .env.example .env
# Edit .env with your server-side configuration.
npm run dev
```

Open **http://localhost:3000**. The fictional example works without keys. Live analysis and speech are explicitly unavailable until their respective providers are configured. A configured status means a key is present, not that billing or account access has been verified.

### Server configuration

`.env.example` contains variable names and explanatory comments, with no credentials. Never use `VITE_` variables for secrets, put keys in browser storage, or add a browser BYOK field.

| Variable | Purpose / default |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic Console API key with Messages API access and funded billing; required for live analysis |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5`; use an account-accessible model supporting structured outputs |
| `SARVAM_API_KEY` | Sarvam API subscription key with STT/TTS/translation access and quota |
| `SARVAM_TTS_MODEL` | `bulbul:v4-flash`; also supports `bulbul:v3` |
| `SARVAM_TTS_SPEAKER` | `shubh_enhi_companion` for v4-flash, `shubh` for v3; must match the chosen model's official voice catalog |
| `PORT` | `3000` |
| `HOST` | `127.0.0.1`; use `0.0.0.0` for containers |
| `APP_ORIGIN` | `http://localhost:3000`; deployed public HTTPS origin, with **no trailing slash or path** |
| `MAX_REQUESTS_PER_HOUR` | `300` combined provider requests per server process |
| `MAX_REQUESTS_PER_IP_10_MIN` | `60` combined requests per connection in ten minutes |
| `MAX_CONCURRENT_REQUESTS` | `4` concurrent API requests |

Restart the server after changing environment variables. Voice, pace, and **Read-aloud language** controls are available at the bottom of the app and remain in memory only. **As written · English / mixed** sends the selected original text to TTS. **Hindi · translate before speech** first translates that text with Sarvam, then synthesizes the Hindi result. Machine translation may change nuance; the original review, source quotes, PM decision, and exports remain authoritative and unchanged. The translated text is inspectable and stays in memory only; it is never sent to Claude. Hindi/English speech input and explicit speech-to-English transcription are separate capabilities.

Provider contracts checked against official documentation during implementation:

- [Sarvam STT](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/rest-api): `POST /speech-to-text`, multipart `file`, **`saaras:v4`**, `mode=codemix` or `translate`, `language_code=unknown`. Synchronous audio is limited to 30 seconds; this app uses a conservative **28-second** cap. Code-mixing preserves English in Latin script and Hindi in its native script; translate mode produces English.
- [Sarvam TTS](https://docs.sarvam.ai/api-reference/text-to-speech/convert): `POST /text-to-speech`, **`bulbul:v4-flash`**, `text`, **`language_code` (not `target_language_code`)**, `speaker`, `pace`; up to 2,500 characters per request. This app chunks at 2,400, requests 22,050Hz WAV and disables provider cached responses. Each `audios[]` entry is a separate base64 WAV file, decoded and played in order, never concatenated as encoded strings. WAV headers, PCM format, chunk bounds, and nonempty data are validated before delivery to the browser.
- [Sarvam translation](https://docs.sarvam.ai/api-reference/text/translate-text): `POST /translate`, **`mayura:v1`**, `input`, `source_language_code=auto`, `target_language_code=hi-IN`, `mode=formal`, `output_script=fully-native`, `numerals_format=international`; response `translated_text`. Mayura documents a 1,000-character input limit and automatic source detection. The app uses sentence-aware 900-character source chunks, validates each response with an application-only 5,000-character cap, bounds the complete spoken section to 18,000 characters, then rechunks for TTS. Invalid/overlong translation fails explicitly without synthesizing English as Hindi. No new environment variable is needed for this fixed translation path.
- [Official voice catalog](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices): model-specific lowercase speakers. The current v4-flash API lists `shubh_enhi_companion` (this app's default), `simran_enhi_companion`, and `ishita_enhi_companion`; these are English/Hindi companion voices. The API's own v4 default is `shubh_enhi_ads`, not the companion selected here. Catalog presence is not a live-account or voice-quality test.
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs): Messages API with `output_config.format`, schema validation and API version `2026-10-21`.
- [Claude models](https://platform.claude.com/docs/en/models/overview): model access and supported contracts can change; check these before substituting a model.

### Development-only Sarvam MCP

The PWA continues to use **direct server-side Sarvam REST**, not MCP. [Sarvam's official MCP](https://docs.sarvam.ai/api/developer-tools/mcp) is a development aid. Its documented Python 3.11+ package is `sarvam-mcp`; after installing it in an isolated environment, the entry point is `sarvam-mcp` (or `uvx sarvam-mcp`). Add it in your MCP client's local stdio settings:

```json
{
  "mcpServers": {
    "sarvam": {
      "command": "sarvam-mcp",
      "env": {}
    }
  }
}
```

Use the isolated environment's absolute executable path if it is not on PATH. The local `.mcp.json` entry prepared during this pass is ignored by git and source archives; import it only into a client supporting this format. It is **not proof the app has loaded or started the server**. Keep keys out of this JSON: inherit `SARVAM_API_KEY` from the developer process's environment or use the package's documented local credential store. Runtime `.env` loading does not automatically configure an MCP client.

**Verification limitation:** this coding environment supports MCP, but Sarvam was not loaded and `uvx` was unavailable. In this completion pass, one bounded isolated `pip install sarvam-mcp` attempt used only official public PyPI, with retries disabled and a 15-second timeout. Downloading `sarvam_mcp-0.3.0-py3-none-any.whl.metadata` from `files.pythonhosted.org` failed with **`SSLV3_ALERT_HANDSHAKE_FAILURE`**. No further attempt, TLS bypass, or mirror switch was made in this pass. The package did not start and **no `sarvam_code_*` result was obtained**. Contracts above were rechecked against official web documentation and non-billable mocked tests, not claimed as MCP builder verification.

Once installation is available, discover schemas first and use `sarvam_code_api_reference`, `sarvam_code_languages`, `sarvam_code_speakers`, `sarvam_code_snippet`, `sarvam_code_recommend_model`, and `sarvam_code_validate_request` for contract verification. Check `saaras:v4` codemix/translate, `bulbul:v4-flash`, companion IDs, Mayura automatic source detection/Hindi translation, fields, and limits. Builder tools are documented as non-billable; `sarvam_tools_*` may be billable. The current smoke-check allowance is **at most one synthetic STT, one TTS, and one translation call**, only after a key is securely configured, with no paid retries. No live call was made in this pass because credentials were absent. Do not copy developer MCP configs or credentials into the PWA, Docker image, or repository.

## Product and implementation

**React 19 + TypeScript + Vite**, served by Express 5. Zod schemas are shared between the browser and server. Anthropic's official SDK runs only on the server. Sarvam uses a small interchangeable `SpeechProvider` adapter.

The journey is welcome → material → up to four clarification questions → structured review → PM decision pack. The PM can correct the interpretation, revisit material, leave answers unknown, disagree with the recommendation, and edit their decision. Changing input or clarification answers invalidates downstream reviews and decisions.

The review presents source-linked evidence, limitations, assumptions, unknowns, a falsifiable challenge, proposed failure paths, and a concrete cheap test. Quotes are checked against their declared sources; this verifies **quotation provenance, not the truth of the source or the causal inference**. Generated claims remain explicitly unverified. Test thresholds are proposals, not results.

The final pack includes a concise leadership story: **signal → tension → what evidence supports / does not establish → implication → decision needed**. It reuses the first source-linked signal and its limitation, the existing challenge, and the proposed learning test, without another model call or invented validation. With no evidence, it says so explicitly. The same narrative appears in the UI, Markdown copy/export, and read-aloud. The PM's decision/rationale remain separate from the advisory agent recommendation, including when the PM disagrees.

The example is fictional, pre-authored, and clearly labeled. Its illustrative answers do not adapt to typed clarification responses. Choose **Run this example with Claude** when configured, or edit its material, for live analysis. Correcting its interpretation also switches to live analysis.

The design uses product-owned warm-white/charcoal tokens, a single rose accent, serif editorial headings, legible system body fonts, and labeled evidence/risk treatments. **Light mode is unconditional**, including with a dark OS preference; there is no dark-mode toggle, query-string theme switch, builder theme script, or builder branding. It has responsive cards, keyboard focus, 44px controls, reduced-motion support, and safe-area-aware playback controls.

### Voice behavior

- Tap **Speak** to start; tap **Stop & transcribe** to finish. There is no always-listening or full-duplex mode.
- Each turn automatically ends at **28 seconds**, with an explicit notice when capped or shortened. Browser-decoded audio is converted to mono 16kHz, 16-bit PCM WAV; the server validates the actual PCM duration and limits upload size.
- Default transcription preserves Hindi/English code-mixing. **Translate to English** is an explicit alternative.
- An editable transcript appears first. The main workflow is blocked until that transcript is added or discarded. Nothing reaches Claude merely because transcription completed.
- Microphone-denied, processing, empty-transcript, network, retry, and discard states keep text input available. Failed transcription can explicitly retry the in-memory recording; malformed transcripts do not enter the bet. Playback failures stay visible near the viewport rather than being hidden below the review.
- Read-aloud works on questions, the understood bet, evidence with provenance/limitations, assumptions, unknowns, pre-mortem paths, challenge, test, recommendation, leadership story, and final concise decision record. Stop cancels translation/synthesis/playback. Explicit replay reuses the most recent prepared audio without another translation or TTS request; changing settings or workflow stage clears that cache. Failures have explicit retry/replay controls, never automatic paid retries.
- Long speech uses sentence-aware chunks, including Hindi punctuation, with size-safe fallback. Hindi translation adds requests and latency before any TTS; each translation/TTS chunk consumes a separate shared request-budget unit. The spoken final pack intentionally omits full pasted source notes; copy/export includes those sources.

### Privacy and limits

No accounts, database, analytics, raw request logging, automatic external research, uploads of arbitrary documents, hosted BYOK, or automatic sharing.

Text, reviews, decisions, and audio stay in memory by default. Reloading clears them. The optional **Keep this unsent draft on this device** checkbox stores only idea/context text in localStorage. Saved drafts are not automatically restored; they must be restored or deleted explicitly. Unchecking deletes that draft. Browser storage is not encrypted and is accessible to people using the same browser. Audio is not stored in localStorage or the service-worker cache.

Starting or exploring an example pauses draft saving; the fictional material cannot silently replace a previously opted-in draft.

Live analysis sends material to **Anthropic**. STT sends recorded audio to **Sarvam**; translation sends selected source text to Sarvam; TTS sends the original or translated spoken text to Sarvam. Provider retention, account settings, and policies apply; session-only app behavior is **not a provider zero-retention guarantee**. Use synthetic or permissioned material for the showcase.

Errors are logged only as generic event/code/status metadata. Upstream error messages, API keys, prompts, transcripts, and recordings are not logged or returned as diagnostics. Requests have size (128KB JSON, bounded PCM audio), token, duration, timeout, concurrency, per-IP and process-wide limits. Disconnecting cancels a provider request but does not release its concurrency slot until the operation settles. There are no automatic paid-request retries.

Limits use in-memory stores. They reset on restart and are **not shared across replicas**. Origin checks are browser cross-origin protection, not authentication. For an internet-hosted showcase, use a single instance, provider-side spend limits, and an invite-only reverse-proxy/access policy. This MVP is not an abuse-proof public API.

Proxy trust is deliberately off: forwarded IP headers cannot bypass limits. Behind a reverse proxy, attendees may share its per-connection budget. Only change proxy trust with audited, network-specific deployment configuration; never blindly trust all forwarded headers.

## Production / self-host

```powershell
npm run build
npm run start
```

`npm run dev` provides Vite HMR and watches server changes. Production serves compiled assets plus the same server-side API; do not deploy just `dist` to a static host.

Alternatively:

```powershell
docker build -t bet-studio .
docker run --rm -p 127.0.0.1:3000:3000 --env-file .env bet-studio
```

When using a container, set `HOST=0.0.0.0` in the environment. Set `APP_ORIGIN` to the URL users actually open. Configure both keys in the host's secret environment, not in the image or repository. `.dockerignore` excludes real environment files.

Put an HTTPS reverse proxy in front of the Node service and serve the app at the origin root, not under a subpath. Microphone access, installation, service workers, and reliable clipboard support require HTTPS (localhost is the development exception). Disable proxy access/body logging and audio/request buffering to disk. Set provider-side budgets and access controls before opening the URL to attendees.

### Before any future hosted showcase

**No hosting or public exposure was performed in this refinement pass.** The app itself has no login or access gate. A safe future hosting arrangement must fail closed:

- Require an authenticated email allowlist / invitation policy at the HTTPS gateway for **every route, including `/api/*`**, not just the landing page. Deny anonymous users before requests reach Node; verify unauthenticated direct API requests are denied.
- Keep the Node port private to the gateway (loopback or a private container network). Do not expose a second ungated origin or publish a container port to all interfaces. Only the gateway should be able to reach it.
- Put secrets in the host's secret environment, set provider-side spending/quota alerts and hard limits where available, and start with one instance and low process-wide limits. In-memory request caps are not money-denominated or durable billing controls.
- Disable gateway/body/diagnostic recording, disk request buffering, and API response caching. Forward aborts; allow enough upstream time for the bounded 75-second analysis / 45-second speech and translation requests (Anthropic SDK timeout: 70 seconds). Use synthetic or permissioned material only.
- Event Wi-Fi, NAT, and the reverse proxy can pool participants behind a connection limit. Test the actual venue path, keep short turns, account for shared limits, and use the explicit fictional example if connectivity or quota fails; never silently retry a paid call.

The public shell can still be opened from an already installed offline cache after gateway access is revoked. That shell contains no provider credentials or cached reviews/audio. Locally opted-in drafts remain device data; revoking hosted access cannot remotely erase them. The gateway must independently authorize **every live API request**.

### PWA and offline behavior

The manifest, ordinary/maskable PNG icons, and versioned service worker are included. Install using the browser's install action, or **Share → Add to Home Screen** on supported mobile browsers.

Production builds precache the public shell and hashed static assets. API responses, audio, and user context are never cached. After an initial online visit, the welcome/example and text editing can work offline. **AI and speech do not work offline.** Unsent text is retained only with explicit device-draft consent.

The service worker does not force an update/reload while a PM is working. A waiting-version notice asks the PM to finish/export, close all Studio tabs, and reopen. Build IDs include public manifest/icon content as well as compiled assets. Cache lookups are scoped to the current release; navigation falls back only on a network failure, never on a gateway's 401/403 or other HTTP error. `/api` and `/api/*`, non-GET traffic, and unlisted media are not intercepted. If initial installation fails, the UI warns that offline access is unavailable; a failed update keeps the existing installed version and active work available.

### Source/archive hygiene

Local MCP/editor tooling, virtual environments, worktree metadata, real `.env` files, dependencies, build output, logs, and test reports are excluded from source archives and/or Docker contexts with `.gitignore`, `.gitattributes`, and `.dockerignore`. `.env.example`, source, tests, documentation, and the npm lockfile remain in the source archive. Git archives exclude **tracked** paths only; inspect any ad-hoc ZIP separately. Never archive the whole working directory or a developer's home/config directory as a release.

## Checks

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Unit/integration tests cover structured output, exact source quotes, unsupported references, duplicate decisions, missing configuration, provider errors, audio duration, current Sarvam request fields including translation, sentence-aware chunking, origin checks, payload bounds, and shared request limits despite spoofed forwarded headers.

Production browser tests cover desktop and phone layouts (including dark OS preferences with an always-light app); readable text/action contrast; grounded leadership narrative and human/agent decision separation; download; live-workflow retry and invalidation; consented mixed-language/translated transcripts; denied microphones and capped recordings; Hindi translation before TTS, malformed-translation failures, grounded finding-level speech, stop/replay without new requests and visible playback errors; draft isolation/restoration; and real offline service-worker behavior. Production PWA tests also verify manifest/icon paths and PNG dimensions, actual installation, waiting-version notices without lost input, activation after closing tabs, old-cache cleanup, and failed initial installation/update. Unit tests exercise cache/auth boundaries and corrupt WAV rejection. Provider responses in automated tests are explicitly mocked; no paid calls are made.

**Live provider quality and real-phone behavior remain unverified.** After secure key configuration, use only the limited synthetic Sarvam smoke allowance above. Further provider calls, including Claude and additional language/voice comparisons, need separate approval. Automated fixtures cannot verify account access, billing, model availability, translation fidelity, regional latency, transcription quality, or the selected voice. Container deployment and physical iOS/Android installation also require host/device checks.

### Manual next-pass checklist

- [ ] Resolve the local package-download/TLS issue without disabling verification; launch Sarvam MCP, discover schemas, and run only the builder checks listed above. Record any documentation discrepancy before changing runtime contracts.
- [ ] Check welcome → material → clarification → review → decision pack on narrow Android/iOS and desktop, with system dark mode enabled, keyboard navigation, long Hindi/English text, and device safe areas.
- [ ] Start with missing keys and confirm the explicit example/unavailable states. Use synthetic material to check correction/invalidation, unknown answers, no-evidence narrative, and a PM decision that differs from the agent. Confirm copy/download includes the unchanged rationale and full sources.
- [ ] When a key is securely configured, make at most one synthetic STT, one TTS, and one Hindi-translation call; record outcomes and do not retry paid failures. Additional Claude, language-mode, or voice-quality comparisons require separate approval.
- [ ] On a real phone, verify edited transcript consent, retry/discard, the 28-second cap, Hindi translation fidelity and unchanged written record, all returned WAV segments, blocked autoplay, stop/abort/replay, and long-text chunking. Use mocks or the permitted synthetic smoke calls until broader paid testing is approved.
- [ ] On physical devices, test microphone-denied/unavailable/interrupted states, install icons, airplane-mode shell/example, explicit unencrypted draft restore/delete, and failed/slow networks. Confirm API/text/audio are absent from Cache Storage.
- [ ] Repeat the automated two-version worker lifecycle check on a physical installed PWA: retain active work while waiting, close all app clients, reopen, and confirm the new shell and cache cleanup. Desktop Chromium automation does not prove iOS/Android installed-app behavior.
- [ ] Only after separately approving a hosted deployment, verify the gateway deny/allow list, private origin, API authorization, provider spending controls, request logging disabled, venue Wi-Fi limits, and secret-free Docker/source archives.

## 45-minute demo runbook

| Time | Demonstration |
| --- | --- |
| 0–5 min | Start on the editorial welcome. Explain “the agent advises; the PM decides,” privacy and the fictional example. |
| 5–10 min | Explore the illustrative review. Open a source quote; distinguish a complaint from evidence of causality. |
| 10–18 min | Start the preset again and choose **Run this example with Claude**, or paste a synthetic bet. Show focused questions; correct the interpretation and leave one answer unknown. |
| 18–25 min | Speak a short Hindi/English answer. Stop recording, edit the transcript, and explicitly add it. Read a question aloud; stop playback. |
| 25–33 min | Run the live review. Discuss the riskiest assumption, pre-mortem, proposed test and its stop threshold. Compare the agent recommendation with the evidence. |
| 33–40 min | Deliberately disagree with the agent. Select a PM decision and record the rationale. Copy or download the decision pack; point to separate PM/agent sections. |
| 40–45 min | Show install/offline behavior and explicit draft consent. Explain limitations and attendee self-host setup. |

This pass remains local. Before any separately approved hosted session, enforce the gateway/spend controls above, verify provider configuration within the approved paid-call allowance, test microphone permissions and chosen voices, prime the production shell online, and keep the illustrative example ready. Use short turns and small material to keep latency/cost predictable. Do not claim the illustrative fallback is a live integration if a provider fails. Retry only by explicit action and within the approved allowance; if quota/authentication fails, explain it and use the labeled example.

## File-level guide

| Files | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/styles.css`, `src/sample.ts` | Editorial journey, design tokens, review/decision screens, fictional scenario |
| `shared/schema.ts` | Input/output contracts, source identifiers/checks, deterministic full decision pack |
| `src/Voice.tsx`, `src/audio.ts`, `src/api.ts` | Recording/transcript consent, resampling, playback, provider requests and errors |
| `server/claude.ts`, `server/speech.ts` | Controlled Claude stages and replaceable Sarvam adapter |
| `server/app.ts`, `server/config.ts`, `server/errors.ts`, `server/index.ts` | Server-only keys, origin/usage/payload limits, error sanitization, serving |
| `src/useDraft.ts` | Explicit, device-local unsent-draft persistence |
| `pwa/sw.js`, `vite.config.ts`, `src/main.tsx`, `public/manifest.webmanifest`, `public/icons/` | Versioned static-only caching, registration, installation assets |
| `.env.example`, `Dockerfile`, `.dockerignore`, `package.json` | Self-host configuration, build and deployment |
| `tests/`, `playwright.config.ts` | Focused workflow, adapter and production-browser coverage |

## Known limitations / deliberate scope

- One controlled workflow, no autonomous agents, accounts, history, document parsing, external research, PRD/prototype generation, or team sharing.
- Clarification and review are two bounded model calls; packs are assembled locally to preserve the PM's decision. No streaming output or speculative partial conclusions.
- A validated quotation can still describe unreliable source material. Schema checks do not prove the model's reasoning is correct.
- Turn-based voice favors reliability over uninterrupted dictation. Capture depends on browser MediaRecorder/AudioContext support; playback may need a second tap under strict autoplay policies.
- The exported Markdown contains full sources. Review it before sharing; there is no hosted sharing endpoint or generated PDF.
- Device drafts cover only the initial material, not clarification answers or the complete review. There is no automatic recovery after a reload without prior consent.
- Single-process budgets are showcase safeguards, not durable billing limits or distributed rate limiting.
