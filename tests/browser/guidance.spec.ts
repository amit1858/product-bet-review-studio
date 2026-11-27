import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildPackMarkdown, buildSections } from '../../src/buildPack';
import { sampleClarification } from '../../src/sample';

const status = { ai: true, speech: true, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion' };
async function capture(page: Page, info: TestInfo, theme: string, screen: string) {
  const folder = process.env.STUDIO_GUIDANCE_ARTIFACTS;
  if (!folder || !['desktop', 'phone'].includes(info.project.name)) return;
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, `guidance-${theme}-${info.project.name}-${screen}.png`) });
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function downloadText(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download build pack' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('product-building-pack.md');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

for (const theme of ['paper', 'midnight', 'field-notes']) {
  test(`${theme}: optional keyboard tour, preserved drafts, static builder pack and responsive screens`, async ({ page }, info) => {
    let calls = 0;
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname === '/api/status') return route.fulfill({ json: status });
      calls++; return route.abort('blockedbyclient');
    });
    await page.goto('/');
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await expect(page.getByRole('region', { name: 'Material', exact: true })).toHaveCount(0);
    const start = page.getByRole('button', { name: 'Take a guided tour' });
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
    await expect(page.locator('.walkthrough')).toContainText('Step 1 of 4');
    await fits(page);
    await capture(page, info, theme, 'landing-tour');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
    for (let index = 0; index < 3; index++) {
      await page.keyboard.press('Enter');
      await expect(page.locator('.tour-controls .primary')).toBeInViewport({ ratio: 1 });
    }
    await expect(page.getByRole('button', { name: 'Finish' })).toBeFocused();
    await expect(page.locator('.walkthrough')).toContainText('Step 4 of 4');
    await page.keyboard.press('Enter');
    await expect(start).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.walkthrough')).toContainText('Step 1 of 4');
    await start.click();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Skip tour' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(start).toBeFocused();
    await page.getByRole('button', { name: 'Paste my idea' }).click();
    const idea = 'A fictional workshop tool to examine an uncertain grocery reorder idea.';
    const notes = 'Synthetic notes only. No customers or validated outcomes.';
    await page.locator('#idea').fill(idea);
    await page.locator('#context').fill(notes);
    await start.click();
    await expect(page.locator('#idea')).toHaveAttribute('data-tour-highlight', 'true');
    await page.getByRole('button', { name: 'Show highlighted area' }).click();
    await expect(page.locator('#idea')).toBeFocused();
    await expect(page.locator('#idea')).toBeInViewport({ ratio: 1 });
    await capture(page, info, theme, 'spotlight');
    await page.keyboard.press('Escape');
    await expect(page.locator('.walkthrough')).toHaveCount(0);
    await expect(start).toBeFocused();
    await start.click();
    await page.getByRole('button', { name: 'Show highlighted area' }).click();
    await page.getByRole('button', { name: 'Return to tour' }).click();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.journey li').nth(1)).toHaveAttribute('data-tour-highlight', 'true');
    await expect(page.getByRole('button', { name: /The questions/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Show highlighted area' }).click();
    await expect(page.locator('.journey li').nth(1)).toBeFocused();
    await expect(page.getByRole('button', { name: /The questions/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Return to tour' }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
    await expect(page.locator('#idea')).toHaveAttribute('data-tour-highlight', 'true');
    await capture(page, info, theme, 'material-tour');
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await expect(start).toBeFocused();
    await expect(page.locator('#idea')).toHaveValue(idea);
    await expect(page.locator('#context')).toHaveValue(notes);
    await page.getByRole('link', { name: 'Build an app like this', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Build an app like this', exact: true })).toBeFocused();
    await expect(page.locator('.builder-workspace')).not.toContainText(idea);
    await expect(page.locator('.builder-workspace')).not.toContainText(notes);
    await fits(page);
    await capture(page, info, theme, 'builder');
    expect(await downloadText(page)).toBe(buildPackMarkdown);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Synthetic clipboard denial'); } } });
    });
    await page.getByRole('button', { name: 'Copy build pack', exact: true }).click();
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
    await capture(page, info, theme, 'builder-error');
    await page.locator('#builder-prompt summary').click();
    await expect(page.locator('#builder-prompt pre')).toHaveText(buildSections.find(section => section.id === 'prompt')!.text);
    await page.locator('#builder-prompt').scrollIntoViewIfNeeded();
    await fits(page);
    await capture(page, info, theme, 'prompt');
    await page.getByRole('link', { name: 'Return to your Studio', exact: true }).click();
    await expect(page.locator('#idea')).toHaveValue(idea);
    await expect(page.locator('#context')).toHaveValue(notes);
    await page.goBack();
    await expect(page.locator('.builder-workspace')).toBeVisible();
    await page.goForward();
    await expect(page.locator('#idea')).toHaveValue(idea);
    expect(calls).toBe(0);
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([['product-bet-studio:theme:v1', theme]]);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });
}

test('builder copy and manual fallback contain only static educational content', async ({ page }) => {
  await page.goto('/#builder');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { document.documentElement.dataset.copiedPack = text; },
    } });
  });

  await page.getByRole('button', { name: 'Copy build pack', exact: true }).click();
  expect(await page.locator('html').getAttribute('data-copied-pack')).toBe(buildPackMarkdown);
  await page.getByRole('button', { name: 'Copy build prompt', exact: true }).click();
  expect(await page.locator('html').getAttribute('data-copied-pack')).toBe(buildSections.find(section => section.id === 'prompt')!.text);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('Synthetic clipboard denial'); } });
  });
  await page.getByRole('button', { name: 'Copy build pack', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Open the relevant text below');
  await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('alert')).toBeFocused();
  await page.locator('#builder-prd summary').click();
  await expect(page.locator('#builder-prd pre')).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('link', { name: 'Build your own Product Bet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build your own Product Bet', exact: true })).toBeFocused();
});

