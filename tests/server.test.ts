import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp, type Providers } from '../server/app';
import { readConfig } from '../server/config';
import { config, input, wav } from './fixtures';
import { sampleClarification, sampleReview } from '../src/sample';

async function serve(overrides: Partial<ReturnType<typeof config>>, run: (url: string, calls: string[]) => Promise<void>) {
  const calls: string[] = [];
  const providers: Providers = {
    claude: {
      clarify: async () => { calls.push('clarify'); return sampleClarification; },
      review: async () => { calls.push('review'); return sampleReview; },
    },
    speech: {
      transcribe: async () => { calls.push('transcribe'); return { transcript: 'Test transcript', language: 'en-IN' }; },
      speak: async () => { calls.push('speak'); return { audios: [wav().toString('base64')] }; },
      translate: async () => { calls.push('translate'); return { text: 'सिंथेटिक परीक्षण' }; },
    },
  };
  const server = createApp({ ...config(), ...overrides }, providers, true).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' };

test('API denies other origins and malformed/oversized input before provider calls', async () => {
  await serve({}, async (url, calls) => {
    assert.equal((await fetch(`${url}/api/review`, { method: 'POST', headers: { ...headers, Origin: 'https://elsewhere.example' }, body: JSON.stringify(input) })).status, 403);
    assert.equal((await fetch(`${url}/api/review`, { method: 'POST', headers, body: JSON.stringify({ ...input, idea: '' }) })).status, 400);
    assert.equal((await fetch(`${url}/api/review`, { method: 'POST', headers, body: '{bad' })).status, 400);
    assert.equal((await fetch(`${url}/api/review`, { method: 'POST', headers, body: JSON.stringify({ ...input, context: 'x'.repeat(200000) }) })).status, 413);
    assert.deepEqual(calls, []);
    const response = await fetch(`${url}/api/clarify`, { method: 'POST', headers, body: JSON.stringify(input) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(calls, ['clarify']);
  });
});

test('per-connection limits block further provider usage and status exposes no credentials', async () => {
  await serve({ ipLimit: 1 }, async (url, calls) => {
    const status = await fetch(`${url}/api/status`);
    const body = await status.text();
    assert.ok(!body.includes('test-placeholder')); assert.ok(!body.includes('anthropicKey'));
    assert.match(status.headers.get('content-security-policy')!, /script-src 'self'/);
    assert.equal((await fetch(`${url}/api/review`, { method: 'POST', headers, body: JSON.stringify(input) })).status, 200);
    assert.equal((await fetch(`${url}/api/review`, { method: 'POST', headers, body: JSON.stringify(input) })).status, 429);
    assert.deepEqual(calls, ['review']);
  });
});

test('the server rejects excessive speech text before invoking Sarvam', async () => {
  await serve({}, async (url, calls) => {
    const response = await fetch(`${url}/api/speech/speak`, { method: 'POST', headers, body: JSON.stringify({
      text: 'x'.repeat(2501), language: 'en-IN', voice: 'shubh_enhi_companion', pace: 1,
    }) });
    assert.equal(response.status, 400); assert.deepEqual(calls, []);
  });
});

test('full-length Hindi material is accepted within the UI character limits', async () => {
  await serve({}, async (url, calls) => {
    const response = await fetch(`${url}/api/clarify`, { method: 'POST', headers, body: JSON.stringify({
      ...input, context: 'अ'.repeat(14000),
    }) });
    assert.equal(response.status, 200); assert.deepEqual(calls, ['clarify']);
  });
});

test('the process-wide budget applies across provider endpoints', async () => {
  await serve({ hourlyLimit: 1 }, async (url, calls) => {
    assert.equal((await fetch(`${url}/api/clarify`, { method: 'POST', headers, body: JSON.stringify(input) })).status, 200);
    const response = await fetch(`${url}/api/speech/speak`, { method: 'POST', headers, body: JSON.stringify({
      text: 'A question', language: 'en-IN', voice: 'shubh_enhi_companion', pace: 1,
    }) });
    assert.equal(response.status, 429); assert.deepEqual(calls, ['clarify']);
  });

});

test('translation is bounded, uncached and limited separately from TTS despite spoofed proxy headers', async () => {
  await serve({ ipLimit: 2 }, async (url, calls) => {
    const excessive = await fetch(`${url}/api/speech/translate`, {
      method: 'POST', headers, body: JSON.stringify({ text: 'x'.repeat(1001) }),
    });
    assert.equal(excessive.status, 400);
    const translated = await fetch(`${url}/api/speech/translate`, {
      method: 'POST', headers: { ...headers, 'X-Forwarded-For': '203.0.113.1' }, body: JSON.stringify({ text: 'Synthetic test' }),
    });
    assert.equal(translated.status, 200);
    assert.equal(translated.headers.get('cache-control'), 'no-store');
    const speak = await fetch(`${url}/api/speech/speak`, {
      method: 'POST', headers: { ...headers, 'X-Forwarded-For': '203.0.113.2' },
      body: JSON.stringify({ text: 'Synthetic test', language: 'hi-IN', voice: 'shubh_enhi_companion', pace: 1 }),
    });
    assert.equal(speak.status, 429);
    assert.deepEqual(calls, ['translate']);
  });
});

test('a disconnected caller cannot free a slot while its provider operation is still pending', async () => {
  let finish!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const admitted = new Promise<void>(resolve => { started = resolve; });
  const providers: Providers = {
    claude: { clarify: async () => { started(); await pending; return sampleClarification; }, review: async () => sampleReview },
    speech: { transcribe: async () => ({ transcript: 'Test', language: 'en-IN' }), speak: async () => ({ audios: [] }), translate: async () => ({ text: 'सिंथेटिक परीक्षण' }) },
  };
  const server = createApp({ ...config(), concurrency: 1 }, providers).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const controller = new AbortController();
  try {
    const first = fetch(`${url}/api/clarify`, { method: 'POST', headers, body: JSON.stringify(input), signal: controller.signal }).catch(() => null);
    await admitted; controller.abort(); await first;
    const second = await fetch(`${url}/api/review`, { method: 'POST', headers, body: JSON.stringify(input) });
    assert.equal(second.status, 503);
    finish();
  } finally {
    finish();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('missing keys produce explicit unavailable responses without external calls', async () => {
  const server = createApp(readConfig({})).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/review`, { method: 'POST', headers, body: JSON.stringify(input) });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /not configured/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
