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
  await expect(page.getByRole('button', { name: /Your decision/ })).toBeDisabled();
  await page.locator('#rationale').fill('We cannot staff this pilot. Reconsider next quarter.');
  await page.getByRole('button', { name: 'Create my decision pack' }).click();
  await expect(page.locator('.human-decision')).toContainText('Stop');
  await expect(page.locator('.decision-document')).toContainText('Test first');
  await expect(page.getByRole('region', { name: 'Leadership story' })).toContainText(sampleReview.evidence[0].quote);
  await expect(page.getByRole('region', { name: 'Leadership story' })).toContainText(sampleReview.evidence[0].limitation);
  await expect(page.getByRole('region', { name: 'Leadership story' })).toContainText('not a result');
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

test('light styling ignores the OS and obsolete theme hints while retaining contrast', async ({ page }) => {
  await page.goto('/?clawpilotTheme=dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))).toBe(false);
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(252, 251, 248)');
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

test('exploring the example cannot overwrite an opted-in personal draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  const personal = 'A synthetic private draft that must not become the example.';
  await page.locator('#idea').fill(personal);
  await page.getByRole('checkbox', { name: 'Keep this unsent draft on this device' }).check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('product-bet-studio:opt-in-draft:v1')!).idea)).toBe(personal);
  await page.getByRole('button', { name: 'Product Bet Review Studio home' }).click();
  await page.getByRole('button', { name: 'Explore the illustrative review' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('product-bet-studio:opt-in-draft:v1')!).idea)).toBe(personal);
});

