const CACHE = 'einkaufsliste-v31';

// Automatisch den richtigen Basispfad erkennen
// → lokal: '/'  |  GitHub Pages: '/Einkaufsliste/'
const BASE = self.location.pathname.replace(/sw\.js$/, '');

const FILES = [
  BASE + 'einkaufsliste.html',
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'Einkaufswagenbild.jpg',
  BASE + 'datenschutz.html',
  BASE + 'impressum.html',
  BASE + 'agb.html',
  BASE + 'offers.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Update-Befehl von der App empfangen
self.addEventListener('message', e => {
  if(e.data === 'SKIP_WAITING') self.skipWaiting();
});
