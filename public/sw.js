const SHELL_CACHE_VERSION = "twinly-shell-v19";
const BUILD_CACHE_KEY = "dev";
const SHELL_CACHE = `${SHELL_CACHE_VERSION}-${BUILD_CACHE_KEY}`;

const STATIC_PRECACHE = [
  "/manifest.webmanifest",
  "/assets/twinly-launch-v2.mp4",
  "/icons/icon-192-v7.png",
  "/icons/icon-512-v7.png",
  "/icons/icon-192-maskable-v8.webp",
  "/icons/icon-512-maskable-v8.webp",
  "/assets/twinly-header-logo-v1.webp",
  "/icons/apple-touch-icon-v7.png",
  "/icons/favicon-32-v7.png",
];

const BUILD_ASSET_PRECACHE = [];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Never let one flaky asset abort the entire worker installation. Once the
    // worker controls the app, normal online requests will backfill any misses.
    const results = await Promise.allSettled(
      [...BUILD_ASSET_PRECACHE, ...STATIC_PRECACHE].map((url) => cache.add(url))
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed) console.warn(`Twinly precache missed ${failed} asset(s); runtime cache will backfill them.`);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Warm the navigation shell again during activation. This gives an online
    // launch a second chance even if install-time precaching partially failed.
    await Promise.allSettled(
      ["/", "/index.html"].map(async (url) => {
        if (await cache.match(url)) return;
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) await cache.put(url, response);
      })
    );

    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) =>
        key.startsWith("twinly-shell-") && key !== SHELL_CACHE
          ? caches.delete(key)
          : null
      )
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/__/")) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cached = (await caches.match(req, { ignoreSearch: true })) || (await caches.match("/index.html"));
      if (cached) {
        return cached;
      }
      try {
        const response = await fetch(req, { cache: "no-store" });
        if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
          const copy = response.clone();
          event.waitUntil(caches.open(SHELL_CACHE).then((cache) => Promise.all([
            cache.put("/", copy.clone()),
            cache.put("/index.html", copy),
          ])));
        }
        return response;
      } catch {
        return cached || new Response("通信状態を確認してください", { status: 503 });
      }
    })());
    return;
  }

  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      fetch(req, { cache: "no-store" }).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)));
        }
        return response;
      }).catch(async () => (await caches.match(req)) || new Response("", { status: 503 }))
    );
    return;
  }

  if (!url.pathname.startsWith("/assets/") && !url.pathname.startsWith("/icons/")) return;
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const response = await fetch(req);
      if (response.ok && !response.headers.get("content-type")?.includes("text/html")) {
        const copy = response.clone();
        event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)));
      }
      return response;
    } catch {
      return new Response("", { status: 503 });
    }
  })());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  const title = payload.title || "Twinly";
  const options = {
    body: payload.body,
    icon: "/icons/icon-192-v7.png",
    badge: "/icons/icon-192-v7.png",
    tag: payload.tag || "twinly-notification",
    data: {
      url: payload.url || "/",
      careReminder: payload.careReminder || null,
      careReminders: Array.isArray(payload.careReminders) ? payload.careReminders : [],
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
          if ("navigate" in client) return client.navigate(targetUrl);
          return client;
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );
});
