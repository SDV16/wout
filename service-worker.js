// Service worker: cachet de hele app bij de eerste keer laden, zodat elke
// volgende keer opstarten (ook zonder internet) direct uit de cache werkt.
// Geen enkele network call naar een server - alles draait lokaal in de app.

const CACHE_NAME = "opstelling-app-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/data.js",
  "./js/logic.js",
  "./js/substitutions.js",
  "./js/state.js",
  "./js/position-editor.js",
  "./js/render-team.js",
  "./js/manual-lineup.js",
  "./js/render-results.js",
  "./js/render-manual.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first: werkt de app volledig offline; bij een nieuwe versie wordt de
// cache ververst zodra er weer internet is (normale PWA-update-flow).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
