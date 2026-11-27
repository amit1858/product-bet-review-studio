import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sampleClarification, sampleContext, sampleIdea, sampleReview } from '../../src/sample';
import { starterTemplate } from '../../src/Guide';

const themes = ['paper', 'midnight', 'field-notes'] as const;
const preferenceKey = 'product-bet-studio:theme:v1';

async function capture(page: Page, testInfo: TestInfo, theme: string, screen: string) {
  const artifacts = process.env.STUDIO_SHOWCASE_ARTIFACTS;
  if (!artifacts || !['desktop', 'phone'].includes(testInfo.project.name)) return;
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, `showcase-${theme}-${testInfo.project.name}-${screen}.png`) });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function contrast(page: Page, selectors: string[], minimum = 4.5, property: 'color' | 'outlineColor' | 'borderTopColor' = 'color') {
  const ratios = await page.evaluate(({ selectors, property }) => {
    const rgba = (value: string) => {
      const channels = value.match(/[\d.]+/g)!.map(Number);
      return [...channels.slice(0, 3), channels[3] ?? 1];
    };
    const luminance = (channels: number[]) => {
      const [r, g, b] = channels.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return .2126 * r + .7152 * g + .0722 * b;
    };
    return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).map(element => {
      const ancestors: Element[] = [];
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) ancestors.unshift(ancestor);
      let background = [255, 255, 255];
      for (const ancestor of ancestors) {
        const color = rgba(getComputedStyle(ancestor).backgroundColor);
        background = background.map((channel, i) => color[i] * color[3] + channel * (1 - color[3]));
      }
      const [low, high] = [luminance(rgba(getComputedStyle(element)[property])), luminance(background)].sort((a, b) => a - b);
      return { selector, ratio: (high + .05) / (low + .05) };
    }));
  }, { selectors, property });
  expect(ratios.length).toBeGreaterThan(0);
  for (const value of ratios) expect(value.ratio, value.selector).toBeGreaterThanOrEqual(minimum);
}

async function trackerLane(page: Page, testInfo: TestInfo, theme: string, width: number, screen: string) {
  const tracker = page.getByRole('navigation', { name: 'Review stages', exact: true });
  const geometry = await tracker.evaluate(element => {
    const rect = (box: DOMRect) => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom });
    const steps = Array.from(element.querySelectorAll('li'));
    return {
      markers: steps.map(step => rect(step.querySelector('.step-marker')!.getBoundingClientRect())),
      connectors: steps.slice(0, -1).map(step => {
        const box = step.getBoundingClientRect();
        const style = getComputedStyle(step, '::after');
        const left = box.left + parseFloat(style.left), top = box.top + parseFloat(style.top);
        return { left, top, right: left + parseFloat(style.width), bottom: top + parseFloat(style.height) };
      }),
      labels: Array.from(element.querySelectorAll('.step-label strong, .step-label > span, .step-output, .journey-status')).map(label => ({
        text: label.textContent, ...rect(label.getBoundingClientRect()),
      })),
    };
  });
  expect(geometry.markers).toHaveLength(4);
  expect(geometry.connectors).toHaveLength(3);
  for (const [index, connector] of geometry.connectors.entries()) {
    const marker = geometry.markers[index], next = geometry.markers[index + 1];
    expect(connector.left).toBeGreaterThanOrEqual(marker.right);
    expect(connector.right).toBeLessThanOrEqual(next.left);
    expect(Math.abs((connector.top + connector.bottom - marker.top - marker.bottom) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs((connector.top + connector.bottom - next.top - next.bottom) / 2)).toBeLessThanOrEqual(1);
    for (const label of geometry.labels) {
      const overlap = connector.left < label.right && connector.right > label.left && connector.top < label.bottom && connector.bottom > label.top;
      expect(overlap, `${screen}: connector ${index + 1} crosses ${label.text}`).toBe(false);
    }
  }
  await noOverflow(page);
  const artifacts = process.env.STUDIO_JOURNEY_ARTIFACTS;
  if (artifacts && testInfo.project.name === 'desktop') {
    await mkdir(artifacts, { recursive: true });
    const name = `${theme}-${width}-${screen}`;
    await tracker.screenshot({ path: path.join(artifacts, `${name}.png`) });
    await writeFile(path.join(artifacts, `${name}.json`), JSON.stringify(geometry, null, 2));
  }
}

