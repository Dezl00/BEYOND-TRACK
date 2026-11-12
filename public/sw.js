const CACHE = "bt-public-v2";
const PUBLIC_ASSETS = [
  "/offline",
  "/offline?lang=en",
  "/icon.svg",
  "/pwa-192.png",
  "/pwa-512.png",
  "/pwa-maskable.png",
];
async function trim(cache) {
  const keys = await cache.keys();
  const removable = keys.filter(
    (key) =>
      new URL(typeof key === "string" ? key : key.url).pathname !== "/offline-language" && !PUBLIC_ASSETS.includes(
        new URL(typeof key === "string" ? key : key.url).pathname,
      ),
  );
  await Promise.all(
    removable
      .slice(0, Math.max(0, keys.length - 80))
      .map((key) => cache.delete(key)),
  );
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PUBLIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("bt-public-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("message", (event) => {
  if(event.data?.type!=="display-locale" || !["en","ar"].includes(event.data.locale))return;
  event.waitUntil(caches.open(CACHE).then(cache=>cache.put("/offline-language",new Response(event.data.locale))));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") {
    // All authenticated pages stay network-only. Offline fallback contains no account data.
    event.respondWith(
      fetch(request).catch(
        async () => {const cache=await caches.open(CACHE);const locale=await (await cache.match("/offline-language"))?.text();return await cache.match(locale==="en"?"/offline?lang=en":"/offline") || Response.error();},
      ),
    );
    return;
  }
  const immutable = url.pathname.startsWith("/_next/static/");
  if (!immutable && !PUBLIC_ASSETS.includes(url.pathname)) return;
  event.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open(CACHE);
        const saved = await cache.match(request);
        if (saved) return saved;
      } catch {}
      const response = await fetch(request);
      if (cache && response.ok && response.type !== "opaque") {
        try {
          await cache.put(request, response.clone());
          await trim(cache);
        } catch {}
      }
      return response;
    })(),
  );
});
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag,
        icon: "/pwa-192.png",
        badge: "/icon.svg",
        data: { url: data.url },
        dir: "rtl",
        lang: "ar",
      }),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) =>
          clients.forEach((client) =>
            client.postMessage({ type: "siteflow-update" }),
          ),
        ),
    ]),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/notifications",
    self.location.origin,
  );
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = windows.find((window) => window.url === target.href);
      if (client) return client.focus();
      return self.clients.openWindow(target.href);
    })(),
  );
});
