import express, { type Request } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Config } from './config';

const cookieName = '__Host-studio-staging';
const sessionSeconds = 8 * 60 * 60;

export function secureRequest(req: Request, config: Config) {
  // Railway's HTTPS-only edge supplies these headers. No public TCP proxy or other
  // service may be added to this isolated staging project's private network.
  return req.secure || (config.railway && req.get('x-forwarded-proto') === 'https' &&
    req.get('host') === new URL(config.origin).host);
}

export function railwayClient(req: Request) {
  const address = req.get('x-real-ip');
  return ipKeyGenerator(address && isIP(address) ? address : req.socket.remoteAddress || '127.0.0.1');
}

export const stagingWorker = `
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith('product-bet-studio-')) await caches.delete(key);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method === 'GET' && new URL(request.url).origin === self.location.origin) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
  }
});
`;

export function stagingGate(config: Config) {
  const router = express.Router();
  if (!config.stagingPassword) return router;
  const expected = createHash('sha256').update(config.stagingPassword).digest();
  const signingKey = createHmac('sha256', config.stagingPassword).update('studio-staging-session-v1').digest();
  const sign = (value: string) => createHmac('sha256', signingKey).update(value).digest('hex');
  const page = (message: string) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private staging access</title><main><h1>Private staging access</h1><p>${message}</p><p>This staging session lasts up to eight hours. Do not enter a Claude or Sarvam API key here.</p><form method="post" action="/_staging/login" autocomplete="off"><label for="passphrase">Staging passphrase</label><input id="passphrase" name="passphrase" type="password" required maxlength="256" autocomplete="off" data-lpignore="true" data-1p-ignore="true"><button type="submit">Enter staging</button></form></main></html>`;
  router.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; base-uri 'none'",
      'Strict-Transport-Security': 'max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    next();
  });
  router.post('/_staging/login', rateLimit({
    windowMs: 60_000, limit: 10, keyGenerator: () => 'staging-login',
    validate: { xForwardedForHeader: false }, standardHeaders: 'draft-8', legacyHeaders: false,
    message: 'Too many staging sign-in attempts. Wait one minute and retry.',
  }), express.urlencoded({ extended: false, limit: '1kb', parameterLimit: 1 }), (req, res) => {
    if (!secureRequest(req, config) || req.get('origin') !== config.origin) {
      res.status(403).type('html').send(page('Sign-in requires this staging HTTPS origin.')); return;
    }
    const supplied: unknown = req.body?.passphrase;
    req.body = undefined;
    const digest = createHash('sha256').update(typeof supplied === 'string' ? supplied : '').digest();
    if (typeof supplied !== 'string' || !timingSafeEqual(expected, digest)) {
      res.status(401).type('html').send(page('Staging access was not accepted. Please retry.')); return;
    }
    const value = `${Math.floor(Date.now() / 1000) + sessionSeconds}.${randomBytes(24).toString('hex')}`;
    res.cookie(cookieName, `${value}.${sign(value)}`, {
      httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: sessionSeconds * 1000,
    }).redirect(303, '/');
  });
  router.use((req, res, next) => {
    const matches = (req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
    const token = matches.length === 1 ? matches[0].slice(cookieName.length + 1) : '';
    const match = /^(\d{10})\.([a-f0-9]{48})\.([a-f0-9]{64})$/.exec(token);
    const now = Math.floor(Date.now() / 1000);
    if (secureRequest(req, config) && match && Number(match[1]) > now && Number(match[1]) <= now + sessionSeconds &&
        timingSafeEqual(Buffer.from(match[3], 'hex'), Buffer.from(sign(`${match[1]}.${match[2]}`), 'hex'))) {
      next(); return;
    }
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      res.status(401).json({ code: 'staging_auth_required', error: 'Staging sign-in is required. Open this Studio in a new tab to sign in, then retry; keep this tab open to preserve your text.' });
    } else res.status(401).type('html').send(page('Sign in to access the application, assets and API.'));
  });
  router.post('/_staging/logout', (req, res) => {
    if (req.get('origin') !== config.origin) { res.sendStatus(403); return; }
    res.clearCookie(cookieName, { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
    res.redirect(303, '/');
  });
  // A protected shell must not become accessible from an offline static cache
  // after its staging session expires. Normal self-hosted PWA caching is unchanged.
  router.get('/sw.js', (_req, res) => res.type('application/javascript').send(stagingWorker));
  return router;
}
