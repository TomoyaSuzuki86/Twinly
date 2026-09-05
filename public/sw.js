const SHELL_CACHE = "twinly-shell-v5";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
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
      Promise.all(keys.map((key) => (key === SHELL_CACHE ? null : caches.delete(key))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/__/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((response) => {
        if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
          const copy = response.clone();
          event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", copy)));
        }
        return response;
      }).catch(async () => (await caches.match("/index.html")) || new Response("通信状態を確認してください", { status: 503 }))
    );
    return;
  }

  // Do not cache authentication handlers, API responses, or arbitrary same-origin URLs.
  if (!url.pathname.startsWith("/assets/") && !url.pathname.startsWith("/icons/") && url.pathname !== "/manifest.webmanifest") return;
  event.respondWith(caches.match(req).then(async (cached) => {
    if (cached) return cached; // Hashed Vite assets are immutable.
    const response = await fetch(req);
    if (response.ok && !response.headers.get("content-type")?.includes("text/html")) {
      const copy = response.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)));
    }
    return response;
  }));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const title = payload.title || "Twinly";
  const options = {
    body: payload.body,
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    tag: payload.tag || "twinly-notification",
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
          return client;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
