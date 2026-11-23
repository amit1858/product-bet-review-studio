import { test, expect, type Page } from '@playwright/test';
import { sampleClarification, sampleReview } from '../../src/sample';
import { wav } from '../fixtures';

async function providers(page: Page) {
  await page.route('**/api/status', route => route.fulfill({ json: {
    ai: true, speech: true, ttsModel: 'bulbul:v4-flash',
    voices: ['shubh_enhi_companion', 'simran_enhi_companion'], defaultVoice: 'shubh_enhi_companion',
  } }));
}
async function exampleReview(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the illustrative review' }).click();
  await expect(page.getByRole('heading', { name: sampleReview.title, exact: true })).toBeVisible();
}

test('illustrative review keeps the human decision separate and exports the full pack', async ({ page }) => {
  await exampleReview(page);
  await expect(page.locator('input[name=decision]:checked')).toHaveCount(0);
  await page.locator('input[value=stop]').check();
  await page.locator('#rationale').fill('We cannot staff this pilot. Reconsider next quarter.');
  await page.getByRole('button', { name: 'Create my decision pack' }).click();
  await expect(page.locator('.human-decision')).toContainText('Stop');
  await expect(page.locator('.decision-document')).toContainText('Test first');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  expect((await download).suggestedFilename()).toBe('product-bet-decision.md');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('live clarification/review retries without losing input and invalidates a stale decision', async ({ page }) => {
  await providers(page);
  await page.route('**/api/clarify', route => route.fulfill({ json: sampleClarification }));
  let reviews = 0;
  await page.route('**/api/review', route => {
    reviews++;
    return route.fulfill(reviews === 1
      ? { status: 504, json: { error: 'Claude took too long. Your input is unchanged.' } }
      : { json: sampleReview });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('A concierge grocery reorder pilot for lapsed shoppers.');
  await page.getByRole('button', { name: 'Find the useful questions' }).click();
  await page.locator('#Q1').fill('We do not yet know the reason for churn.');
  await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
  await expect(page.getByRole('alert')).toContainText('too long');
  await expect(page.locator('#Q1')).toHaveValue('We do not yet know the reason for churn.');
  await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
  await page.locator('input[value=test]').check();
  await page.locator('#rationale').fill('Buy evidence before we build.');
  await page.getByRole('button', { name: 'Create my decision pack' }).click();
  await page.getByRole('button', { name: /The questions/ }).click();
  await page.locator('#understanding').fill('A corrected bet focused on availability.');
  await expect(page.getByRole('button', { name: /The review/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Your decision/ })).toBeDisabled();
});

test('voice transcript must be edited and accepted before it enters the bet', async ({ page }) => {
  await providers(page);
  await page.route('**/api/speech/transcribe', route => route.fulfill({ json: { transcript: 'हम reorder test करना चाहते हैं', language: 'hi-IN' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.getByRole('button', { name: 'Speak: idea', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Stop & transcribe/ }).click();
  const transcript = page.locator('.transcript-review textarea');
  await expect(transcript).toHaveValue('हम reorder test करना चाहते हैं');
  await expect(page.locator('#idea')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Find the useful questions' })).toBeDisabled();
  await transcript.fill('हम एक छोटा reorder pilot करना चाहते हैं');
  await page.getByRole('button', { name: 'Add transcript to idea' }).click();
  await expect(page.locator('#idea')).toHaveValue('हम एक छोटा reorder pilot करना चाहते हैं');
  await expect(page.locator('.transcript-review')).toHaveCount(0);
});

test('denied microphone access leaves typing available', async ({ page }) => {
  await providers(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.getByRole('button', { name: 'Speak: idea', exact: true }).click();
  await expect(page.locator('.speak-control').first()).toContainText('permission was denied');
  await page.locator('#idea').fill('Typed fallback is still a valid product bet.');
  await expect(page.getByRole('button', { name: 'Find the useful questions' })).toBeEnabled();
});

test('read aloud can stop and replay prepared audio without another provider request', async ({ page }) => {
  await providers(page);
  let requests = 0;
  await page.route('**/api/speech/speak', route => {
    requests++;
    return route.fulfill({ json: { audios: [wav(3).toString('base64')] } });
  });
  await exampleReview(page);
  await page.getByRole('button', { name: 'Read aloud: the bet as understood' }).click();
  await expect(page.locator('.playback-bar')).toContainText('Reading aloud');
  await page.getByRole('button', { name: 'Stop playback' }).click();
  await expect(page.locator('.playback-bar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Read aloud: the bet as understood' }).click();
  await expect(page.locator('.playback-bar')).toContainText('Reading aloud');
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('opt-in draft survives offline reload; shell caching never stores API responses', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('A draft that is only retained after explicit consent.');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('checkbox', { name: 'Keep this unsent draft on this device' }).check();
  await expect.poll(() => page.evaluate(() => localStorage.length)).toBe(1);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.connectivity')).toContainText('AI and speech require internet');
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(page.locator('#idea')).toHaveValue('A draft that is only retained after explicit consent.');
  await page.getByRole('checkbox', { name: 'Keep this unsent draft on this device' }).uncheck();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  const cached = await page.evaluate(async () => {
    const all: string[] = [];
    for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) all.push(req.url);
    return all;
  });
  expect(cached.some(url => url.includes('/api/'))).toBe(false);
  expect(cached.some(url => /\/assets\/.*\.js$/.test(url))).toBe(true);
});

test('normal text and action labels meet 4.5:1 contrast in each theme', async ({ page }) => {
  await page.goto('/');
  const ratios = await page.evaluate(() => {
    function luminance(color: string) {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255)
        .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    }
    return ['.hero-description', '.hero-copy .eyebrow', '.hero-promise', '.hero-actions .primary'].map(selector => {
      const element = document.querySelector(selector)!;
      const color = getComputedStyle(element).color;
      let ancestor: Element | null = element;
      let background = '';
      while (ancestor) {
        background = getComputedStyle(ancestor).backgroundColor;
        if (!['rgba(0, 0, 0, 0)', 'transparent'].includes(background)) break;
        ancestor = ancestor.parentElement;
      }
      const [high, low] = [luminance(color), luminance(background)].sort((a, b) => b - a);
      return { selector, ratio: (high + 0.05) / (low + 0.05) };
    });
  });
  for (const result of ratios) expect(result.ratio, result.selector).toBeGreaterThanOrEqual(4.5);
});
