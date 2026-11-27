import { test, expect, type Page } from '@playwright/test';
import { sampleIdea, sampleContext } from '../../src/sample';

async function configured(page: Page) {
  await page.route('**/api/status', route => route.fulfill({ json: {
    ai: true, speech: true, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion',
  } }));
  await page.goto('/');
  await expect(page.locator('.provider-key-status').first()).toContainText('Host/demo key configured');
}

for (const theme of ['paper', 'midnight', 'field-notes']) {
  test(`${theme}: deterministic presenter, native keyboard, no requests or recording, responsive stops`, async ({ page }) => {
    await configured(page);
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    const calls: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api')) calls.push(request.url()); });
    await page.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => { throw new Error('Presenter must not request the microphone'); } });
    });
    const start = page.getByRole('button', { name: 'Presenter Demo', exact: true });
    await start.focus(); await page.keyboard.press('Enter');
    const demo = page.getByRole('region', { name: 'Presenter Demo', exact: true });
    await expect(demo.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(demo).toContainText('FICTIONAL & UNVERIFIED');
    await expect(demo).toContainText(sampleIdea);
    await expect(demo).toContainText(sampleContext);
    await expect(demo.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
    await expect(demo.getByRole('button', { name: /The questions/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Voice & playback settings' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await page.keyboard.press('Enter');
    await expect(demo).toBeVisible();
    await demo.getByRole('button', { name: 'Hide talking points' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#presenter-talking-points')).toBeHidden();
    for (let index = 0; index < 4; index++) {
      await expect(demo.getByRole('status').filter({ hasText: 'Demo stop' })).toContainText(`Demo stop ${index + 1} of 4`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (index < 3) {
        await demo.getByRole('button', { name: 'Next', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(demo.getByRole('heading', { level: 1 })).toBeFocused();
      }
    }
    await expect(demo.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await expect(demo).toContainText('PREWRITTEN, NOT YOUR CHOICE');
    await demo.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(demo).toContainText('Demo stop 3 of 4');
    await demo.getByRole('button', { name: 'Replay', exact: true }).click();
    await expect(demo).toContainText('Demo stop 1 of 4');
    await expect(page.locator('#presenter-talking-points')).toBeHidden();
    await demo.getByRole('button', { name: 'Show talking points' }).click();
    await expect(page.locator('#presenter-talking-points')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await demo.getByRole('button', { name: 'Exit demo', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(start).toBeFocused();
    await start.click();
    await expect(demo).toContainText('Demo stop 1 of 4');
    await page.keyboard.press('Escape');
    await expect(start).toBeFocused();
    expect(calls).toEqual([]);
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([['product-bet-studio:theme:v1', theme]]);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });
}

test('presenter preserves both consented draft fields, error and existing tour progress', async ({ page }) => {
  await configured(page);
  await page.route('**/api/clarify', route => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('Fictional personal workspace idea that must survive a presentation.');
  await page.locator('#context').fill('Fictional supporting notes, never part of the presenter sample.');
  await page.getByRole('checkbox', { name: 'Keep this unsent draft on this device' }).check();
  const stored = await page.evaluate(() => Object.entries(localStorage));
  await page.getByRole('button', { name: 'Find the useful questions' }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  const error = await page.getByRole('alert').innerText();
  await page.getByRole('button', { name: 'Take a guided tour' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Presenter Demo', exact: true }).click();
  const demo = page.getByRole('region', { name: 'Presenter Demo', exact: true });
  await expect(demo).not.toContainText('Fictional personal workspace');
  await demo.getByRole('button', { name: 'Next', exact: true }).click();
  await demo.getByRole('button', { name: 'Exit demo', exact: true }).click();
  await expect(page.locator('#idea')).toHaveValue('Fictional personal workspace idea that must survive a presentation.');
  await expect(page.locator('#context')).toHaveValue('Fictional supporting notes, never part of the presenter sample.');
  await expect(page.getByRole('checkbox', { name: 'Keep this unsent draft on this device' })).toBeChecked();
  await expect(page.getByRole('alert')).toHaveText(error);
  await expect(page.locator('.walkthrough')).toContainText('Step 2 of 4');
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual(stored);
  await expect(page.locator('.journey:visible [aria-current]')).toContainText('The material');
});

test('presenter preserves a completed human decision and guide history stays separate', async ({ page }) => {
  await configured(page);
  await page.getByRole('button', { name: 'Explore the illustrative review' }).click();
  await page.getByRole('button', { name: /The questions/ }).click();
  await page.locator('#Q1').fill('Fictional answer kept in the real workspace, not in the demo.');
  await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
  await page.locator('input[value=stop]').check();
  await page.locator('#rationale').fill('Fictional PM chooses stop, not the presenter decision.');
  await page.getByRole('button', { name: 'Create my decision pack' }).click();
  await page.getByRole('button', { name: 'Presenter Demo', exact: true }).click();
  const demo = page.getByRole('region', { name: 'Presenter Demo', exact: true });
  for (let index = 0; index < 3; index++) await demo.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(demo).toContainText('Test first');
  await expect(demo).not.toContainText('Fictional PM chooses stop');
  await demo.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.evaluate(() => { location.hash = 'builder'; });
  await expect(demo).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Build an app like this' })).toBeFocused();
  await page.getByRole('link', { name: 'Return to your Studio' }).click();
  await expect(page.locator('.human-decision')).toContainText('Fictional PM chooses stop');
  await expect(page.locator('.journey [aria-current]')).toContainText('Your decision');
  await page.getByRole('button', { name: /The questions/ }).click();
  await expect(page.locator('#Q1')).toHaveValue('Fictional answer kept in the real workspace, not in the demo.');
});

test('reduced motion retains presenter content and all progression', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await configured(page);
  await page.getByRole('button', { name: 'Presenter Demo', exact: true }).click();
  const demo = page.getByRole('region', { name: 'Presenter Demo', exact: true });
  for (let index = 0; index < 4; index++) {
    await expect(demo.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await demo.locator('.page-heading .eyebrow').evaluate(element => getComputedStyle(element, '::after').animationName)).toBe('none');
    if (index < 3) await demo.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await demo.getByRole('button', { name: 'Exit demo' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Before you build');
});
