// arxiv-proxy — a ~40-line CORS proxy so the static app can query arXiv live.
// export.arxiv.org sends no Access-Control-Allow-Origin header; this worker
// fetches on the browser's behalf, adds CORS, and edge-caches responses so
// repeated queries (and multiple devices) stay polite to arXiv.
//
// GET /?url=<encoded target>   — target must start with an allowlisted prefix.

const ALLOWED_PREFIXES = [
  "https://export.arxiv.org/api/query",
  "https://arxiv.org/html/",
];

const CACHE_SECONDS = 600; // arXiv announces once a day; 10 min is plenty fresh

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
    const target = new URL(request.url).searchParams.get("url");
    if (!target || !ALLOWED_PREFIXES.some((p) => target.startsWith(p))) {
      return new Response("target not allowed", { status: 403 });
    }

    const cache = caches.default;
    const cacheKey = new Request(target, { method: "GET" });
    let upstream = await cache.match(cacheKey);
    if (!upstream) {
      upstream = await fetch(target, {
        headers: {
          "User-Agent":
            "DailyDrop/1.0 (https://github.com/Adavidss/ArxivPaperScraper)",
        },
      });
      if (upstream.ok) {
        const cacheable = new Response(upstream.clone().body, upstream);
        cacheable.headers.set("Cache-Control", `public, max-age=${CACHE_SECONDS}`);
        await cache.put(cacheKey, cacheable);
      }
    }

    const res = new Response(upstream.body, upstream);
    res.headers.set("Access-Control-Allow-Origin", "*");
    res.headers.set("X-Proxy", "arxiv-proxy");
    return res;
  },
};
