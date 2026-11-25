const VERSION = '0.2.1';
const CACHE = 'dans-eps-v' + VERSION;
const ROOT = new URL('./', self.location.href);
const ASSETS = [
  './', './index.html', './style.css?v=' + VERSION, './app.js?v=' + VERSION,
  './manifest.webmanifest', './icon.jpg'
].map(path => new URL(path, ROOT).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => {
    return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
  }));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('dans-eps-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !ASSETS.includes(event.request.url)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request))
    .then(cached => cached || fetch(event.request)));
});
