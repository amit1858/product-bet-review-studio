import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { input } from './fixtures';
import { sampleClarification, sampleReview } from '../src/sample';

const origin = 'https://studio.example.test';
const passphrase = 'test-only-staging-passphrase-not-a-secret';
const headers = { Host: 'studio.example.test', 'X-Forwarded-Proto': 'https', Origin: origin };
const env = { APP_ORIGIN: origin, STAGING_PASSWORD: passphrase, RAILWAY_PROJECT_ID: 'test-project' };

// Node fetch replaces Host; use a real HTTP client to model the edge's Host header.
function fetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string | URLSearchParams; redirect?: 'manual' } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const body = options.body?.toString();
    const req = httpRequest(url, {
      method: options.method, headers: {
        ...(options.body instanceof URLSearchParams ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...options.headers,
      },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('error', reject);
      res.on('end', () => {
        const headers = new Headers();
        for (let index = 0; index < res.rawHeaders.length; index += 2) headers.append(res.rawHeaders[index], res.rawHeaders[index + 1]);
        resolve(new Response(new Uint8Array(Buffer.concat(chunks)), { status: res.statusCode!, headers }));
      });
    });
    req.on('error', reject); req.end(body);
  });
}

async function serve(run: (url: string) => Promise<void>, ipLimit = 60, factories?: Parameters<typeof createApp>[3]) {
  const app = createApp(readConfig({ ...env, MAX_REQUESTS_PER_IP_10_MIN: String(ipLimit) }), undefined, true, factories);
  app.get('/{*path}', (_req, res) => res.send('protected-app-marker'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

async function login(url: string) {
  const response = await fetch(`${url}/_staging/login`, {
    method: 'POST', headers, redirect: 'manual', body: new URLSearchParams({ passphrase }),
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /__Host-studio-staging=/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes(passphrase));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return cookie.split(';')[0];
}

test('Railway staging configuration fails closed without strong authentication and HTTPS', () => {
  for (const overrides of [
    { STAGING_PASSWORD: '' }, { STAGING_PASSWORD: 'short' }, { APP_ORIGIN: 'http://studio.example.test' },
    { ANTHROPIC_API_KEY: 'test-only-provider' }, { SARVAM_API_KEY: 'test-only-provider' },
    { TRUSTED_PROXY_CIDRS: '127.0.0.1/32' },
  ]) {
    assert.throws(() => readConfig({ ...env, ...overrides }), error =>
      error instanceof Error && !error.message.includes(passphrase));
  }
  assert.throws(() => readConfig({ STAGING_AUTH_REQUIRED: 'true', APP_ORIGIN: origin }));
});

test('staging gate protects application, deep links, assets, PWA and every API before handlers', async () => {
  await serve(async url => {
    for (const path of ['/', '/review', '/assets/app.js', '/manifest.webmanifest', '/icons/icon-192.png', '/sw.js', '/api/status', '/api/unknown']) {
      const response = await fetch(url + path, { headers });
      assert.equal(response.status, 401, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.text();
      assert.ok(!body.includes('protected-app-marker') && !body.includes(passphrase));
      if (path.startsWith('/api/')) assert.equal(JSON.parse(body).code, 'staging_auth_required');
    }
    assert.equal((await fetch(`${url}/api/review`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-Studio-Claude-Key': 'test-only-fake-key' },
      body: JSON.stringify(input),
    })).status, 401);
  });
});

test('staging login rejects wrong origins, HTTP and invalid passphrases without reflection; attempts are bounded', async () => {
  await serve(async url => {
    for (const altered of [{ Origin: 'https://elsewhere.example.test' }, { 'X-Forwarded-Proto': 'http' }, { Host: 'elsewhere.example.test' }]) {
      assert.equal((await fetch(`${url}/_staging/login`, {
        method: 'POST', headers: { ...headers, ...altered }, body: new URLSearchParams({ passphrase }),
      })).status, 403);
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await fetch(`${url}/_staging/login`, {
        method: 'POST', headers, body: new URLSearchParams({ passphrase: 'test-only-wrong-passphrase' }),
      });
      assert.equal(response.status, attempt === 7 ? 429 : 401);
      assert.ok(!(await response.text()).includes('test-only-wrong-passphrase'));
      assert.equal(response.headers.get('set-cookie'), null);
    }
  });
});

test('staging signed sessions authorize same-origin APIs, reject tampering and logout revokes browser access', async () => {
  await serve(async url => {
    const cookie = await login(url);
    const auth = { ...headers, Cookie: cookie };
    const status = await fetch(`${url}/api/status`, { headers: auth });
    assert.equal(status.status, 200);
    assert.deepEqual([...(Object.values(await status.json())).slice(0, 2)], [false, false]);
    assert.equal(status.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(url, { headers: auth })).status, 200);
    for (const invalid of [cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0'), `${cookie}; ${cookie}`, cookie.replace(/=\d+/, '=1000000000')]) {
      assert.equal((await fetch(`${url}/api/status`, { headers: { ...headers, Cookie: invalid } })).status, 401);
    }
    const failure = await fetch(`${url}/api/review`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    assert.equal(failure.status, 503);
    assert.ok(!(await failure.text()).includes(passphrase));
    const logout = await fetch(`${url}/_staging/logout`, { method: 'POST', headers: auth, redirect: 'manual' });
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/);
    assert.equal((await fetch(`${url}/api/status`, { headers })).status, 401);
  });
});

test('protected worker never caches the shell; Railway client budgets ignore spoofed forwarded-for values', async () => {
  await serve(async url => {
    const cookie = await login(url);
    const worker = await fetch(`${url}/sw.js`, { headers: { ...headers, Cookie: cookie } });
    assert.equal(worker.status, 200);
    assert.equal(worker.headers.get('cache-control'), 'no-store');
    const code = await worker.text();
    assert.match(code, /caches.delete/); assert.match(code, /cache: 'no-store'/);
    assert.doesNotMatch(code, /cache\.add|cache\.put|cache\.match|caches\.open/);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`${url}/api/review`, {
        method: 'POST', headers: {
          ...headers, Cookie: cookie, 'Content-Type': 'application/json',
          'X-Real-IP': '203.0.113.8', 'X-Forwarded-For': `198.51.100.${attempt + 1}`,
        }, body: JSON.stringify(input),
      });
      assert.equal(response.status, attempt === 0 ? 503 : 429);
    }
  }, 1);
});

test('authenticated Railway BYOK reaches only its request-specific provider and is not inherited', async () => {
  const calls: string[] = [];
  await serve(async url => {
    const cookie = await login(url);
    const auth = { ...headers, Cookie: cookie, 'Content-Type': 'application/json' };
    const response = await fetch(`${url}/api/clarify`, {
      method: 'POST', headers: { ...auth, 'X-Studio-Claude-Key': 'test-only-railway-claude' }, body: JSON.stringify(input),
    });
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes('test-only-railway-claude'));
    assert.equal((await fetch(`${url}/api/clarify`, { method: 'POST', headers: auth, body: JSON.stringify(input) })).status, 503);
    assert.equal((await fetch(`${url}/api/clarify`, {
      method: 'POST', headers: { ...auth, 'X-Studio-Sarvam-Key': 'test-only-railway-sarvam' }, body: JSON.stringify(input),
    })).status, 400);
    assert.deepEqual(calls, ['claude']);
  }, 60, {
    claude: selected => {
      assert.equal(selected.anthropicKey, 'test-only-railway-claude'); assert.equal(selected.sarvamKey, '');
      return { clarify: async () => { calls.push('claude'); return sampleClarification; }, review: async () => sampleReview };
    },
    speech: () => { throw new Error('Wrong provider factory must not run.'); },
  });
});
