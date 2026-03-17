const CACHE = 'lumera-v2';
const ASSETS = ['./index.html', './style.css', './app.js', './8_1sasa11.jpg', './Nancy.jpg', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith('http')) return;
  // Network first for API calls, cache first for assets
  if (e.request.url.includes('api.themoviedb.org') || e.request.url.includes('api.rawg.io')) {
    e.respondWith(fetch(e.request).catch(() => new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    const clone = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, clone));
    return res;
  })));
});

// Handle notification click
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./'));
});
