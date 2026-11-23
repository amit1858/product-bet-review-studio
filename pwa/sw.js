/* Only the public application shell is cached. API requests and user data never are. */
const CACHE = 'product-bet-studio-__BUILD_ID__';
const PRECACHE = __PRECACHE__;
const STATIC_PATHS = new Set(PRECACHE);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('product-bet-studio-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (!response.ok) throw new Error('Shell unavailable');
        return response;
      } catch {
        const cached = await caches.match('/');
        return cached || new Response('Offline shell unavailable. Reconnect to open the Studio.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
  } else if (STATIC_PATHS.has(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then(cached => cached || fetch(request)));
  }
});
