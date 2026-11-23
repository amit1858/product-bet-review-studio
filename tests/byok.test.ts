import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { createClaude } from '../server/claude';
import { createSarvam } from '../server/speech';
import { readConfig, type Config } from '../server/config';
import { credentialHeaders } from '../shared/credentials';
import { input, wav } from './fixtures';
import { sampleClarification, sampleReview } from '../src/sample';

const origin = 'https://studio.example.test';
const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' };
const claudeKey = 'test-only-claude-key';
const sarvamKey = 'test-only-sarvam-key';
const speechInput = { text: 'Synthetic speech', language: 'en-IN', voice: 'shubh_enhi_companion', pace: 1 };
type Call = { provider: 'claude' | 'sarvam'; key: string; path: string };

async function serve(overrides: Partial<Config>, run: (url: string, calls: Call[], config: Config) => Promise<void>, fail: boolean | 'reflect' = false) {
  const config: Config = { ...readConfig({ APP_ORIGIN: origin, TRUSTED_PROXY_CIDRS: '127.0.0.1/32' }), ...overrides };
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const address = new URL(String(url));
    const outgoing = new Headers(init?.headers);
    assert.equal(init?.redirect, 'error');
    assert.ok(!outgoing.has(credentialHeaders.claude));
    assert.ok(!outgoing.has(credentialHeaders.sarvam));
    if (address.origin === 'https://api.anthropic.com') {
      const key = outgoing.get('authorization')?.replace(/^Bearer /, '') || outgoing.get('x-api-key') || '';
      assert.ok(!outgoing.has('api-subscription-key'));
      calls.push({ provider: 'claude', key, path: address.pathname });
      if (fail === true) return Response.json({ error: { type: 'authentication_error', message: `Raw secret diagnostic: ${key}` } }, { status: 401 });
      const body = JSON.parse(String(init?.body));
      assert.ok(!JSON.stringify(body).includes(key));
      return Response.json({
        id: 'msg_byok_mock', type: 'message', role: 'assistant', model: body.model,
        content: [{ type: 'text', text: JSON.stringify(fail === 'reflect' ? { ...sampleClarification, bet: key } : body.max_tokens === 2000 ? sampleClarification : sampleReview) }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
      });
    }
    assert.equal(address.origin, 'https://api.sarvam.ai');
    assert.ok(!outgoing.has('authorization')); assert.ok(!outgoing.has('x-api-key'));
    const key = outgoing.get('api-subscription-key') || '';
    calls.push({ provider: 'sarvam', key, path: address.pathname });
    if (fail === true) return new Response(`Raw secret diagnostic: ${key}`, { status: 403 });
    if (address.pathname === '/speech-to-text') return Response.json({ transcript: fail === 'reflect' ? key : 'Synthetic transcript', language_code: 'en-IN' });
    if (address.pathname === '/translate') return Response.json({ translated_text: 'हिंदी परीक्षण' });
    return Response.json({ audios: [wav().toString('base64')] });
  };
  const factories = {
    claude: (selected: Config) => { assert.equal(selected.sarvamKey, ''); return createClaude(selected, fetcher); },
    speech: (selected: Config) => { assert.equal(selected.anthropicKey, ''); return createSarvam(selected, fetcher); },
  };
  const app = createApp(config, { claude: createClaude(config, fetcher), speech: createSarvam(config, fetcher) }, true, factories);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls, config); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('BYOK overrides only its provider, remains request-scoped and never changes host/demo configuration', async () => {
  await serve({ anthropicKey: 'test-host-claude', sarvamKey: 'test-host-sarvam' }, async (url, calls, config) => {
    for (const path of ['/api/clarify', '/api/review']) {
      const response = await fetch(url + path, { method: 'POST', headers: { ...headers, [credentialHeaders.claude]: claudeKey }, body: JSON.stringify(input) });
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok(!(await response.text()).includes(claudeKey));
    }
    for (const [path, body] of [['/api/speech/speak', speechInput], ['/api/speech/translate', { text: 'Synthetic translation' }]] as const) {
      assert.equal((await fetch(url + path, { method: 'POST', headers: { ...headers, [credentialHeaders.sarvam]: sarvamKey }, body: JSON.stringify(body) })).status, 200);
    }
    const audio = new FormData(); audio.append('audio', new Blob([new Uint8Array(wav())], { type: 'audio/wav' }), 'synthetic.wav'); audio.append('mode', 'codemix');
    assert.equal((await fetch(`${url}/api/speech/transcribe`, { method: 'POST', headers: { Origin: origin, 'X-Forwarded-Proto': 'https', [credentialHeaders.sarvam]: sarvamKey }, body: audio })).status, 200);
    assert.equal((await fetch(`${url}/api/clarify`, { method: 'POST', headers, body: JSON.stringify(input) })).status, 200);
    assert.equal((await fetch(`${url}/api/speech/speak`, { method: 'POST', headers, body: JSON.stringify(speechInput) })).status, 200);
    assert.deepEqual(calls.map(call => [call.provider, call.key]), [
      ['claude', claudeKey], ['claude', claudeKey], ['sarvam', sarvamKey], ['sarvam', sarvamKey], ['sarvam', sarvamKey],
      ['claude', 'test-host-claude'], ['sarvam', 'test-host-sarvam'],
    ]);
    assert.equal(config.anthropicKey, 'test-host-claude'); assert.equal(config.sarvamKey, 'test-host-sarvam');
    const status = await (await fetch(`${url}/api/status`)).text();
    assert.ok(!status.includes(claudeKey) && !status.includes(sarvamKey) && !status.includes('test-host'));
  });
});

