const CACHE_NAME = 'diego-danna-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/portada.jpeg'
];

// Instalación del service worker y cache de recursos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activación y limpieza de caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de cache: Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Evita romper peticiones no-GET (cache.put lanza) y evita cachear cross-origin.
  const isCacheable = req.method === 'GET' && url.origin === self.location.origin;

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (isCacheable && response && (response.ok || response.type === 'opaque')) {
          const responseToCache = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseToCache)).catch(() => {})
          );
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "Diego Y Danna", body: event.data ? String(event.data.text()) : "" };
  }

  const title = payload.title || "Diego Y Danna";
  const options = {
    body: payload.body || "",
    icon: "/portada.jpeg",
    badge: "/portada.jpeg",
    data: payload.data || {},
    renotify: false,
    tag: payload.tag || undefined
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
