/* Service Worker — Fila de Atendimento (PWA do atendente).
   - Navegação (HTML): network-first (respeita o redirect de login); cache só offline.
   - API (/api/*): network-only (nunca cacheia — evita dados após logout).
   - Estáticos: cache-first.
   IMPORTANTE: incremente CACHE_VERSION a cada deploy. */
const CACHE_VERSION = "cao-cia-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const STATIC_ASSETS = [
  "/static/styles.css",
  "/static/ui.js",
  "/static/atendente-minimal.js",
  "/static/logo-256.png",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
  "/static/icons/icon-maskable.png",
  "/static/sound_effects/pet-arrive.mp3",
  "/static/sound_effects/success.mp3",
];

// HTML do shell — guardado só para uso offline (a navegação é network-first).
const SHELL_PAGES = ["/atendente-minimalista"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // add individual (catch) para não falhar o install inteiro por 1 recurso.
      await Promise.all(
        [...STATIC_ASSETS, ...SHELL_PAGES].map((url) => cache.add(url).catch(() => {}))
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // API: sempre rede (nunca cachear).
  if (url.pathname.startsWith("/api/")) return;

  // Navegação (documentos): network-first — honra redirect de login quando online.
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((r) => r || caches.match("/atendente-minimalista"))
      )
    );
    return;
  }

  // Estáticos: cache-first (stale-while-revalidate).
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});