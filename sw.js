const CACHE = 'einkaufsliste-v44';

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
  // Sofort aktivieren – nicht auf Tab-Schließen warten
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  // Alle offenen Clients sofort übernehmen
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const path = url.pathname;

  // ── HTML-Dateien: Network-first ──────────────────────────────────────────
  // Immer zuerst vom Netz holen → Update sofort sichtbar
  // Nur bei Offline-Fehler auf Cache zurückfallen
  const isHtml = path.endsWith('.html') || path === BASE || path === BASE.slice(0,-1);

  if (isHtml) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(response => {
          // Frische Version in Cache speichern
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request)) // Offline-Fallback
    );
    return;
  }

  // ── offers.json: Network-first mit kurzem Timeout ────────────────────────
  if (path.endsWith('offers.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // ── Alles andere: Cache-first (Bilder, Fonts, Icons – offline-fähig) ─────
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      });
    })
  );
});

// Update-Befehl von der App empfangen
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  // Force-Clear: alle Caches löschen
  if (e.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