test('tour preserves a human choice and does not advance the review', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).pathname === '/api/status') return route.fulfill({ json: { ...status, ai: false, speech: false } });
    calls++; return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the illustrative review' }).click();
  await page.getByRole('button', { name: /The questions/ }).click();
  const understanding = await page.locator('#understanding').inputValue();
  await page.getByRole('button', { name: 'Take a guided tour' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Show highlighted area' }).click();
  await expect(page.locator('#understanding')).toBeFocused();
  await expect(page.locator('#understanding')).toHaveValue(understanding);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /The review/ }).click();
  await page.locator('input[value=stop]').check();
  await page.locator('#rationale').fill('Fictional rationale: preserve the team capacity.');
  await page.getByRole('button', { name: 'Take a guided tour' }).click();
  for (let index = 0; index < 2; index++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Show highlighted area' }).click();
  await expect(page.getByRole('link', { name: 'Signals & gaps', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Return to tour' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('input[value=stop]')).toBeChecked();
  await expect(page.locator('#rationale')).toHaveValue('Fictional rationale: preserve the team capacity.');
  await expect(page.locator('.journey [aria-current]')).toContainText('The review');
  await page.getByRole('button', { name: 'Create my decision pack' }).click();
  await page.getByRole('button', { name: 'Take a guided tour' }).click();
  for (let index = 0; index < 3; index++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Show highlighted area' }).click();
  await expect(page.getByRole('button', { name: 'Copy pack', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.human-decision')).toContainText('Fictional rationale: preserve the team capacity.');
  await expect(page.locator('.journey [aria-current]')).toContainText('Your decision');
  expect(calls).toBe(0);
});

test('builder route and tour respect pending and transcript locks', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: status }));
  await page.route('**/api/speech/transcribe', route => route.fulfill({ json: { transcript: 'A fictional workshop idea to test.', language: 'en-IN' } }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/clarify', async route => { await pending; await route.fulfill({ json: sampleClarification }); });
  await page.goto('/#builder');
  await page.getByRole('link', { name: 'Return to the Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.getByRole('button', { name: 'Speak: idea', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Stop & transcribe/ }).click();
  await expect(page.locator('.transcript-review textarea')).toHaveValue('A fictional workshop idea to test.');
  await expect(page.getByRole('button', { name: 'Take a guided tour' })).toBeDisabled();
  await page.goBack();
  await expect(page.locator('.builder-workspace')).toHaveCount(0);
  await expect(page.locator('.transcript-review textarea')).toHaveValue('A fictional workshop idea to test.');
  await page.getByRole('button', { name: 'Add transcript to idea' }).click();
  await page.getByRole('button', { name: 'Find the useful questions' }).click();
  await expect(page.locator('.notice.loading')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take a guided tour' })).toBeDisabled();
  const builderLink = page.getByRole('link', { name: 'Build an app like this', exact: true });
  await expect(builderLink).toHaveAttribute('aria-disabled', 'true');
  await builderLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.builder-workspace')).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = 'builder-prompt'; });
  await expect(page.locator('.builder-workspace')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Wait for the current request' })).toBeVisible();
  release();
  await expect(page.locator('#understanding')).toBeVisible();
});

test('reduced motion disables decorative transitions without hiding content or moving fields', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  const field = await page.locator('#idea').evaluate(element => getComputedStyle(element).transform);
  expect(field).toBe('none');
  const motion = await page.locator('.page-heading .eyebrow').evaluate(element => ({
    rule: getComputedStyle(element, '::after').animationName,
    marker: getComputedStyle(document.querySelector('.journey [aria-current] .step-marker')!).animationName,
  }));
  expect(motion).toEqual({ rule: 'none', marker: 'none' });
  await page.getByRole('button', { name: 'Take a guided tour' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.walkthrough')).toContainText('Questions');
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await page.getByRole('button', { name: 'Continue with the example' }).click();
  await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
  await expect(page.getByRole('region', { name: 'Follow the reasoning' })).toBeVisible();
  await fits(page);
});
