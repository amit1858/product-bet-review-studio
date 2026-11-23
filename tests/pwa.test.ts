import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

type FetchEvent = {
  request: { url: string; method: string; mode: string };
  respondWith: (response: Promise<Response>) => void;
};

function worker(fetcher: () => Promise<Response>) {
  const handlers = new Map<string, (event: FetchEvent) => void>();
  const cacheLookups: string[] = [];
  runInNewContext(readFileSync(new URL('../pwa/sw.js', import.meta.url), 'utf8')
    .replace('__BUILD_ID__', 'test-current').replace('__PRECACHE__', JSON.stringify(['/', '/index.html', '/assets/shell.js'])), {
    self: {
      location: { origin: 'https://studio.example' },
      addEventListener: (type: string, handler: (event: FetchEvent) => void) => handlers.set(type, handler),
    },
    caches: {
      open: async (name: string) => {
        cacheLookups.push(name);
        return { match: async () => new Response('current public shell') };
      },
    },
    fetch: fetcher, URL, Response, Set,
  });
  return {
    cacheLookups,
    fetch(path: string, method = 'GET', mode = 'navigate') {
      let response: Promise<Response> | undefined;
      handlers.get('fetch')!({
        request: { url: new URL(path, 'https://studio.example').href, method, mode },
        respondWith: value => { response = value; },
      });
      return response;
    },
  };
}

test('offline shell fallback uses only the current cache, never replaces authentication errors', async () => {
  for (const status of [401, 403, 500]) {
    const sw = worker(async () => new Response('Access denied or unavailable', { status }));
    assert.equal((await sw.fetch('/'))?.status, status);
    assert.deepEqual(sw.cacheLookups, []);
  }
  const offline = worker(async () => { throw new TypeError('Network unavailable'); });
  assert.equal(await (await offline.fetch('/'))?.text(), 'current public shell');
  assert.deepEqual(offline.cacheLookups, ['product-bet-studio-test-current']);
});

test('API, POST, cross-origin and unlisted media are never intercepted or cached', () => {
  const sw = worker(async () => { throw new Error('Must not fetch'); });
  for (const path of ['/api', '/api/status', '/api/speech/speak', 'https://elsewhere.example/', '/audio.wav']) {
    assert.equal(sw.fetch(path, 'GET', path === '/audio.wav' ? 'cors' : 'navigate'), undefined);
  }
  assert.equal(sw.fetch('/', 'POST'), undefined);
  assert.deepEqual(sw.cacheLookups, []);
});