for (const theme of themes) {
  for (const width of [390, 836, 1024, 1440]) {
    test(`${theme}: journey connector lane stays clear of text at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      let providerRequests = 0;
      await page.route('**/api/**', route => {
        if (new URL(route.request().url()).pathname === '/api/status') return route.fulfill({ json: {
          ai: false, speech: false, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion',
        } });
        providerRequests++;
        return route.abort('blockedbyclient');
      });
      await page.goto('/');
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole('button', { name: 'Try an example', exact: true }).click();
      await trackerLane(page, testInfo, theme, width, 'material');
      await page.getByRole('button', { name: 'Continue with the example' }).click();
      await trackerLane(page, testInfo, theme, width, 'questions');
      await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
      await trackerLane(page, testInfo, theme, width, 'review');
      await page.locator('input[value=test]').check();
      await page.locator('#rationale').fill('Fictional layout check only. No validated evidence.');
      await page.getByRole('button', { name: 'Create my decision pack' }).click();
      await trackerLane(page, testInfo, theme, width, 'decision');
      await page.getByRole('button', { name: 'Presenter Demo', exact: true }).click();
      const demo = page.getByRole('region', { name: 'Presenter Demo', exact: true });
      for (const [index, stage] of ['material', 'questions', 'review', 'decision'].entries()) {
        await expect(demo.locator('.presenter-progress')).toContainText(`Demo stop ${index + 1} of 4`);
        await trackerLane(page, testInfo, theme, width, `presenter-${stage}`);
        if (index < 3) await demo.getByRole('button', { name: 'Next', exact: true }).click();
      }
      await demo.getByRole('button', { name: 'Exit demo' }).click();
      await expect(page.locator('.human-decision')).toContainText('Fictional layout check only.');
      expect(providerRequests).toBe(0);
    });
  }

  test(`${theme}: compact visual system retains readable controls and expandable learning content`, async ({ page }) => {
    const phone = page.viewportSize()!.width <= 700;
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname === '/api/status') return route.fulfill({ json: {
        ai: false, speech: false, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion',
      } });
      return route.abort('blockedbyclient');
    });
    await page.goto('/');
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    const height = () => page.evaluate(() => document.documentElement.scrollHeight);
    await expect.poll(height).toBeLessThanOrEqual(Math.floor((phone ? 3890 : 2451) * .8));
    const hero = await page.locator('.hero h1').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    expect(hero).toBeGreaterThanOrEqual(phone ? 44 : 64);
    expect(hero).toBeLessThanOrEqual(phone ? 56 : 76);
    await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeInViewport({ ratio: 1 });
    if (!phone) {
      const width = await page.locator('.hero').evaluate(element => {
        const first = element.firstElementChild!.getBoundingClientRect();
        const last = element.lastElementChild!.getBoundingClientRect();
        return last.right - first.left;
      });
      expect(width).toBeGreaterThanOrEqual(1200);
      expect(width).toBeLessThanOrEqual(1280);
      await expect(page.locator('.studio-illustration')).toBeInViewport({ ratio: 1 });
    }
    for (const selector of ['.hero-actions .button', '.note-label', '.note-foot', '.hero-learning p', '.hero-promise', '.folio']) {
      const sizes = await page.locator(selector).evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
      for (const size of sizes) expect(size, selector).toBeGreaterThanOrEqual(13);
    }
    await contrast(page, ['.note-label', '.note-foot', '.illustration-note p', '.hero-learning p']);
    await noOverflow(page);
    await page.getByRole('link', { name: 'Build your own Product Bet', exact: true }).click();
    expect(await height()).toBeLessThanOrEqual(Math.floor((phone ? 5071 : 3877) * .8));
    const detail = page.locator('#guide-material .guide-detail');
    await detail.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(detail).toHaveAttribute('open', '');
    await expect(detail.getByRole('heading', { name: 'Ask yourself' })).toBeVisible();
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new Error('Synthetic clipboard denial'); },
    } }));
    await page.getByRole('button', { name: 'Copy starter template' }).click();
    await expect(page.getByRole('alert')).toContainText('Select and copy');
    const template = page.getByRole('region', { name: 'A starting point, not a script.' }).locator('details');
    await expect(template).toHaveAttribute('open', '');
    await expect(template.locator('pre')).toHaveText(starterTemplate);
    await page.goto('/#builder');
    expect(await height()).toBeLessThanOrEqual(Math.floor((phone ? 4678 : 3973) * .8));
    const method = page.locator('.methodology-flow details').first();
    await method.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(method).toHaveAttribute('open', '');
    await expect(method.locator('p')).toBeVisible();
    await noOverflow(page);
    await page.setViewportSize({ width: 836, height: 936 });
    await page.goto('/');
    const tabletTitle = await page.locator('.hero h1').evaluate(element => ({
      height: element.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(tabletTitle.height).toBeLessThanOrEqual(tabletTitle.lineHeight * 3);
    for (const width of await page.locator('.illustration-note').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))) {
      expect(width).toBeGreaterThanOrEqual(200);
    }
    await page.getByRole('button', { name: 'Explore the illustrative review' }).click();
    for (const width of await page.locator('.reasoning-trail li').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))) {
      expect(width).toBeGreaterThanOrEqual(300);
    }
    await noOverflow(page);
  });

  test(`${theme}: full journey, guide, contrast and responsive surfaces`, async ({ page }, testInfo) => {
    let providerRequests = 0;
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname === '/api/status') return route.fulfill({ json: {
        ai: false, speech: false, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion',
      } });
      providerRequests++;
      return route.abort('blockedbyclient');
    });
    await page.goto('/');
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([[preferenceKey, theme]]);
    await contrast(page, ['.hero-description', '.hero-copy .eyebrow', '.hero-promise span', '.hero-actions .primary', '.private-pill', '.theme-control select']);
    await contrast(page, ['.theme-control select'], 3, 'borderTopColor');
    await noOverflow(page);
    await capture(page, testInfo, theme, 'landing');
    await page.getByRole('button', { name: 'Take a guided tour' }).click();
    await contrast(page, ['.tour-copy p', '.tour-boundary', '.tour-progress li', '.tour-controls .primary']);
    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await contrast(page, ['.tour-controls .primary'], 3, 'outlineColor');
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await page.getByRole('link', { name: 'Build an app like this', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Build an app like this', exact: true })).toBeFocused();
    await contrast(page, ['.builder-workspace .guide-boundary p', '.methodology-flow p', '.builder-index a', '.builder-actions .primary']);
    await page.getByRole('link', { name: 'Return to the Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Try an example', exact: true }).click();
    await expect(page.locator('.journey [aria-current=step]')).toContainText('The material');
    await expect(page.getByRole('button', { name: /The questions/ })).toBeDisabled();
    await expect(page.locator('#idea')).toBeInViewport();
    for (const selector of ['.field-label', '.draft-consent label', '.reasoning-trail summary']) {
      for (const size of await page.locator(selector).evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)))) {
        expect(size, selector).toBeGreaterThanOrEqual(15);
      }
    }
    await expect(page.getByRole('region', { name: 'From material to useful questions' })).toContainText(sampleIdea);
    await contrast(page, ['.trail-heading h3', '.trail-preview', '.trail-note', '.reasoning-trail summary', '.journey .step-label', '.field-label', '.margin-note p']);
    await noOverflow(page);
    await capture(page, testInfo, theme, 'material');
    await page.getByRole('button', { name: 'Continue with the example' }).click();
    await expect(page.locator('.journey li').nth(0)).toHaveAttribute('data-state', 'complete');
    await expect(page.locator('.journey [aria-current=step]')).toContainText('The questions');
    const uncertainty = page.getByRole('region', { name: 'Make the uncertainty visible' });
    await expect(uncertainty).toContainText(`${sampleClarification.questions.length} unanswered`);
    await capture(page, testInfo, theme, 'questions');
    await page.locator('#Q1').fill('A fictional answer, not validation.');
    await expect(uncertainty).toContainText(`${sampleClarification.questions.length - 1} unanswered`);
    await noOverflow(page);
    await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
    await expect(page.locator('.journey [aria-current=step]')).toContainText('The review');
    const reasoning = page.getByRole('region', { name: 'Follow the reasoning' });
    await expect(reasoning).toContainText(sampleReview.evidence[0].quote);
    await reasoning.getByText('Read full claim & boundary', { exact: true }).click();
    await expect(reasoning.locator('details[open]')).toContainText(sampleReview.evidence[0].limitation);
    await reasoning.getByText('Read full claim & boundary', { exact: true }).click();
    await contrast(page, ['.review-title h1', '.trail-note', '.trail-preview', '.reasoning-trail summary', '.limitation', '.gap-group p', '.challenge-panel > p', '.challenge-kicker .eyebrow', '.confidence', '.failure-index', '.test-tag']);
    await noOverflow(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await capture(page, testInfo, theme, 'review');
    await reasoning.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await capture(page, testInfo, theme, 'reasoning');
    if (page.viewportSize()!.width <= 700) {
      const layout = await page.locator('.test-heading').evaluate(element => {
        const title = element.querySelector('div')!.getBoundingClientRect();
        const badge = element.querySelector('.test-tag')!.getBoundingClientRect();
        return { titleWidth: title.width, titleBottom: title.bottom, badgeTop: badge.top };
      });
      expect(layout.titleWidth).toBeGreaterThanOrEqual(200);
      expect(layout.badgeTop).toBeGreaterThanOrEqual(layout.titleBottom);
    }
    await page.locator('#test').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await capture(page, testInfo, theme, 'test');
    await page.locator('input[value=stop]').check();
    await page.locator('#rationale').fill('A fictional team has no capacity. Stop rather than follow the agent.');
    await page.getByRole('button', { name: 'Create my decision pack' }).click();
    await expect(page.locator('.journey [aria-current=step]')).toContainText('Your decision');
    await expect(page.getByRole('button', { name: 'Copy pack', exact: true })).toBeInViewport();
    await expect(page.getByRole('region', { name: 'A small test. A human decision.' })).toContainText('Stop');
    await expect(page.locator('.human-decision')).toContainText('no capacity');
    await page.getByRole('button', { name: /The review/ }).click();
    await expect(page.locator('.journey li').nth(3)).toHaveAttribute('data-state', 'complete');
    await expect(page.getByRole('button', { name: /Your decision/ })).toContainText('Completed');
    await page.getByRole('button', { name: /Your decision/ }).click();
    await contrast(page, ['.human-decision h3', '.human-decision p', '.trail-note', '.story-beat p', '.document-masthead']);
    await noOverflow(page);
    await capture(page, testInfo, theme, 'pack');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Markdown' }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const buffers: Buffer[] = [];
    for await (const chunk of stream!) buffers.push(Buffer.from(chunk));
    const markdown = Buffer.concat(buffers).toString('utf8');
    expect(markdown).toContain('## Build your own Product Bet');
    expect(markdown).toContain('http://localhost:3030/#guide');
    await page.getByRole('link', { name: 'Build your own Product Bet', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Build your own Product Bet', exact: true })).toBeFocused();
    await expect(page.locator('.guide-workspace')).not.toContainText('no capacity');
    await expect(page.locator('.guide-workspace')).not.toContainText(sampleContext);
    await contrast(page, ['.guide-boundary', '.guide-boundary p', '.guide-stage-grid li', '.guide-example p', '.guide-index a', '.guide-template pre']);
    await page.getByRole('navigation', { name: 'Guide stages' }).getByRole('link', { name: '03 Review' }).click();
    await expect(page.locator('#guide-review')).toBeInViewport();
    await expect(page.locator('.guide-workspace')).toBeVisible();
    await noOverflow(page);
    await page.locator('.guide-workspace').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await capture(page, testInfo, theme, 'guide');
    await page.getByRole('link', { name: 'Return to your Studio', exact: true }).click();
    await expect(page.locator('.human-decision')).toContainText('no capacity');
    await page.goBack();
    await expect(page.locator('#guide-review')).toBeInViewport();
    await expect(page.locator('#guide-review')).toBeFocused();
    await page.goForward();
    await expect(page.locator('.human-decision')).toContainText('no capacity');
    await page.getByRole('button', { name: /The material/ }).click();
    await expect(page.locator('#idea')).toHaveValue(sampleIdea);
    await page.locator('#idea').fill('A new fictional product bet clears all downstream analysis.');
    await expect(page.getByRole('button', { name: /The questions/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /The review/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Your decision/ })).toBeDisabled();
    await expect(page.getByRole('region', { name: 'From material to useful questions' })).toContainText('A new fictional product bet');
    expect(providerRequests).toBe(0);
    expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([[preferenceKey, theme]]);
  });

  test(`${theme}: network error remains visible, focused and keyboard dismissible`, async ({ page }, testInfo) => {
    await page.route('**/api/status', route => route.fulfill({ json: { ai: true, speech: false, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion' } }));
    await page.route('**/api/clarify', route => route.abort('internetdisconnected'));
    await page.goto('/');
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.getByRole('button', { name: 'Paste my idea' }).click();
    const idea = 'A fictional app for learning when grocery reminders are useful.';
    const context = 'Synthetic interview notes. No real people, credentials or outcomes.';
    await page.locator('#idea').fill(idea);
    await page.locator('#context').fill(context);
    await contrast(page, ['#idea', '#context'], 3, 'borderTopColor');
    const submit = page.getByRole('button', { name: 'Find the useful questions' });
    await expect(submit).toBeEnabled();
    await submit.scrollIntoViewIfNeeded();
    await submit.click();
    const alert = page.getByRole('alert', { name: /Could not reach the Studio server/ });
    await expect(alert).toBeInViewport({ ratio: 1 });
    await expect(alert).toBeFocused();
    await expect(alert).toHaveAttribute('aria-atomic', 'true');
    expect(await alert.evaluate(element => {
      const style = getComputedStyle(element);
      return style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 3;
    })).toBe(true);
    await contrast(page, ['#request-error-message']);
    await contrast(page, ['.notice.error'], 3, 'outlineColor');
    await contrast(page, ['.notice.error'], 3, 'borderTopColor');
    await capture(page, testInfo, theme, 'error');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Dismiss error' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(alert).toHaveCount(0);
    await expect(page.locator('#idea')).toHaveValue(idea);
    await expect(page.locator('#context')).toHaveValue(context);
    await noOverflow(page);
  });

  test(`${theme}: Enter submission leaves the entire error focus ring inside the viewport`, async ({ page }) => {
    await page.route('**/api/status', route => route.fulfill({ json: { ai: true, speech: false, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion' } }));
    await page.route('**/api/clarify', route => route.abort('internetdisconnected'));
    await page.goto('/');
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.getByRole('button', { name: 'Try an example', exact: true }).click();
    const idea = 'Fictional closeout reminder pilot with no private material.';
    const context = 'Synthetic observations only. No measured benefit.';
    await page.locator('#idea').fill(idea);
    await page.locator('#context').fill(context);
    const submit = page.getByRole('button', { name: 'Find the useful questions' });
    await expect(submit).toBeEnabled();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (await submit.evaluate(element => document.activeElement === element)) break;
    }
    await expect(submit).toBeFocused();
    await page.keyboard.press('Enter');
    const alert = page.getByRole('alert', { name: /Could not reach the Studio server/ });
    await expect(alert).toBeFocused();
    await expect(async () => {
      const bounds = await alert.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        return { top: rect.top, bottom: rect.bottom, ring, height: innerHeight };
      });
      expect(bounds.top, JSON.stringify(bounds)).toBeGreaterThanOrEqual(bounds.ring);
      expect(bounds.bottom + bounds.ring, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.height);
    }).toPass({ timeout: 5000 });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Dismiss error' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(alert).toHaveCount(0);
    await expect(page.locator('#idea')).toHaveValue(idea);
    await expect(page.locator('#context')).toHaveValue(context);
  });
}

test('guide entry, native history, static copy and clipboard failure remain usable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Build your own Product Bet', exact: true }).click();
  await expect(page.locator('.guide-workspace')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.locator('.guide-workspace')).toBeVisible();
  await page.getByRole('navigation', { name: 'Guide stages' }).getByRole('link', { name: '04 Decision' }).click();
  await expect(page.locator('#guide-decision')).toBeInViewport();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { document.documentElement.dataset.copiedTemplate = value; },
    } });
  });
  await page.getByRole('button', { name: 'Copy starter template' }).click();
  await expect(page.getByRole('status')).toContainText('Starter template copied');
  expect(await page.locator('html').getAttribute('data-copied-template')).toBe(starterTemplate);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard disabled for test'); } } });
  });
  await page.getByRole('button', { name: 'Copy starter template' }).click();
  await expect(page.getByRole('alert')).toContainText('Select and copy the template text below');
  await expect(page.getByLabel('Product Bet starter template')).toHaveText(starterTemplate);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Product Bet Review Studio home' }).click();
  await expect(page.getByRole('button', { name: 'Try an example', exact: true })).toBeVisible();
});

test('theme survives reload without persisting the fictional draft or decision', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Theme', { exact: true }).selectOption('midnight');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('This fictional draft must never be saved with the theme.');
  await page.reload();
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('midnight');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await expect(page.locator('#idea')).toHaveValue('');
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([[preferenceKey, 'midnight']]);
});

test('unavailable theme storage is explicit and still permits selection', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage disabled for test'); };
    Storage.prototype.setItem = () => { throw new Error('Storage disabled for test'); };
  });
  await page.goto('/#guide');
  await expect(page.locator('.theme-feedback')).toContainText('Theme storage is unavailable');
  await page.getByLabel('Theme', { exact: true }).selectOption('field-notes');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'field-notes');
  await expect(page.locator('.theme-feedback')).toContainText('Could not save your theme preference');
  await noOverflow(page);
});

test('an unrecognized saved theme uses Paper and reports the invalid preference', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, 'not-a-theme'), preferenceKey);
  await page.goto('/#guide');
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('paper');
  await expect(page.locator('.theme-feedback')).toContainText('Saved theme was not recognized');
  await page.getByLabel('Theme', { exact: true }).selectOption('midnight');
  await expect(page.locator('.theme-feedback')).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), preferenceKey)).toBe('midnight');
});

test('a review without evidence shows a hypothesis, never an invented signal', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { ai: true, speech: false, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion' } }));
  await page.route('**/api/clarify', route => route.fulfill({ json: { bet: 'A fictional hypothesis with no supporting material.', questions: [] } }));
  await page.route('**/api/review', route => route.fulfill({ json: { ...sampleReview, evidence: [], challenge: { ...sampleReview.challenge, sourceIds: [] } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.locator('#idea').fill('A fictional hypothesis with no supporting material.');
  await page.getByRole('button', { name: 'Find the useful questions' }).click();
  await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
  const reasoning = page.getByRole('region', { name: 'Follow the reasoning' });
  await expect(reasoning).toContainText('No supporting evidence supplied');
  await expect(reasoning).toContainText('No evidence-backed conclusion');
  await expect(reasoning).not.toContainText(sampleReview.evidence[0].quote);
});

test('guide history cannot bypass pending-analysis or transcript navigation locks', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { ai: true, speech: true, ttsModel: 'bulbul:v4-flash', voices: ['shubh_enhi_companion'], defaultVoice: 'shubh_enhi_companion' } }));
  await page.route('**/api/speech/transcribe', route => route.fulfill({ json: { transcript: 'A fictional grocery reminder test.', language: 'en-IN' } }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/clarify', async route => {
    requests++;
    await pending;
    await route.fulfill({ json: sampleClarification });
  });
  await page.goto('/#guide');
  await page.getByRole('link', { name: 'Return to the Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Paste my idea' }).click();
  await page.getByRole('button', { name: 'Speak: idea', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Stop & transcribe/ }).click();
  const transcript = page.locator('.transcript-review textarea');
  await expect(transcript).toHaveValue('A fictional grocery reminder test.');
  await page.goBack();
  await expect(page.locator('.guide-workspace')).toHaveCount(0);
  await expect(transcript).toHaveValue('A fictional grocery reminder test.');
  await expect(page.getByRole('status').filter({ hasText: 'Add or discard your transcript' })).toBeVisible();
  await page.getByRole('button', { name: 'Add transcript to idea' }).click();
  await page.locator('#context').fill('Only fictional supporting material.');
  await page.getByRole('button', { name: 'Find the useful questions' }).click();
  await expect(page.locator('.notice.loading')).toBeVisible();
  await page.evaluate(() => { window.location.hash = 'guide'; });
  await expect(page.locator('.guide-workspace')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Wait for the current request' })).toBeVisible();
  release();
  await expect(page.locator('#understanding')).toHaveValue(sampleClarification.bet);
  await page.getByRole('button', { name: /The material/ }).click();
  await expect(page.locator('#idea')).toHaveValue('A fictional grocery reminder test.');
  await expect(page.locator('#context')).toHaveValue('Only fictional supporting material.');
  expect(requests).toBe(1);
});

test('reduced motion keeps the journey usable with no entry animation or hidden content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#guide');
  expect(await page.locator('.guide-workspace').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.getByRole('link', { name: 'Return to the Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with the example' }).click();
  await page.getByRole('button', { name: 'Put the bet under pressure' }).click();
  const style = await page.locator('.review-workspace').evaluate(element => {
    const style = getComputedStyle(element);
    return { animation: style.animationName, opacity: style.opacity, transform: style.transform };
  });
  expect(style).toEqual({ animation: 'none', opacity: '1', transform: 'none' });
  await expect(page.getByRole('region', { name: 'Follow the reasoning' })).toBeVisible();
  await noOverflow(page);
});
