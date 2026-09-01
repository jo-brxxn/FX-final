// Service Worker fuer FX Analyst Pro: macht die App offline nutzbar.
// Strategie fuer index.html + die 5 Live-JSON-Dateien: Netzwerk zuerst
// (damit online immer der aktuelle Stand kommt, genau wie bisher ueber
// die cache:'no-store'-Fetches im Hauptskript), Fallback auf den letzten
// Cache-Stand nur wenn das Netz weg ist. Alles andere (Icons, Manifest):
// Cache zuerst, im Hintergrund aktualisieren.
//
// CACHE_VERSION bei groesseren Aenderungen an der App-Shell erhoehen,
// damit alte Caches automatisch aufgeraeumt werden.
// v6 (2026-08-23): Umstellung auf das helle Design - Chrome-Farbe jetzt
// #212C49, also auch manifest.json geaendert. Das
// Manifest laeuft ueber den Cache-First-Zweig unten, wuerde also weiter aus
// dem alten Cache kommen; erst der Versions-Bump erzwingt ein frisches
// Einspielen der App-Shell.
// v7 (2026-09-01): zweite App im selben Repo (Perfect Rezept, rezept.html +
// js/rezept/*). Der Service Worker bedient jetzt BEIDE Seiten - rezept.html
// gehoert deshalb in die App-Shell, und der Offline-Fallback fuer eine
// fehlgeschlagene Navigation darf nicht mehr blind index.html liefern
// (sonst bekommt man offline die falsche App zu sehen).
const CACHE_VERSION = 'fxpro-v7';
const APP_SHELL = [
  './',
  './index.html',
  './rezept.html',
  './js/rezept/app.js',
  './js/rezept/store.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './ff_calendar.json',
  './ind_data.json',
  './bond_data.json',
  './cot_data.json',
  './price_data.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isDataFile = /\/(ff_calendar|ind_data|bond_data|cot_data|price_data)\.json$/.test(url.pathname);

  if (req.mode === 'navigate' || isDataFile) {
    // Cache-Key ohne die "?t=..."-Cache-Busting-Query, damit wiederholte
    // Live-Fetches (mit wechselndem Zeitstempel) denselben Eintrag treffen.
    const cacheKey = isDataFile ? url.pathname : req;
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(cacheKey, copy));
        return res;
      }).catch(() =>
        caches.match(cacheKey).then(cached =>
          cached || caches.match(/rezept/.test(url.pathname) ? './rezept.html' : './index.html'))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        caches.open(CACHE_VERSION).then(cache => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
