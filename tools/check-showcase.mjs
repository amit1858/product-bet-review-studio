import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../showcase/', import.meta.url));
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const config = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
assert.match(config.applicationCommit, /^[a-f0-9]{40}$/);
assert.equal(config.accessPolicy, 'public');
assert.ok(typeof config.accessNote === 'string' && config.accessNote.length > 20);
assert.equal(config.productionUrl, 'https://product-bet-review-studio-production.up.railway.app/');
for (const [, href] of html.matchAll(/data-live-app href="([^"]+)"/g)) assert.equal(href, config.productionUrl);
assert.ok([...html.matchAll(/data-live-app href=/g)].length >= 2);
for (const id of ['method', 'studio', 'takeaway', 'workshop', 'canvas', 'worked-example', 'host', 'build', 'trust']) assert.ok(html.includes(`id="${id}"`));
assert.equal([...html.matchAll(/data-field="/g)].length, 14);
assert.equal([...html.matchAll(/<fieldset/g)].length, 7);
assert.doesNotMatch(html, /<form\b|name="bet-/i, 'The canvas must not have a native network submission path');
for (const match of html.matchAll(/<(input|textarea|select)\b([^>]+)>/g)) assert.match(match[2], /autocomplete="off"/);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate document target');
for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  if (value.startsWith('#')) {
    assert.ok(ids.includes(value.slice(1)), `Missing section: ${value}`);
  } else if (value.startsWith('./')) {
    assert.ok((await stat(path.join(root, value))).isFile(), `Missing asset: ${value}`);
  } else {
    assert.ok(value.startsWith('https://'), `Unexpected absolute or unsafe path: ${value}`);
  }
}
for (const image of html.matchAll(/<img\b[^>]+>/g)) {
  assert.match(image[0], /alt="[^"]+"/);
  assert.match(image[0], /width="\d+"/);
  assert.match(image[0], /height="\d+"/);
}
const allowed = new Set(['.html', '.css', '.js', '.json', '.webp', '.svg', '.md']);
async function checkFolder(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isDirectory()) { await checkFolder(filename); continue; }
    assert.ok(allowed.has(path.extname(filename)), `Unexpected Pages artifact: ${entry.name}`);
    assert.ok(!/(?:\.env|cookie|storage.state|trace|credential|session)/i.test(entry.name), `Forbidden Pages artifact: ${entry.name}`);
    if (['.html', '.css', '.js', '.json', '.svg', '.md'].includes(path.extname(filename))) {
      const text = await readFile(filename, 'utf8');
      assert.doesNotMatch(text, /passphrase|staging|protected app|after signing into|obtain access from the host/i, `Stale access copy: ${entry.name}`);
      assert.doesNotMatch(text, /#(?:b11f4b|fd8ea1|9a1a41)\b/i, `Old pink accent: ${entry.name}`);
    }
  }
}
await checkFolder(root);
const provenance = JSON.parse(await readFile(path.join(root, 'assets', 'provenance.json'), 'utf8'));
assert.equal(provenance.applicationCommit, config.applicationCommit);
for (const asset of provenance.assets) {
  assert.equal(path.basename(asset.file), asset.file);
  const contents = await readFile(path.join(root, 'assets', asset.file));
  assert.equal(createHash('sha256').update(contents).digest('hex'), asset.sha256, `Asset provenance mismatch: ${asset.file}`);
}
assert.doesNotMatch(html, /bet-studio-staging|api\.anthropic|api\.sarvam/);
const script = await readFile(path.join(root, 'showcase.js'), 'utf8');
assert.doesNotMatch(script, /localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|document\.cookie|innerHTML/);
assert.equal([...script.matchAll(/\bfetch\(/g)].length, 1, 'Only the public configuration may be fetched');
assert.match(script, /pagehide/);
assert.match(script, /beforeprint/);
assert.match(script, /text\/markdown/);
console.log('Pages build passed: public production links, workshop/canvas structure, relative assets, provenance, stale-copy scan and volatile-input boundaries.');
