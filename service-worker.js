// Service worker: zorgt dat de app ook zonder internet start.
//
// Strategie: NETWORK-FIRST met cache als terugval. Bij internet krijg je dus
// altijd de nieuwste bestanden (geen oude en nieuwe versies door elkaar, wat
// eerder knoppen kon laten falen); zonder internet - of bij een erg trage
// verbinding - komt alles uit de cache. Alles blijft lokaal: er worden geen
// gegevens naar een server gestuurd.
//
// BELANGRIJK: verhoog CACHE_NAME bij elke nieuwe versie van de app. Dan worden
// oude caches bij het activeren automatisch opgeruimd.

const CACHE_NAME = "opstelling-app-v4";
const NETWORK_TIMEOUT_MS = 4000;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/data.js",
  "./js/logic.js",
  "./js/state.js",
  "./js/position-editor.js",
  "./js/render-team.js",
  "./js/manual-lineup.js",
  "./js/auto-lineup.js",
  "./js/render-results.js",
  "./js/render-manual.js",
  "./js/print-sheet.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: "reload" -> nooit een verouderde kopie uit de HTTP-cache van de browser opslaan
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request, { cache: "no-cache" }).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetchWithTimeout(event.request, NETWORK_TIMEOUT_MS)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
