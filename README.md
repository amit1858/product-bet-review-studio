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

`.env.example` contains variable names only. Never use `VITE_` variables for secrets, put keys in browser storage, or add a browser BYOK field.

| Variable | Purpose / default |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic Console API key with Messages API access and funded billing; required for live analysis |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5`; use an account-accessible model supporting structured outputs |
| `SARVAM_API_KEY` | Sarvam API subscription key with STT/TTS access and quota |
| `SARVAM_TTS_MODEL` | `bulbul:v4-flash`; also supports `bulbul:v3` |
| `SARVAM_TTS_SPEAKER` | `shubh_enhi_companion` for v4-flash, `shubh` for v3; must match the chosen model's official voice catalog |
| `PORT` | `3000` |
| `HOST` | `127.0.0.1`; use `0.0.0.0` for containers |
| `APP_ORIGIN` | `http://localhost:3000`; deployed public HTTPS origin, with **no trailing slash or path** |
| `MAX_REQUESTS_PER_HOUR` | `300` combined provider requests per server process |
| `MAX_REQUESTS_PER_IP_10_MIN` | `60` combined requests per connection in ten minutes |
| `MAX_CONCURRENT_REQUESTS` | `4` concurrent API requests |

Restart the server after changing environment variables. Voice, pace, and playback-language controls are available at the bottom of the app and remain in memory only. The language setting guides pronunciation; it does not translate the written review.

Provider contracts checked against official documentation during implementation:

- [Sarvam STT](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe): `POST /speech-to-text`, multipart `file`, **`saaras:v4`**, `mode=codemix` or `translate`, `language_code=unknown`. The REST endpoint is intended for turns under 30 seconds.
- [Sarvam TTS](https://docs.sarvam.ai/api-reference/text-to-speech/convert): `POST /text-to-speech`, **`bulbul:v4-flash`**, `text`, `language_code`, `speaker`, `pace`; up to 2,500 characters. Responses contain base64 WAV audio. Speakers are model-specific.
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs): Messages API with `output_config.format`, schema validation and API version `2026-10-21`.
- [Claude models](https://platform.claude.com/docs/en/models/overview): model access and supported contracts can change; check these before substituting a model.

## Product and implementation

**React 19 + TypeScript + Vite**, served by Express 5. Zod schemas are shared between the browser and server. Anthropic's official SDK runs only on the server. Sarvam uses a small interchangeable `SpeechProvider` adapter.

The journey is welcome → material → up to four clarification questions → structured review → PM decision pack. The PM can correct the interpretation, revisit material, leave answers unknown, disagree with the recommendation, and edit their decision. Changing input or clarification answers invalidates downstream reviews and decisions.

The review presents source-linked evidence, limitations, assumptions, unknowns, a falsifiable challenge, proposed failure paths, and a concrete cheap test. Quotes are checked against their declared sources; this verifies **quotation provenance, not the truth of the source or the causal inference**. Generated claims remain explicitly unverified. Test thresholds are proposals, not results.

The example is fictional, pre-authored, and clearly labeled. Its illustrative answers do not adapt to typed clarification responses. Choose **Run this example with Claude** when configured, or edit its material, for live analysis. Correcting its interpretation also switches to live analysis.

The design uses reusable warm-white/charcoal Clawpilot tokens, a single rose accent, serif editorial headings, legible system body fonts, and labeled evidence/risk treatments. It has responsive cards, keyboard focus, 44px controls, and reduced-motion support. Welcome and representative review screens were built and visually inspected before the full flow was applied.

### Voice behavior

- Tap **Speak** to start; tap **Stop & transcribe** to finish. There is no always-listening or full-duplex mode.
- Each turn automatically ends at **28 seconds**. Browser-decoded audio is converted to mono 16kHz, 16-bit PCM WAV; the server validates the actual PCM duration and limits upload size.
- Default transcription preserves Hindi/English code-mixing. **Translate to English** is an explicit alternative.
- An editable transcript appears first. The main workflow is blocked until that transcript is added or discarded. Nothing reaches Claude merely because transcription completed.
- Microphone-denied, processing, empty-transcript, network, retry, and discard states keep text input available.
- Read-aloud works on questions, the understood bet, challenge, test, recommendation, and final concise decision record. Stop cancels synthesis/playback; repeat playback reuses the most recent prepared audio in memory.
- Long speech is split into bounded TTS requests. The spoken final pack intentionally omits full pasted source notes; copy/export includes those sources.

### Privacy and limits

No accounts, database, analytics, raw request logging, automatic external research, uploads of arbitrary documents, hosted BYOK, or automatic sharing.

Text, reviews, decisions, and audio stay in memory by default. Reloading clears them. The optional **Keep this unsent draft on this device** checkbox stores only idea/context text in localStorage. Saved drafts are not automatically restored; they must be restored or deleted explicitly. Unchecking deletes that draft. Browser storage is not encrypted and is accessible to people using the same browser. Audio is not stored in localStorage or the service-worker cache.

Live analysis sends material to **Anthropic**. STT sends recorded audio to **Sarvam**; TTS sends selected text to Sarvam. Provider retention, account settings, and policies apply; session-only app behavior is **not a provider zero-retention guarantee**. Use synthetic or permissioned material for the showcase.

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
docker run --rm -p 3000:3000 --env-file .env bet-studio
```

When using a container, set `HOST=0.0.0.0` in the environment. Set `APP_ORIGIN` to the URL users actually open. Configure both keys in the host's secret environment, not in the image or repository. `.dockerignore` excludes real environment files.

Put an HTTPS reverse proxy in front of the Node service and serve the app at the origin root, not under a subpath. Microphone access, installation, service workers, and reliable clipboard support require HTTPS (localhost is the development exception). Disable proxy access/body logging and audio/request buffering to disk. Set provider-side budgets and access controls before opening the URL to attendees.

### PWA and offline behavior

The manifest, ordinary/maskable PNG icons, and versioned service worker are included. Install using the browser's install action, or **Share → Add to Home Screen** on supported mobile browsers.

Production builds precache the public shell and hashed static assets. API responses, audio, and user context are never cached. After an initial online visit, the welcome/example and text editing can work offline. **AI and speech do not work offline.** Unsent text is retained only with explicit device-draft consent.

The service worker does not force an update/reload while a PM is working. New releases activate after old tabs close. If the installation fails, the UI explicitly warns that offline access is unavailable.

## Checks

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Unit/integration tests cover structured output, exact source quotes, unsupported references, duplicate decisions, missing configuration, provider errors, audio duration, current Sarvam request fields, origin checks, payload bounds, and request limits.

Production browser tests cover desktop, phone and dark phone layouts; readable text/action contrast; human/agent decision separation; download; live-workflow retry and invalidation; consented mixed-language transcripts; denied microphones; stop/replay; opt-in draft restoration; and real offline service-worker behavior. Provider responses in automated tests are explicitly mocked; no paid calls are made.

**Before a live showcase, perform a real Claude request and real Hindi/English STT and TTS with the deployed keys.** Automated fixtures cannot verify account access, billing, model availability, regional latency, transcription quality, or the selected voice. Container deployment and physical iOS/Android installation also require host/device checks.

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

Before the session: deploy over HTTPS, verify provider configuration and quota with a real turn, test microphone permissions and chosen voices, prime the production shell online, and keep the illustrative example ready. Use short turns and small material to keep latency/cost predictable. Do not claim the illustrative fallback is a live integration if a provider fails. Retry only by explicit action; if quota/authentication fails, explain it and use the labeled example.

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
