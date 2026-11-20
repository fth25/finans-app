const CACHE = 'parabu-v8';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/features.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => Promise.all(ASSETS.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Sadece GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API ve e-posta doğrulama URL'leri önbelleğe girmesin
  if (
    url.pathname.startsWith('/api/') ||
    ['token_hash', 'access_token', 'refresh_token', 'code'].some(key =>
      url.searchParams.has(key)
    )
  ) return;

  event.respondWith(
    caches.match(req).then(cached => {
      // Cache'te varsa: hemen dön, arka planda güncelle (stale-while-revalidate)
      if (cached) {
        fetch(req)
          .then(res => {
            if (res && res.ok) {
              caches.open(CACHE).then(c => c.put(req, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }

      // Cache'te yoksa: ağdan çek, başarılıysa cache'e at
      return fetch(req)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(
          () =>
            new Response('Çevrimdışısınız ve bu içerik önbellekte bulunmuyor.', {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
        );
    })
  );
});