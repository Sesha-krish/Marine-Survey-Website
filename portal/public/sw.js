// Offline support for the surveyor app.
// - Static assets: cache-first.
// - /s pages: network-first, falling back to the last cached copy so a surveyor can reopen a
//   survey with no signal. Survey data itself is queued on-device by the page (src/lib/offline.ts).
const VERSION = "msp-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API or signed files

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r))));
    return;
  }
  if (req.mode === "navigate" && (url.pathname === "/s" || url.pathname.startsWith("/s/"))) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) caches.open(PAGES).then((c) => c.put(req, r.clone()));
          return r;
        })
        .catch(async () => (await caches.match(req)) ?? (await caches.match("/s")) ?? new Response("You're offline. Open this survey once while online to make it available offline.", { status: 503, headers: { "content-type": "text/plain" } })),
    );
  }
});
