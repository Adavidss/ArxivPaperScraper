// Hand-rolled service worker for the /ArxivPaperScraper/ scope.
// Strategies:
//   /_next/static/**      cache-first (content-hashed, immutable)
//   data/meta.json        network-first (freshness beacon) + schema kill-switch
//   data/**               stale-while-revalidate (subway mode)
//   navigations           network-first w/ 3.5s timeout → cache → cached root
// Versioned cache names; unknown schemaVersion nukes caches and unregisters
// (recovers phones from a bad deploy without user intervention).

const VERSION = "v1";
const KNOWN_SCHEMA = 1;
const SHELL = `ab-shell-${VERSION}`;
const DATA = `ab-data-${VERSION}`;
const ROOT = new URL(self.registration.scope).pathname;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function killSwitch() {
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  await self.registration.unregister();
}

async function checkSchema(res) {
  try {
    const meta = await res.clone().json();
    if (typeof meta.schemaVersion === "number" && meta.schemaVersion > KNOWN_SCHEMA)
      await killSwitch();
  } catch {
    /* not json — ignore */
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached ?? (await network) ?? Response.error();
}

async function networkFirst(request, cacheName, { timeoutMs = 3500, fallbackUrl } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    if (res.ok) {
      cache.put(request, res.clone());
      if (new URL(request.url).pathname.endsWith("/data/meta.json")) checkSchema(res);
    }
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Cross-origin (Wikipedia, arXiv, GitHub API) passes straight through.
  if (url.origin !== location.origin) return;

  if (url.pathname.includes("/_next/static/")) {
    e.respondWith(cacheFirst(request, SHELL));
  } else if (url.pathname.endsWith("/data/meta.json")) {
    e.respondWith(networkFirst(request, DATA, { timeoutMs: 5000 }));
  } else if (url.pathname.includes("/data/")) {
    e.respondWith(staleWhileRevalidate(request, DATA));
  } else if (request.mode === "navigate") {
    e.respondWith(networkFirst(request, SHELL, { fallbackUrl: ROOT }));
  } else {
    e.respondWith(staleWhileRevalidate(request, SHELL));
  }
});
