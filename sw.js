// Offline-Cache für die App-Hülle. Bei Änderungen an Dateien VERSION erhöhen.
const VERSION = 'v11';
const CACHE = `gym-tracker-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/calc.js',
  './js/chart.js',
  './js/util.js',
  './js/i18n.js',
  './js/names.js',
  './js/off.js',
  './js/scanner.js',
  './js/ai.js',
  './vendor/anthropic-sdk.mjs',
  './js/views/home.js',
  './js/views/training.js',
  './js/views/food.js',
  './js/views/weight.js',
  './js/views/goals.js',
  './js/views/settings.js',
  './js/views/news.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gym-tracker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: sofort aus dem Cache (offline im Gym), im Hintergrund aktualisieren.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // News: erst Netzwerk (aktuell), offline den letzten Stand
  if (new URL(req.url).pathname.endsWith('/news.json')) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cache.match(req, { ignoreSearch: true }))
      )
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
