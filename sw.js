const CACHE = 'lumera-v8';
const ASSETS = [
  './index.html', './style.css', './app.js',
  './8_1sasa11.jpg', './Nancy.jpg', './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (!url.startsWith('http')) return;

  // Network-only for API calls
  if (url.includes('api.themoviedb.org') || url.includes('api.rawg.io')) {
    e.respondWith(fetch(e.request).catch(() => new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Cache-first for media images
  if (url.includes('image.tmdb.org') || url.includes('media.rawg.io')) {
    e.respondWith(caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) { caches.open(CACHE).then(c => c.put(e.request, res.clone())); }
        return res;
      }).catch(() => new Response('', { status: 503 }));
    }));
    return;
  }

  // Stale-while-revalidate for local assets
  e.respondWith(caches.match(e.request).then(cached => {
    const net = fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') { caches.open(CACHE).then(c => c.put(e.request, res.clone())); }
      return res;
    }).catch(() => cached || new Response('', { status: 503 }));
    return cached || net;
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./'));
});
