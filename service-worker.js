const CACHE_NAME = "family-tasks-v67";
const STATIC_ASSETS = [
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

// Install: cache static assets only (not index.html — fetch fresh on navigate)
self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: delete ALL old caches, claim clients, notify about new version
self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return null;
        })
      );
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      return self.clients.matchAll({ type: "window" });
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({ type: "NEW_VERSION_READY", cacheName: CACHE_NAME });
      });
    })
  );
});

self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", function(event) {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isNavigation = event.request.mode === "navigate";
  const isStaticAsset = isLocal && (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname === "/manifest.json"
  );

  if (isNavigation) {
    // Network first for HTML: always try to get fresh index.html
    event.respondWith(
      fetch(event.request).then(function(response) {
        // Cache the fresh response for offline fallback
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        // Offline: serve cached index.html
        return caches.match("index.html").then(function(cached) {
          return cached || new Response("Приложение недоступно офлайн", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        });
      })
    );
    return;
  }

  if (isStaticAsset) {
    // Cache first for icons/manifest: rarely change
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) {
          return cached;
        }
        return fetch(event.request).then(function(response) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        }).catch(function() {
          return new Response("", { status: 503 });
        });
      })
    );
    return;
  }

  // All other requests (Firebase API, CDN scripts): network only, no cache
  event.respondWith(
    fetch(event.request).catch(function() {
      return new Response("", { status: 503 });
    })
  );
});
