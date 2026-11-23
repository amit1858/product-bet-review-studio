import { test, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { sampleClarification, sampleReview } from '../../src/sample';
import { credentialHeaders } from '../../shared/credentials';
import { wav } from '../fixtures';

test.use({ serviceWorkers: 'block' });
const origin = 'https://studio.example.test';
const claudeKey = 'test-only-browser-claude-key';
const sarvamKey = 'test-only-browser-sarvam-key';

async function secureStudio(context: BrowserContext, upstream: string, host = false) {
  // HTTPS is browser-mocked; only credential-free static GETs reach the loopback asset server.
  await context.route(`${origin}/**`, async route => {
    const request = route.request();
    expect(request.headers()[credentialHeaders.claude.toLowerCase()]).toBeUndefined();
    expect(request.headers()[credentialHeaders.sarvam.toLowerCase()]).toBeUndefined();
    const path = new URL(request.url()).pathname;
    if (path === '/api/status') {
      await route.fulfill({ json: { ai: host, speech: host, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion' } });
    } else if (path.startsWith('/api/')) {
      await route.fulfill({ status: 503, json: { error: 'Mock provider is not configured.' } });
    } else {
      expect(request.method()).toBe('GET');
      await route.fulfill({ response: await context.request.get(new URL(path, upstream).href) });
    }
  });
}
async function addKey(page: Page, provider: 'Claude' | 'Sarvam', key: string) {
  await page.getByLabel(`${provider} API key · optional`).fill(key);
  await page.getByRole('button', { name: `Use ${provider} key in this tab`, exact: true }).click();
  await expect(page.getByLabel(`${provider} API key · optional`)).toHaveCount(0);
}
function assertCredential(route: Route, provider: 'claude' | 'sarvam') {
  expect(new URL(route.request().url()).origin).toBe(origin);
  const headers = route.request().headers();
  expect(headers[credentialHeaders[provider].toLowerCase()]).toBe(provider === 'claude' ? claudeKey : sarvamKey);
  expect(headers[credentialHeaders[provider === 'claude' ? 'sarvam' : 'claude'].toLowerCase()]).toBeUndefined();
  expect(route.request().postData() || '').not.toContain(claudeKey);
  expect(route.request().postData() || '').not.toContain(sarvamKey);
}

test('BYOK isolates keys throughout speech consent, reasoning, Hindi playback and export; Clear keys removes both', async ({ page, context, baseURL }) => {
  await secureStudio(context, baseURL!);
  const called: string[] = [];
  await page.route('**/api/speech/transcribe', route => {
    assertCredential(route, 'sarvam'); called.push('transcribe');
    return route.fulfill({ json: { transcript: 'A synthetic grocery reorder pilot for lapsed shoppers.', language: 'en-IN' } });
  });
  for (const [path, response] of [['clarify', sampleClarification], ['review', sampleReview]] as const) {
    await page.route(`**/api/${path}`, route => { assertCredential(route, 'claude'); called.push(path); return route.fulfill({ json: response }); });
  }
  await page.route('**/api/speech/translate', route => {
    assertCredential(route, 'sarvam'); called.push('translate');
    return route.fulfill({ json: { text: 'हिंदी परीक्षण' } });
  });
  await page.route('**/api/speech/speak', route => {
    assertCredential(route, 'sarvam'); called.push('speak');
    return route.fulfill({ json: { audios: [wav(3).toString('base64')] } });
  });
  await page.goto(origin);
  await page.locator('.provider-access summary').click();
  await expect(page.getByRole('region', { name: 'Provider access' })).toContainText('same-origin backend over HTTPS');
  await addKey(page, 'Claude', claudeKey); await addKey(page, 'Sarvam', sarvamKey);
  await expect(page.locator('.provider-key-status')).toContainText('Claude: Your tab key configured · Sarvam: Your tab key configured');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.getByRole('button', { name: 'Speak: idea', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Stop & transcribe/ }).click();
  await expect(page.locator('.transcript-review')).toBeVisible();
  expect(called).toEqual(['transcribe']);
  await page.getByRole('button', { name: 'Add transcript to idea' }).click();
  await page.getByRole('button', { name: 'Find the useful questions' }).click();
  await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
  await page.getByRole('button', { name: 'Voice & playback settings' }).click();
  await page.getByLabel('Read-aloud language').selectOption('hi-IN');
  await page.getByRole('button', { name: 'Read aloud: the bet as understood' }).click();
  await expect(page.locator('.playback-bar')).toContainText('Reading aloud');
  await page.getByRole('button', { name: 'Stop playback' }).click();
  expect(called).toEqual(['transcribe', 'clarify', 'review', 'translate', 'speak']);
  await page.locator('input[value=test]').check(); await page.locator('#rationale').fill('Run this synthetic pilot before building.');
  await page.getByRole('button', { name: 'Create my decision pack' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const exported = readFileSync((await (await download).path())!, 'utf8');
  for (const key of [claudeKey, sarvamKey]) {
    expect(exported).not.toContain(key);
    expect(await page.locator('body').textContent()).not.toContain(key);
    expect(page.url()).not.toContain(key);
  }
  expect(await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length,
  }))).toEqual({ local: 0, session: 0, databases: 0 });
  expect(await context.cookies()).toEqual([]);
  await page.getByRole('button', { name: 'Clear keys', exact: true }).click();
  await expect(page.locator('.provider-key-status')).toContainText('Claude: Not configured · Sarvam: Not configured');
  await expect(page.getByLabel('Claude API key · optional')).toHaveValue('');
  await expect(page.getByLabel('Sarvam API key · optional')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Read aloud: the final decision pack' })).toBeDisabled();
  await expect(page.locator('.human-decision')).toContainText('Run this synthetic pilot before building.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('BYOK does not survive a new tab or full refresh, and absent Claude still permits typed/example use', async ({ page, context, baseURL }) => {
  await secureStudio(context, baseURL!);
  await page.goto(origin); await page.locator('.provider-access summary').click();
  await addKey(page, 'Sarvam', sarvamKey);
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('Typed material remains usable with only a speech key.');
  await expect(page.getByRole('button', { name: 'Find the useful questions' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Speak: idea', exact: true })).toBeEnabled();
  const tab = await context.newPage();
  await tab.goto(origin);
  await expect(tab.locator('.provider-key-status')).toContainText('Claude: Not configured · Sarvam: Not configured');
  await tab.close();
  await page.reload(); await page.locator('.provider-access summary').click();
  await expect(page.locator('.provider-key-status')).toContainText('Claude: Not configured · Sarvam: Not configured');
  await expect(page.getByLabel('Sarvam API key · optional')).toHaveValue('');
  await page.getByRole('button', { name: 'Explore the illustrative review' }).click();
  await expect(page.getByRole('heading', { name: sampleReview.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read aloud: the bet as understood' })).toBeDisabled();
});

test('BYOK errors redact reflected keys without retrying or falling back; clearing restores labeled host/demo use', async ({ page, context, baseURL }) => {
  await secureStudio(context, baseURL!, true);
  const consoleMessages: string[] = [];
  page.on('console', message => consoleMessages.push(message.text()));
  let attempts = 0;
  await page.route('**/api/clarify', route => {
    attempts++;
    if (attempts === 1) {
      assertCredential(route, 'claude');
      return route.fulfill({ status: 503, json: { code: 'provider_auth', error: `Raw reflected keys: ${claudeKey} ${sarvamKey}` } });
    }
    expect(route.request().headers()[credentialHeaders.claude.toLowerCase()]).toBeUndefined();
    return route.fulfill({ json: sampleClarification });
  });
  await page.goto(origin); await page.locator('.provider-access summary').click();
  await expect(page.locator('.provider-key-status')).toContainText('Host/demo key configured');
  await addKey(page, 'Claude', claudeKey); await addKey(page, 'Sarvam', sarvamKey);
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('Keep this synthetic product bet when a key fails.');
  await page.getByRole('button', { name: 'Find the useful questions' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'authentication failed' })).toBeVisible();
  expect(attempts).toBe(1);
  for (const key of [claudeKey, sarvamKey]) {
    expect(await page.locator('body').textContent()).not.toContain(key);
    expect(consoleMessages.join('\n')).not.toContain(key);
  }
  await page.getByRole('button', { name: 'Clear keys', exact: true }).click();
  await expect(page.locator('.provider-key-status')).toContainText('Claude: Host/demo key configured · Sarvam: Host/demo key configured');
  await page.getByRole('button', { name: 'Find the useful questions' }).click();
  await expect(page.locator('#understanding')).toHaveValue(sampleClarification.bet);
  expect(attempts).toBe(2);
});

test('BYOK clearing cancels in-flight analysis without losing typed material or accepting a late result', async ({ page, context, baseURL }) => {
  await secureStudio(context, baseURL!);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/clarify', async route => {
    assertCredential(route, 'claude');
    await waiting;
    await route.fulfill({ json: sampleClarification });
  });
  await page.goto(origin); await page.locator('.provider-access summary').click(); await addKey(page, 'Claude', claudeKey);
  await page.getByRole('button', { name: 'Paste my idea' }).click(); await page.locator('#idea').fill('Do not lose this synthetic bet when access is cleared.');
  const requested = page.waitForRequest('**/api/clarify');
  await page.getByRole('button', { name: 'Find the useful questions' }).click(); await requested;
  await page.getByRole('button', { name: 'Clear keys', exact: true }).click();
  release();
  await expect(page.locator('#idea')).toHaveValue('Do not lose this synthetic bet when access is cleared.');
  await expect(page.locator('.notice.loading')).toHaveCount(0);
  await expect(page.locator('#understanding')).toHaveCount(0);
  await expect(page.locator('.provider-key-status')).toContainText('Claude: Not configured');
});

test('BYOK never sends tab keys from HTTP; clearing removes unfinished key inputs too', async ({ page }) => {
  let sent = 0;
  page.on('request', request => {
    if (request.headers()[credentialHeaders.claude.toLowerCase()] || request.headers()[credentialHeaders.sarvam.toLowerCase()]) sent++;
  });
  await page.goto('/'); await page.locator('.provider-access summary').click();
  for (const provider of ['Claude', 'Sarvam'] as const) {
    const field = page.getByLabel(`${provider} API key · optional`);
    await expect(field).toBeDisabled();
    await expect(page.getByRole('button', { name: `Use ${provider} key in this tab`, exact: true })).toBeDisabled();
    await field.evaluate((element, value) => {
      if (!(element instanceof HTMLInputElement)) throw new Error('Key input is unavailable');
      element.value = value;
    }, provider === 'Claude' ? claudeKey : sarvamKey);
  }
  await expect(page.getByRole('region', { name: 'Provider access' })).toContainText('Key entry is disabled on this HTTP preview');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('Typed HTTP fallback is still available.');
  await expect(page.getByRole('button', { name: 'Find the useful questions' })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear keys', exact: true }).click();
  await expect(page.getByLabel('Claude API key · optional')).toHaveValue('');
  await expect(page.getByLabel('Sarvam API key · optional')).toHaveValue('');
  expect(sent).toBe(0);
});

test('BYOK rejects reflected credentials in successful translation content before disclosure or TTS', async ({ page, context, baseURL }) => {
  await secureStudio(context, baseURL!);
  await page.route('**/api/speech/translate', route => {
    assertCredential(route, 'sarvam');
    return route.fulfill({ json: { text: sarvamKey } });
  });
  let spoken = 0;
  await page.route('**/api/speech/speak', route => { spoken++; return route.fulfill({ json: { audios: [wav().toString('base64')] } }); });
  await page.goto(origin); await page.locator('.provider-access summary').click(); await addKey(page, 'Sarvam', sarvamKey);
  await page.getByRole('button', { name: 'Explore the illustrative review' }).click();
  await page.getByRole('button', { name: 'Voice & playback settings' }).click();
  await page.getByLabel('Read-aloud language').selectOption('hi-IN');
  await page.getByRole('button', { name: 'Read aloud: the bet as understood' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'unsafe content' })).toBeVisible();
  expect(spoken).toBe(0);
  expect(await page.locator('body').textContent()).not.toContain(sarvamKey);
  await expect(page.locator('.voice-translation')).toHaveCount(0);
});
