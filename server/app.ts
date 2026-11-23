import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { inputSchema } from '../shared/schema';
import { createClaude } from './claude';
import { type Config, voicesFor } from './config';
import { AppError } from './errors';
import { createSarvam, MAX_AUDIO_BYTES, sttOptionsSchema, translationInputSchema, ttsInputSchema } from './speech';
import { containsCredential, credentialHeaders, providerForPath, providerKeySchema, type Provider } from '../shared/credentials';

export type Providers = {
  claude: ReturnType<typeof createClaude>;
  speech: ReturnType<typeof createSarvam>;
};
type ProviderFactories = { claude: typeof createClaude; speech: typeof createSarvam };
const credentialSlot = Symbol('request-provider-credential');
type CredentialRequest = Request & { [credentialSlot]?: { provider: Provider; key: string } };

export function createApp(config: Config, providers: Providers = { claude: createClaude(config), speech: createSarvam(config) }, production = false,
  factories: ProviderFactories = { claude: createClaude, speech: createSarvam }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustedProxies.length) app.set('trust proxy', config.trustedProxies);
  app.use((req: CredentialRequest, res, next) => {
    const supplied = (['claude', 'sarvam'] as const).flatMap(provider => {
      const header = credentialHeaders[provider].toLowerCase();
      const value = req.headers[header];
      const count = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === header).length;
      delete req.headers[header];
      return value === undefined ? [] : [{ provider, value, count }];
    });
    req.rawHeaders = req.rawHeaders.filter((_, index, headers) =>
      !Object.values(credentialHeaders).some(header => header.toLowerCase() === headers[index - index % 2].toLowerCase()));
    if (!supplied.length) return next();
    res.setHeader('Cache-Control', 'no-store');
    const selected = supplied[0];
    if (supplied.length !== 1 || selected.count !== 1 || selected.provider !== providerForPath(req.path)) {
      return next(new AppError(400, 'invalid_credentials', 'Send only the key for the provider used by this request.'));
    }
    if (!req.secure || !config.origin.startsWith('https://')) {
      return next(new AppError(403, 'credentials_require_https', 'Personal provider keys require the configured HTTPS Studio URL.'));
    }
    const parsed = providerKeySchema.safeParse(selected.value);
    if (!parsed.success) return next(new AppError(400, 'invalid_credentials', 'The provider key must be a nonempty, single-line value of at most 512 characters.'));
    req[credentialSlot] = { provider: selected.provider, key: parsed.data };
    const discard = () => { delete req[credentialSlot]; };
    res.once('finish', discard); res.once('close', discard);
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: production ? {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
        fontSrc: ["'self'"], imgSrc: ["'self'", 'data:'], mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"], workerSrc: ["'self'"], objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    } : false,
    strictTransportSecurity: production,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
    next();
  });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/status', (_req, res) => res.json({
    ai: !!config.anthropicKey, speech: !!config.sarvamKey,
    ttsModel: config.ttsModel, voices: voicesFor(config), defaultVoice: config.ttsSpeaker,
  }));
  app.use('/api', (req, _res, next) => {
    if (req.method !== 'POST') return next(new AppError(404, 'not_found', 'This API route does not exist.'));
    if (req.get('origin') !== config.origin) return next(new AppError(403, 'origin_rejected', 'This request came from an unapproved origin. Open the configured Studio URL.'));
    next();
  });
  app.use('/api', rateLimit({
    windowMs: 10 * 60 * 1000, limit: config.ipLimit, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'This connection has reached its request limit. Wait up to 10 minutes; your text is unchanged.' },
  }));
  app.use('/api', rateLimit({
    windowMs: 60 * 60 * 1000, limit: config.hourlyLimit, keyGenerator: () => 'showcase-budget',
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'The hosted Studio has reached its hourly usage limit. Please return later or explore the illustrative example.' },
  }));
  app.use('/api', express.json({ limit: '128kb', type: 'application/json' }));
  let active = 0;
  const slots = new WeakMap<Response, () => void>();
  app.use('/api', (_req, res, next) => {
    if (active >= config.concurrency) return next(new AppError(503, 'server_busy', 'The Studio is handling other requests. Please wait a moment and retry.'));
    active++;
    let released = false;
    const release = () => { if (!released) { active--; released = true; } };
    slots.set(res, release);
    res.once('close', release);
    next();
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 1, parts: 2 },
    fileFilter: (_req, file, cb) => {
      if (!['audio/wav', 'audio/wave', 'audio/x-wav'].includes(file.mimetype)) {
        cb(new AppError(400, 'invalid_audio', 'Record audio using the Speak control; only WAV recordings are accepted.'));
      } else cb(null, true);
    },
  });
  function bounded(req: Request, res: Response, milliseconds: number): AbortSignal {
    const controller = new AbortController();
    const close = () => controller.abort();
    res.once('close', close);
    req.once('aborted', close);
    if (res.destroyed || req.aborted) controller.abort();
    return AbortSignal.any([controller.signal, AbortSignal.timeout(milliseconds)]);
  }
  async function execute<T>(req: CredentialRequest, res: Response, milliseconds: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const release = slots.get(res);
    const credential = req[credentialSlot];
    if (release) res.off('close', release);
    try {
      const result = await operation(bounded(req, res, milliseconds));
      if (credential && containsCredential(result, credential.key)) {
        throw new AppError(502, 'unsafe_provider_response', 'The provider returned unsafe content. No result was accepted; your text is unchanged.');
      }
      return result;
    } finally {
      if (credential) credential.key = '';
      delete req[credentialSlot]; release?.(); slots.delete(res);
    }
  }
  function claudeFor(req: CredentialRequest) {
    const credential = req[credentialSlot];
    delete req[credentialSlot];
    return credential ? factories.claude({ ...config, anthropicKey: credential.key, sarvamKey: '' }) : providers.claude;
  }
  function speechFor(req: CredentialRequest) {
    const credential = req[credentialSlot];
    delete req[credentialSlot];
    return credential ? factories.speech({ ...config, sarvamKey: credential.key, anthropicKey: '' }) : providers.speech;
  }
  app.post('/api/clarify', async (req, res) => {
    const input = inputSchema.parse(req.body);
    res.json(await execute(req, res, 75000, signal => claudeFor(req).clarify(input, signal)));
  });
  app.post('/api/review', async (req, res) => {
    const input = inputSchema.parse(req.body);
    res.json(await execute(req, res, 75000, signal => claudeFor(req).review(input, signal)));
  });
  app.post('/api/speech/transcribe', upload.single('audio'), async (req, res) => {
    const { mode } = sttOptionsSchema.parse(req.body);
    if (!req.file) throw new AppError(400, 'missing_audio', 'No recording was received. Please record again.');
    const audio = req.file.buffer;
    res.json(await execute(req, res, 45000, signal => speechFor(req).transcribe(audio, mode, signal)));
  });
  app.post('/api/speech/speak', async (req, res) => {
    const input = ttsInputSchema.parse(req.body);
    res.json(await execute(req, res, 45000, signal => speechFor(req).speak(input, signal)));
  });
  app.post('/api/speech/translate', async (req, res) => {
    const { text } = translationInputSchema.parse(req.body);
    res.json(await execute(req, res, 45000, signal => speechFor(req).translate(text, signal)));
  });
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'not_found', 'This API route does not exist.')));
  const handler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    let safe: AppError;
    if (error instanceof AppError) safe = error;
    else if (error instanceof z.ZodError) safe = new AppError(400, 'invalid_input', 'Check your input and text limits. The request was not sent to a provider.');
    else if (error instanceof multer.MulterError) safe = new AppError(400, 'upload_limit', 'The recording exceeds the allowed size or format. Record a shorter turn (up to 28 seconds).');
    else if (error instanceof SyntaxError) safe = new AppError(400, 'invalid_json', 'The request body could not be read. Please retry.');
    else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') safe = new AppError(413, 'input_limit', 'This request is too large. Shorten the material and retry.');
    else safe = new AppError(500, 'server_error', 'The Studio could not complete the request. Your input is unchanged; please retry.');
    console.warn(JSON.stringify({ event: 'request_error', code: safe.code, status: safe.status }));
    if (!res.headersSent && !res.destroyed) res.status(safe.status).json({ error: safe.message, code: safe.code });
  };
  app.use(handler);
  return app;
}
