const VERSION = '0.2.6';
const CACHE = 'dans-eps-v' + VERSION;
const ROOT = new URL('./', self.location.href);
const INDEX = new URL('./index.html', ROOT).href;
const ASSETS = [
  './index.html', './style.css?v=' + VERSION, './app.js?v=' + VERSION,
  './manifest.webmanifest', './icon.jpg'
].map(path => new URL(path, ROOT).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => {
    return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('dans-eps-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

async function loadPage(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.status < 500) return response;
  } catch {
    // The app shell is available from the cache when the network is unavailable.
  }
  const cache = await caches.open(CACHE);
  return await cache.match(INDEX) || Response.error();
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin === ROOT.origin &&
      (url.pathname === ROOT.pathname || url.pathname === new URL(INDEX).pathname)) {
    event.respondWith(loadPage(request));
  } else if (ASSETS.includes(request.url)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request))
      .then(cached => cached || fetch(request)));
  }
});
