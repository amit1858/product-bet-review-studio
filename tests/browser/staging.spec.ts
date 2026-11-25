import { test, expect } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../server/app';
import { readConfig } from '../../server/config';

test('staging login preserves the browser Origin and accepts the synthetic passphrase', async ({ page, context }) => {
  const origin = 'https://studio.example.test';
  const passphrase = 'test-only-staging-browser-passphrase';
  const server = createApp(readConfig({
    APP_ORIGIN: origin, STAGING_PASSWORD: passphrase, RAILWAY_PROJECT_ID: 'test-project',
  })).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const upstream = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let submitted = false;
  try {
    await context.route(`${origin}/**`, async route => {
      const request = route.request();
      const response = await context.request.fetch(upstream + new URL(request.url()).pathname, {
        method: request.method(),
        headers: { ...request.headers(), Host: 'studio.example.test', 'X-Forwarded-Proto': 'https' },
        data: request.postDataBuffer() || undefined, maxRedirects: 0,
      });
      if (request.method() === 'POST') {
        expect(request.headers().origin).toBe(origin);
        expect(response.status()).toBe(303);
        expect(response.headers()['set-cookie']).toContain('HttpOnly');
        submitted = true;
        await route.fulfill({ contentType: 'text/plain', body: 'Synthetic staging login accepted.' });
      } else {
        expect(response.status()).toBe(401);
        await route.fulfill({ response });
      }
    });
    await page.goto(origin);
    await page.getByLabel('Staging passphrase').fill(passphrase);
    await page.getByRole('button', { name: 'Enter staging' }).click();
    await expect(page.getByText('Synthetic staging login accepted.')).toBeVisible();
    expect(submitted).toBe(true);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
