self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("twinly-shell-v1").then((cache) =>
      cache.addAll([
        "/",
        "/index.html",
        "/manifest.webmanifest",
        "/icons/icon-192.svg",
        "/icons/icon-512.svg"
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key === "twinly-shell-v1" ? null : caches.delete(key))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open("twinly-shell-v1").then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
