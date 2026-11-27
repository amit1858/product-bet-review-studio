import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

async function localRelease(upstream: string) {
  let version = 1;
  let failInstall = false;
  const source = readFileSync(path.resolve('dist/sw.js'), 'utf8');
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end('GET only'); return; }
    if (req.url === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
      res.end(source.replace(/product-bet-studio-[a-f0-9]{12}/, `product-bet-studio-test-release-${version}`) +
        (failInstall ? "\nself.addEventListener('install', event => event.waitUntil(Promise.reject(new Error('Synthetic install failure'))));" : ''));
      return;
    }
    try {
      const response = await fetch(new URL(req.url ?? '/', upstream));
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(502); res.end('Local test asset unavailable');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local test server address unavailable');
  return {
    url: `http://127.0.0.1:${address.port}`,
    update: () => { version++; },
    fail: () => { failInstall = true; },
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

test('production manifest paths and PNG dimensions are installable assets', async ({ page }) => {
  await page.goto('/');
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ start_url: '/', scope: '/', display: 'standalone' });
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.headers()['content-type']).toContain('image/png');
    const bytes = await image.body();
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
});

test('real waiting worker preserves active input, activates after tabs close and cleans old caches', async ({ page, context, baseURL }) => {
  const release = await localRelease(baseURL!);
  try {
    await page.goto(release.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    });
    await page.getByRole('button', { name: 'Paste my idea' }).click();
    await page.locator('#idea').fill('Keep this synthetic working text until I finish.');
    const nextWorker = context.waitForEvent('serviceworker');
    release.update();
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    const installed = await nextWorker;
    await expect(page.getByRole('status').filter({ hasText: 'close all Studio tabs' })).toBeVisible();
    await expect(page.locator('#idea')).toHaveValue('Keep this synthetic working text until I finish.');
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(['product-bet-studio-test-release-1', 'product-bet-studio-test-release-2']));
    await page.close();
    await expect.poll(() => installed.evaluate("self.registration.waiting === null && self.registration.active?.state === 'activated'")).toBe(true);
    const reopened = await context.newPage();
    await reopened.goto(release.url);
    expect(await reopened.evaluate(() => caches.keys())).toEqual(['product-bet-studio-test-release-2']);
    await reopened.close();
  } finally { await release.close(); }
});

test('failed worker installation warns that offline access is unavailable without losing text input', async ({ page, baseURL }) => {
  const release = await localRelease(baseURL!);
  release.fail();
  try {
    await page.goto(release.url);
    await expect(page.getByRole('alert')).toContainText('Offline installation could not be enabled');
    await page.getByRole('button', { name: 'Paste my idea' }).click();
    await page.locator('#idea').fill('Typing remains available after failed installation.');
    await expect(page.locator('#idea')).toHaveValue('Typing remains available after failed installation.');
  } finally { await release.close(); }
});

test('failed worker update preserves the installed version and active work', async ({ page, baseURL }) => {
  const release = await localRelease(baseURL!);
  try {
    await page.goto(release.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    });
    await page.getByRole('button', { name: 'Paste my idea' }).click();
    await page.locator('#idea').fill('Keep this synthetic text when an update fails.');
    release.update(); release.fail();
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.getByRole('alert')).toContainText('current version and work remain available');
    await expect(page.locator('#idea')).toHaveValue('Keep this synthetic text when an update fails.');
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated');
  } finally { await release.close(); }
});
