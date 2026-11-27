const production = 'https://product-bet-review-studio-production.up.railway.app/';
const canvas = document.querySelector('#canvas');
const fields = [...canvas.querySelectorAll('[data-field]')];
const status = document.querySelector('#canvas-status');
const confirmation = document.querySelector('#clear-confirmation');
const clearButton = document.querySelector('#clear-canvas');
const mirrors = new Map();
for (const field of fields) {
  const mirror = document.createElement('p');
  mirror.className = 'print-value';
  mirror.setAttribute('aria-hidden', 'true');
  field.after(mirror);
  mirrors.set(field, mirror);
}
function syncPrint() {
  for (const field of fields) mirrors.get(field).textContent = field.value.trim() || 'Not recorded — write here.';
}
function clearEntries() {
  for (const field of fields) field.value = '';
  confirmation.hidden = true;
  syncPrint();
}
clearEntries();
document.body.classList.add('enhanced');
for (const button of canvas.querySelectorAll('button')) button.disabled = false;
canvas.addEventListener('input', syncPrint);
canvas.addEventListener('change', syncPrint);
addEventListener('beforeprint', syncPrint);
addEventListener('pagehide', clearEntries);
addEventListener('pageshow', event => { if (event.persisted) clearEntries(); });
document.querySelector('#print-canvas').addEventListener('click', () => {
  syncPrint();
  status.textContent = 'Print only your canvas. Your browser controls the printer or PDF destination.';
  window.print();
});
document.querySelector('#download-canvas').addEventListener('click', () => {
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const entries = fields.map(field => `## ${field.dataset.field}\n\n${escape(field.value.trim() || '[Not recorded]').split(/\r?\n/).map(line => `> ${line}`).join('\n')}`);
  const markdown = [
    '# Product Bet Canvas',
    'A build-ready starting brief, not a finished app or complete roadmap. Evidence remains supplied, unknowns remain unknown, and thresholds are proposals until tested. The decision is human-owned.',
    ...entries,
    '---\nCreated deliberately in the Product Bet workshop. Entries were not submitted or automatically saved by the page.',
  ].join('\n\n') + '\n';
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'product-bet-canvas.md';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = 'Markdown download requested. Keep the file yourself; this page has not saved a copy.';
});
clearButton.addEventListener('click', () => {
  confirmation.hidden = false;
  document.querySelector('#cancel-clear').focus();
});
document.querySelector('#cancel-clear').addEventListener('click', () => {
  confirmation.hidden = true;
  clearButton.focus();
});
document.querySelector('#confirm-clear').addEventListener('click', () => {
  clearEntries();
  status.textContent = 'All canvas entries cleared. Nothing was submitted.';
  clearButton.focus();
});
canvas.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !confirmation.hidden) {
    confirmation.hidden = true;
    clearButton.focus();
  }
});
function openFragment() {
  const target = document.getElementById(location.hash.slice(1));
  if (target instanceof HTMLDetailsElement) target.open = true;
}
for (const link of document.querySelectorAll('.method-map a, a[href="#host"]')) {
  link.addEventListener('click', () => {
    const target = document.getElementById(link.hash.slice(1));
    if (target instanceof HTMLDetailsElement) target.open = true;
  });
}
openFragment();
addEventListener('hashchange', openFragment);
try {
  const response = await fetch(new URL('./config.json', import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw new Error('Public configuration request failed');
  const config = await response.json();
  if (config.productionUrl !== production || config.accessPolicy !== 'public' || typeof config.accessNote !== 'string') {
    throw new Error('Unexpected public production configuration');
  }
  for (const note of document.querySelectorAll('[data-access-note]')) note.textContent = config.accessNote;
} catch {
  const alert = document.querySelector('#configuration-error');
  alert.textContent = 'The public configuration could not be verified. The fixed production links above remain visible; check the public source before using them. Your canvas stays on this page.';
  alert.hidden = false;
}
