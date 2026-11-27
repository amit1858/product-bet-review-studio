import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(fileURLToPath(new URL('../showcase/', import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  return [argument.slice(0, index), argument.slice(index + 1)];
}));
const output = args['--output'];
assert.ok(output, 'Pass --output=<artifact directory> outside the public showcase.');
await mkdir(output, { recursive: true });
const basePath = '/product-bet-review-studio/';
const production = 'https://product-bet-review-studio-production.up.railway.app/';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.md': 'text/markdown' };
const server = args['--url'] ? null : createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname.slice(basePath.length - 1) || '/index.html'));
    if (!url.pathname.startsWith(basePath) || (filename !== root && !filename.startsWith(root + path.sep)) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404).end(); return;
    }
    const target = url.pathname.endsWith('/') ? path.join(filename, 'index.html') : filename;
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(error);
    res.writeHead(404).end();
  }
});
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = args['--url'] || `http://127.0.0.1:${server.address().port}${basePath}`;
const browser = await chromium.launch();
const checks = [];
try {
  for (const width of [1440, 390, 836, 1024]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, hasTouch: width === 390, isMobile: width === 390, reducedMotion: 'reduce', acceptDownloads: true });
    const page = await context.newPage();
    const requests = [], errors = [];
    page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(base);
    assert.equal(response.status(), 200);
    await expect(page.locator('body')).toHaveClass('enhanced');
    await expect(page.locator('#configuration-error')).toBeHidden();
    await page.waitForLoadState('networkidle');
    for (const link of await page.locator('[data-live-app]').all()) assert.equal(await link.getAttribute('href'), production);
    assert.equal(await page.locator('#canvas [data-field]').count(), 14);
    assert.equal(await page.locator('#canvas fieldset').count(), 7);
    assert.deepEqual(await page.locator('.exercise-steps .time').allTextContents(), ['0–2 min', '2–5 min', '5–8 min', '8–12 min', '12–16 min', '16–19 min', '19–20 min']);
    assert.deepEqual(await page.locator('.run-of-show .time').allTextContents(), ['0–5 · 5 min', '5–15 · 10 min', '15–35 · 20 min', '35–42 · 7 min', '42–45 · 3 min']);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.status-dot')).animationName), 'none');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Story overflows');
    await page.screenshot({ path: path.join(output, `story-${width}.png`) });
    for (const name of ['signal', 'question', 'test', 'decision']) {
      await page.locator(`.method-map a[href="#stage-${name}"]`).click();
      await expect(page.locator(`#stage-${name}`)).toHaveAttribute('open', '');
    }
    for (const id of ['screen-material', 'screen-questions', 'screen-review', 'screen-decision']) {
      await page.locator(`#${id}`).evaluate(element => { element.open = true; });
      await expect(page.locator(`#${id} img`)).toBeVisible();
      await page.locator(`#${id} img`).scrollIntoViewIfNeeded();
      await page.locator(`#${id} img`).evaluate(image => image.decode());
    }
    await page.locator('nav a[href="#host"]').click();
    await expect(page.locator('#host')).toHaveAttribute('open', '');
    await page.locator('#canvas').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Expanded story overflows');
    await page.screenshot({ path: path.join(output, `canvas-${width}.png`) });
    if (width === 1440) await page.pdf({ path: path.join(output, 'blank-canvas.pdf'), format: 'A4', printBackground: false });

    await page.locator('#bet-title').focus();
    await page.keyboard.type('VOLATILE_CANVAS_TEST_Title');
    await page.keyboard.press('Tab');
    await expect(page.locator('#bet-user')).toBeFocused();
    const fields = await page.locator('#canvas [data-field]').all();
    for (const field of fields) {
      if (await field.evaluate(element => element.tagName) === 'SELECT') await field.selectOption('Test first');
      else await field.fill(`VOLATILE_CANVAS_TEST_${await field.getAttribute('id')} · supplied, not verified`);
    }
    const longText = 'Fictional user needs an easier workflow.\n'.repeat(22) + 'END_OF_LONG_USER_ENTRY';
    await page.locator('#bet-user').fill(longText);
    await page.locator('#bet-hypothesis').fill('We believe helping <client> & team can improve a fictional outcome. No measured result.');
    const original = await page.locator('#canvas [data-field]').evaluateAll(elements => elements.map(element => element.value));
    await page.locator('#worked-example summary').click();
    assert.deepEqual(await page.locator('#canvas [data-field]').evaluateAll(elements => elements.map(element => element.value)), original);
    await expect(page.locator('#canvas img')).toHaveCount(0);
    await page.locator('#bet-title').focus();
    await page.keyboard.press('Enter');
    assert.equal(page.url(), new URL('#host', base).href, 'Enter must not submit or navigate');

    const pending = page.waitForEvent('download');
    if (width === 390) await page.locator('#download-canvas').tap();
    else await page.locator('#download-canvas').click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), 'product-bet-canvas.md');
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const markdown = Buffer.concat(chunks).toString('utf8');
    assert.match(markdown, /END_OF_LONG_USER_ENTRY/);
    assert.match(markdown, /&lt;client&gt; &amp; team/);
    assert.match(markdown, /## Proposed success threshold — not a measured result/);
    assert.match(markdown, /## Human-owned decision\n\n> Test first/);
    assert.equal((markdown.match(/^## /gm) || []).length, 14);
    if (width === 1440) {
      await writeFile(path.join(output, 'synthetic-completed-canvas.md'), markdown);
      await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; }; });
      await page.locator('#print-canvas').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__printCalls), 1);
      assert.equal(await page.locator('#print-canvas').evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await expect(page.locator('.hero')).toBeHidden();
      await expect(page.locator('.canvas-tools')).toBeHidden();
      await expect(page.locator('#bet-user')).toBeHidden();
      assert.equal(await page.locator('#bet-user + .print-value').textContent(), longText);
      assert.equal(await page.locator('#canvas .print-value').count(), 14);
      await page.pdf({ path: path.join(output, 'completed-canvas.pdf'), format: 'A4', printBackground: false });
      await page.emulateMedia({ media: 'screen' });
      const contrast = await page.evaluate(() => {
        const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = values => values.map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const results = [];
        for (const selector of ['body', '.muted', '.access-note', '.button.primary', 'legend', '.canvas-field label', 'input', 'textarea', '.time', '.pill']) {
          const element = document.querySelector(selector);
          const style = getComputedStyle(element);
          let parent = element, background;
          do { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; } while (parent && (background === 'rgba(0, 0, 0, 0)' || background === 'transparent'));
          const foreground = luminance(rgb(style.color)), back = luminance(rgb(background));
          results.push({ selector, ratio: (Math.max(foreground, back) + .05) / (Math.min(foreground, back) + .05) });
        }
        return results;
      });
      for (const item of contrast) assert.ok(item.ratio >= 4.5, `Insufficient text contrast: ${item.selector} ${item.ratio}`);
      await writeFile(path.join(output, 'contrast.json'), JSON.stringify(contrast, null, 2));
    }
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.locator('#clear-canvas').click();
    await expect(page.locator('#cancel-clear')).toBeFocused();
    await page.locator('#cancel-clear').click();
    assert.deepEqual(await page.locator('#canvas [data-field]').evaluateAll(elements => elements.map(element => element.value)), original);
    await page.locator('#clear-canvas').click();
    await page.locator('#confirm-clear').click();
    assert.ok((await page.locator('#canvas [data-field]').evaluateAll(elements => elements.map(element => element.value))).every(value => value === ''));
    await page.locator('#bet-title').fill('VOLATILE_CANVAS_TEST_reload');
    await page.reload();
    await expect(page.locator('#bet-title')).toHaveValue('');
    await page.locator('#bet-title').fill('VOLATILE_CANVAS_TEST_departure');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect(page.locator('#bet-title')).toHaveValue('');
    if (width === 1440) {
      await page.locator('#bet-evidence').fill('Synthetic evidence.\n'.repeat(85) + 'END_OF_MAX_EVIDENCE');
      await page.locator('#bet-unknown').fill('Unknown.\n'.repeat(120) + 'END_OF_MAX_UNKNOWN');
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: path.join(output, 'long-canvas.pdf'), format: 'A4', printBackground: false });
      await page.emulateMedia({ media: 'screen' });
    }
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
    assert.ok(requests.every(request => request.method === 'GET' && request.body === null && !request.url.includes('VOLATILE_CANVAS_TEST_')), 'Participant input was sent');
    assert.ok(requests.every(request => request.url.startsWith(new URL(base).origin)), 'External resource request');
    checks.push({ width, noOverflow: true, steps: 7, hostMinutes: 45, liveLinks: true, screenshotsLoad: true, keyboard: true, markdown: true, noInputSubmission: true, noWebStorage: true, clearAndRefresh: true, reducedMotion: true });
    await context.close();
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(base);
  await expect(page.locator('#bet-user')).toBeEditable();
  assert.equal(await page.locator('[data-live-app]').first().getAttribute('href'), production);
  await context.close();
  const report = { base, checks, noJavaScriptBlankCanvasAndLinks: true, pdf: 'completed-canvas.pdf', printDialogInvokedByKeyboard: true, physicalPrinterTested: false };
  await writeFile(path.join(output, 'browser-checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
