const root = document.documentElement;
const requestedTheme = new URLSearchParams(location.search).get('clawpilotTheme');
if (requestedTheme === 'light' || requestedTheme === 'dark') root.dataset.theme = requestedTheme;
const themeButton = document.querySelector('#theme-toggle');
function themeLabel() {
  themeButton.textContent = root.dataset.theme === 'dark' ? 'Switch to light' : 'Switch to dark';
  themeButton.setAttribute('aria-label', `${themeButton.textContent} theme`);
}
themeLabel();
themeButton.hidden = false;
themeButton.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  themeLabel();
});

for (const link of document.querySelectorAll('.method-map a, .text-link[href^="#screen-"]')) {
  link.addEventListener('click', () => {
    const target = document.querySelector(link.hash);
    if (target instanceof HTMLDetailsElement) target.open = true;
  });
}
function openFragment() {
  const target = document.getElementById(location.hash.slice(1));
  if (target instanceof HTMLDetailsElement) target.open = true;
}
openFragment();
addEventListener('hashchange', openFragment);

const destinations = [
  ['[data-live-app]', '', 'Open the live app ↗', 'Live app — release pending'],
  ['[data-live-guide]', '#guide', 'Open the in-app idea guide ↗', 'In-app guide — release pending'],
  ['[data-live-builder]', '#builder', 'Open the in-app builder guide ↗', 'In-app builder — release pending'],
];
function setLinks(origin) {
  for (const [selector, fragment, available, pending] of destinations) {
    for (const link of document.querySelectorAll(selector)) {
      link.href = origin ? new URL(fragment, origin).href : '#availability';
      link.textContent = origin ? available : pending;
    }
  }
}
function unavailable() {
  setLinks(null);
  document.querySelector('#release-status').textContent = 'Production link pending verification. Interactive app links are unavailable.';
}
try {
  const response = await fetch(new URL('./config.json', import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw new Error('Public configuration request failed');
  const config = await response.json();
  if (!['unverified', 'protected', 'public'].includes(config.accessPolicy) || typeof config.accessNote !== 'string') {
    throw new Error('Invalid public access-policy configuration');
  }
  if (config.productionUrl !== null) {
    const url = new URL(config.productionUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || config.accessPolicy === 'unverified') {
      throw new Error('Production origin and access policy must be verified');
    }
    setLinks(url.href);
    document.querySelector('#release-status').textContent = config.accessPolicy === 'protected'
      ? 'Interactive app available. Existing access controls apply; obtain access from the host.'
      : 'Interactive app available. Provider configuration is separate from application access.';
  } else unavailable();
  for (const note of document.querySelectorAll('[data-access-note]')) note.textContent = config.accessNote;
} catch {
  unavailable();
  const alert = document.querySelector('#configuration-error');
  alert.textContent = 'The public live-app configuration could not be loaded or verified. The interactive app links remain unavailable; the story and downloads still work.';
  alert.hidden = false;
}