test('playback errors stay visible and Hindi controls describe translation without altering the review', async ({ page }) => {
  await providers(page);
  await page.route('**/api/speech/speak', route => route.fulfill({ json: { audios: [] } }));
  await exampleReview(page);
  await page.getByRole('button', { name: 'Read aloud: the bet as understood' }).click();
  await expect(page.getByRole('alert')).toContainText('speech response was invalid');
  await expect(page.getByRole('alert')).toBeInViewport();
  await page.getByRole('button', { name: 'Dismiss playback error' }).click();
  await page.getByRole('button', { name: 'Voice & playback settings' }).click();
  await page.getByLabel('Read-aloud language').selectOption('hi-IN');
  await expect(page.getByRole('region', { name: 'Voice settings' })).toContainText('translates selected text with Sarvam before speech');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Hindi read-aloud translates before TTS and replays prepared audio without more paid requests', async ({ page }) => {
  await providers(page);
  const translated = 'प्रमाण जुटाने के बाद ही उत्पाद बनाएँ।';
  const calls: string[] = [];
  await page.route('**/api/speech/translate', route => {
    calls.push('translate');
    expect(route.request().postDataJSON().text.length).toBeLessThanOrEqual(900);
    return route.fulfill({ json: { text: translated } });
  });
  await page.route('**/api/speech/speak', route => {
    calls.push('speak');
    expect(route.request().postDataJSON()).toMatchObject({ text: translated, language: 'hi-IN' });
    return route.fulfill({ json: { audios: [wav(3).toString('base64')] } });
  });
  await exampleReview(page);
  await page.getByRole('button', { name: 'Voice & playback settings' }).click();
  await page.getByLabel('Read-aloud language').selectOption('hi-IN');
  await page.getByRole('button', { name: 'Read aloud: the bet as understood' }).click();
  await expect(page.locator('.playback-bar')).toContainText('Reading aloud');
  await expect(page.locator('.bet-summary')).toContainText(sampleReview.bet);
  await page.getByRole('button', { name: 'Stop playback' }).click();
  await page.getByRole('button', { name: 'Replay last audio' }).click();
  await expect(page.locator('.playback-bar')).toContainText('Reading aloud');
  expect(calls).toEqual(['translate', 'speak']);
  await page.getByRole('button', { name: 'Stop playback' }).click();
  await page.locator('.voice-translation summary').click();
  await expect(page.locator('.voice-translation')).toContainText(translated);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('failed Hindi translation never synthesizes English as Hindi and retries only explicitly', async ({ page }) => {
  await providers(page);
  let translations = 0;
  await page.route('**/api/speech/translate', route => { translations++; return route.fulfill({ json: { text: '' } }); });
  let spoken = 0;
  await page.route('**/api/speech/speak', route => { spoken++; return route.fulfill({ json: { audios: [] } }); });
  await exampleReview(page);
  await page.getByRole('button', { name: 'Voice & playback settings' }).click();
  await page.getByLabel('Read-aloud language').selectOption('hi-IN');
  await page.getByRole('button', { name: 'Read aloud: the bet as understood' }).click();
  await expect(page.getByRole('alert')).toContainText('No usable Hindi translation');
  expect(translations).toBe(1);
  expect(spoken).toBe(0);
  await page.getByRole('button', { name: 'Retry read aloud' }).click();
  await expect.poll(() => translations).toBe(2);
  expect(spoken).toBe(0);
  await expect(page.locator('.bet-summary')).toContainText(sampleReview.bet);
});

test('important findings and pre-mortem have grounded read-aloud content', async ({ page }) => {
  await providers(page);
  const requested: string[] = [];
  await page.route('**/api/speech/speak', route => {
    requested.push(route.request().postDataJSON().text);
    return route.fulfill({ json: { audios: [wav(3).toString('base64')] } });
  });
  await exampleReview(page);
  await page.getByRole('button', { name: 'Read aloud: evidence 1 and its limitation' }).click();
  await expect(page.locator('.playback-bar')).toContainText('Reading aloud');
  await page.getByRole('button', { name: 'Stop playback' }).click();
  expect(requested[0]).toContain(sampleReview.evidence[0].limitation);
  await page.getByRole('button', { name: 'Read aloud: pre-mortem path 1' }).click();
  await expect(page.locator('.playback-bar')).toContainText('Reading aloud');
  expect(requested[1]).toContain('not a prediction');
  expect(requested[1]).toContain(sampleReview.premortem[0].signal);
  await page.getByRole('button', { name: 'Stop playback' }).click();
});

test('translation retries preserve the recording but require explicit transcript consent', async ({ page }) => {
  await providers(page);
  let attempts = 0;
  await page.route('**/api/speech/transcribe', route => {
    expect(route.request().postData()).toContain('translate');
    attempts++;
    return route.fulfill(attempts === 1
      ? { status: 504, json: { error: 'Sarvam took too long. Retry this recording.' } }
      : { json: { transcript: 'We want to run a small reorder test.', language: 'en-IN' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.getByRole('combobox', { name: 'Transcription mode for idea', exact: true }).selectOption('translate');
  await page.getByRole('button', { name: 'Speak: idea', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Stop & transcribe/ }).click();
  await expect(page.getByRole('alert')).toContainText('too long');
  await expect(page.locator('#idea')).toHaveValue('');
  await page.getByRole('button', { name: 'Retry this recording' }).click();
  await expect(page.locator('.transcript-review')).toContainText('Review your English translation');
  await expect(page.locator('#idea')).toHaveValue('');
  await page.getByRole('button', { name: 'Add transcript to idea' }).click();
  await expect(page.locator('#idea')).toHaveValue('We want to run a small reorder test.');
  expect(attempts).toBe(2);
});

test('recording automatically stops at the short-turn cap with an explicit notice', async ({ page }) => {
  await providers(page);
  await page.route('**/api/speech/transcribe', route => route.fulfill({ json: { transcript: 'A capped synthetic voice turn.', language: 'en-IN' } }));
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.getByRole('button', { name: 'Speak: idea', exact: true }).click();
  await expect(page.getByRole('button', { name: /Stop & transcribe/ })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.clock.fastForward(28_000);
  await expect(page.locator('.recording-limit')).toContainText('first 28 seconds');
  await expect(page.locator('.transcript-review textarea')).toHaveValue('A capped synthetic voice turn.');
  await expect(page.locator('#idea')).toHaveValue('');
});

test('waiting updates never reload or discard active text', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('Finish this synthetic review before updating.');
  await page.evaluate(() => window.dispatchEvent(new Event('studio-update-ready')));
  await expect(page.getByRole('status')).toContainText('close all Studio tabs');
  await expect(page.locator('#idea')).toHaveValue('Finish this synthetic review before updating.');
});

test('maximum-length Hindi material and unbroken review text fit narrow screens', async ({ page }) => {
  await providers(page);
  const review = {
    ...sampleReview, title: 'क'.repeat(120), bet: 'अ'.repeat(1200),
    evidence: [{ claim: 'इ'.repeat(500), sourceId: 'S2', quote: 'स'.repeat(500), limitation: 'ल'.repeat(500) }],
    recommendation: { ...sampleReview.recommendation, basis: 'ह'.repeat(1200) },
  };
  await page.route('**/api/clarify', route => route.fulfill({ json: sampleClarification }));
  await page.route('**/api/review', route => route.fulfill({ json: review }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('अ'.repeat(4000));
  await page.locator('#context').fill('स'.repeat(14000));
  await page.getByRole('button', { name: 'Find the useful questions' }).click();
  await page.locator('#Q1').fill('ज'.repeat(2000));
  await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
  await expect(page.getByRole('heading', { name: review.title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('input[value=stop]').check();
  await page.locator('#rationale').fill('PM '.repeat(1000));
  await page.getByRole('button', { name: 'Create my decision pack' }).click();
  await expect(page.locator('.human-decision')).toContainText('PM');
  await page.getByText('Full pack with evidence, assumptions, pre-mortem & source material', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
