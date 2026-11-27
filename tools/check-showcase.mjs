import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../showcase/', import.meta.url));
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const config = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
assert.match(config.applicationCommit, /^[a-f0-9]{40}$/);
assert.ok(['unverified', 'protected', 'public'].includes(config.accessPolicy));
assert.ok(typeof config.accessNote === 'string' && config.accessNote.length > 20);
if (config.productionUrl !== null) {
  const url = new URL(config.productionUrl);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.username + url.password + url.search + url.hash, '');
  assert.notEqual(config.accessPolicy, 'unverified');
} else {
  assert.match(html, /Production link pending/);
}
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
console.log('Showcase config, section targets, relative assets, image descriptions, asset provenance and static-only file allowlist passed.');