test('concurrent attendee keys stay isolated; absent keys do not inherit a preceding request', async () => {
  await serve({}, async (url, calls) => {
    const replies = await Promise.all([claudeKey, 'test-only-second-claude-key'].map(key => fetch(`${url}/api/clarify`, {
      method: 'POST', headers: { ...headers, [credentialHeaders.claude]: key }, body: JSON.stringify(input),
    })));
    assert.deepEqual(replies.map(response => response.status), [200, 200]);
    assert.equal((await fetch(`${url}/api/clarify`, { method: 'POST', headers, body: JSON.stringify(input) })).status, 503);
    assert.equal((await fetch(`${url}/api/speech/speak`, { method: 'POST', headers, body: JSON.stringify(speechInput) })).status, 503);
    assert.deepEqual(calls.map(call => call.key).sort(), [claudeKey, 'test-only-second-claude-key'].sort());
  });
});

test('BYOK rejects HTTP, untrusted forwarded TLS, wrong-provider, duplicate and overlong credentials', async () => {
  await serve({ trustedProxies: [] }, async (url, calls) => {
    assert.equal((await fetch(`${url}/api/clarify`, { method: 'POST', headers: { ...headers, [credentialHeaders.claude]: claudeKey }, body: JSON.stringify(input) })).status, 403);
    assert.deepEqual(calls, []);
  });
  await serve({}, async (url, calls) => {
    for (const credentials of [
      { [credentialHeaders.sarvam]: sarvamKey },
      { [credentialHeaders.claude]: claudeKey, [credentialHeaders.sarvam]: sarvamKey },
      { [credentialHeaders.claude]: 'x'.repeat(513) },
    ]) {
      assert.equal((await fetch(`${url}/api/clarify`, { method: 'POST', headers: { ...headers, ...credentials }, body: JSON.stringify(input) })).status, 400);
    }
    const duplicate = new Headers(headers); duplicate.append(credentialHeaders.claude, claudeKey); duplicate.append(credentialHeaders.claude, claudeKey);
    // Fetch combines duplicate header values; commas are not valid API-key characters.
    assert.equal((await fetch(`${url}/api/clarify`, { method: 'POST', headers: duplicate, body: JSON.stringify(input) })).status, 400);
    assert.equal((await fetch(`${url}/api/clarify`, { method: 'POST', headers: { ...headers, 'X-Forwarded-Proto': 'http', [credentialHeaders.claude]: claudeKey }, body: JSON.stringify(input) })).status, 403);
    assert.deepEqual(calls, []);
  });
  for (const trust of ['true', '*', '0.0.0.0/0', '::/0']) assert.throws(() => readConfig({ TRUSTED_PROXY_CIDRS: trust }), /trustedProxies/);
});

test('BYOK provider errors and logs never include supplied credentials; request caps still apply', async () => {
  const logs: string[] = [];
  const original = console.warn;
  console.warn = (...values: unknown[]) => { logs.push(values.map(String).join(' ')); };
  try {
    await serve({ ipLimit: 2 }, async (url, calls) => {
      for (const [path, key, body] of [
        ['/api/clarify', claudeKey, input], ['/api/speech/speak', sarvamKey, speechInput],
      ] as const) {
        const credential = path === '/api/clarify' ? credentialHeaders.claude : credentialHeaders.sarvam;
        const response = await fetch(url + path, { method: 'POST', headers: { ...headers, [credential]: key }, body: JSON.stringify(body) });
        assert.equal(response.status, 503);
        const text = await response.text();
        assert.match(text, /authentication failed/); assert.ok(!text.includes(key) && !text.includes('Raw secret'));
      }
      assert.equal((await fetch(`${url}/api/clarify`, { method: 'POST', headers: { ...headers, [credentialHeaders.claude]: claudeKey }, body: JSON.stringify(input) })).status, 429);
      assert.equal(calls.length, 2);
    }, true);
    assert.ok(logs.length > 0);
    assert.ok(!logs.join('\n').includes(claudeKey) && !logs.join('\n').includes(sarvamKey));
  } finally { console.warn = original; }
});

test('BYOK rejects otherwise valid provider content that reflects a credential instead of echoing it', async () => {
  await serve({}, async (url, calls) => {
    const response = await fetch(`${url}/api/clarify`, { method: 'POST', headers: { ...headers, [credentialHeaders.claude]: claudeKey }, body: JSON.stringify(input) });
    assert.equal(response.status, 502); assert.ok(!(await response.text()).includes(claudeKey));
    const audio = new FormData(); audio.append('audio', new Blob([new Uint8Array(wav())], { type: 'audio/wav' }), 'synthetic.wav'); audio.append('mode', 'codemix');
    const transcript = await fetch(`${url}/api/speech/transcribe`, { method: 'POST', headers: { Origin: origin, 'X-Forwarded-Proto': 'https', [credentialHeaders.sarvam]: sarvamKey }, body: audio });
    assert.equal(transcript.status, 502); assert.ok(!(await transcript.text()).includes(sarvamKey));
    assert.equal(calls.length, 2);
  }, 'reflect');
});
