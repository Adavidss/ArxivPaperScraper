// Live feed engine: assembles the paper stream CLIENT-SIDE from the arXiv API
// through the arxiv-proxy worker (export.arxiv.org sends no CORS headers).
// Follows/keywords/categories come from localStorage and take effect
// immediately — the repo pipeline is only asynchronous enrichment (AI bites,
// figures, suggestions) that upgrades cards when available.

import { loadFollows } from "./api";
import type { ClientFollows } from "./store";
import { getFollows, setFollows } from "./store";

const PROXY = "https://arxiv-proxy.kidsdc.workers.dev/?url=";
const API = "https://export.arxiv.org/api/query";
/** Per-query result cache TTL — arXiv announces once a day. */
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_KEY = "ab:livecache";

export interface LiveItem {
  id: string;
  version: number;
  title: string;
  abstract: string;
  authorNames: string[];
  authorsLine: string;
  followedIds: string[];
  matchedKeywords: string[];
  primaryCategory: string;
  published: string; // YYYY-MM-DD (submission)
  updatedAt: string;
  source: "follow" | "foryou";
}

const clean = (s: string | null | undefined): string =>
  String(s ?? "").replace(/\s+/g, " ").trim();

function parseAtom(xml: string): LiveItem[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const items: LiveItem[] = [];
  for (const entry of Array.from(doc.getElementsByTagName("entry"))) {
    const idUrl = clean(entry.getElementsByTagName("id")[0]?.textContent);
    const m = idUrl.match(/abs\/(.+?)(?:v(\d+))?$/);
    if (!m) continue;
    const authorNames = Array.from(entry.getElementsByTagName("author")).map(
      (a) => clean(a.getElementsByTagName("name")[0]?.textContent),
    );
    const categories = Array.from(entry.getElementsByTagName("category")).map(
      (c) => c.getAttribute("term") ?? "",
    );
    const primary =
      entry.getElementsByTagName("arxiv:primary_category")[0]?.getAttribute("term") ??
      categories[0] ??
      "unknown";
    items.push({
      id: m[1],
      version: Number(m[2] ?? 1),
      title: clean(entry.getElementsByTagName("title")[0]?.textContent),
      abstract: clean(entry.getElementsByTagName("summary")[0]?.textContent),
      authorNames,
      authorsLine:
        authorNames.length > 3
          ? `${authorNames.slice(0, 3).join(", ")} +${authorNames.length - 3}`
          : authorNames.join(", "),
      followedIds: [],
      matchedKeywords: [],
      primaryCategory: primary,
      published: clean(entry.getElementsByTagName("published")[0]?.textContent).slice(0, 10),
      updatedAt: clean(entry.getElementsByTagName("updated")[0]?.textContent),
      source: "foryou",
    });
  }
  return items;
}

type QueryCache = Record<string, { at: number; items: LiveItem[] }>;

const readCache = (): QueryCache => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as QueryCache;
  } catch {
    return {};
  }
};

function writeCache(cache: QueryCache): void {
  // Drop stale entries so the cache never grows unbounded.
  for (const [k, v] of Object.entries(cache))
    if (Date.now() - v.at > CACHE_TTL_MS * 4) delete cache[k];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota — live-only session */
  }
}

async function arxivQuery(
  params: Record<string, string>,
  force = false,
): Promise<LiveItem[]> {
  const target = `${API}?${new URLSearchParams(params)}`;
  const cache = readCache();
  const hit = cache[target];
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  const res = await fetch(PROXY + encodeURIComponent(target));
  if (!res.ok) {
    if (hit) return hit.items; // stale beats nothing
    throw new Error(`arXiv ${res.status}`);
  }
  const items = parseAtom(await res.text());
  cache[target] = { at: Date.now(), items };
  writeCache(cache);
  return items;
}

/** One-time seed of client follows from the repo copy (older installs). */
export async function ensureFollows(): Promise<ClientFollows> {
  const existing = getFollows();
  if (existing) return existing;
  let seeded: ClientFollows = { authors: [], keywords: [], categories: [] };
  try {
    const f = await loadFollows();
    seeded = {
      authors: f.authors.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases })),
      keywords: f.keywords ?? [],
      categories: f.extraCategories ?? [],
    };
  } catch {
    /* fresh install with no published data yet */
  }
  setFollows(seeded);
  return seeded;
}

const nameMatches = (entryAuthors: string[], names: string[]): boolean => {
  const set = new Set(entryAuthors.map((n) => n.toLowerCase()));
  return names.some((n) => set.has(n.toLowerCase()));
};

export interface LiveFeed {
  followed: LiveItem[];
  discovery: LiveItem[];
  /** Sources that failed this load (shown as a soft warning). */
  failures: number;
}

/**
 * Assemble the live stream: one query per author (name+aliases OR'd), per
 * keyword, per category. Queries run in parallel and each is cached 30 min.
 */
export async function loadLiveFeed(
  follows: ClientFollows,
  opts: { discoveryPages?: number; force?: boolean } = {},
): Promise<LiveFeed> {
  const { discoveryPages = 1, force = false } = opts;
  const jobs: Array<Promise<{ kind: string; ref: string; items: LiveItem[] }>> = [];

  for (const a of follows.authors) {
    const names = [a.name, ...a.aliases].filter(Boolean);
    const q = names.map((n) => `au:"${n}"`).join(" OR ");
    jobs.push(
      arxivQuery(
        {
          search_query: q,
          sortBy: "submittedDate",
          sortOrder: "descending",
          max_results: "20",
        },
        force,
      ).then((items) => ({
        kind: "author",
        ref: a.id,
        items: items.filter((i) => nameMatches(i.authorNames, names)),
      })),
    );
  }
  for (const kw of follows.keywords) {
    jobs.push(
      arxivQuery(
        {
          search_query: `all:"${kw}"`,
          sortBy: "submittedDate",
          sortOrder: "descending",
          max_results: "10",
        },
        force,
      ).then((items) => ({ kind: "keyword", ref: kw, items })),
    );
  }
  for (const cat of follows.categories) {
    for (let page = 0; page < discoveryPages; page++) {
      jobs.push(
        arxivQuery(
          {
            search_query: `cat:${cat}`,
            sortBy: "submittedDate",
            sortOrder: "descending",
            start: String(page * 20),
            max_results: "20",
          },
          force,
        ).then((items) => ({ kind: "category", ref: cat, items })),
      );
    }
  }

  const settled = await Promise.allSettled(jobs);
  const byId = new Map<string, LiveItem>();
  let failures = 0;
  for (const s of settled) {
    if (s.status === "rejected") {
      failures++;
      continue;
    }
    const { kind, ref, items } = s.value;
    for (const item of items) {
      const existing = byId.get(item.id);
      const target = existing ?? { ...item };
      if (kind === "author") {
        if (!target.followedIds.includes(ref)) target.followedIds.push(ref);
        target.source = "follow";
      } else if (kind === "keyword") {
        if (!target.matchedKeywords.includes(ref)) target.matchedKeywords.push(ref);
        target.source = "follow";
      }
      if (!existing) byId.set(item.id, target);
    }
  }

  const all = [...byId.values()].sort((a, b) =>
    b.published === a.published
      ? b.id.localeCompare(a.id)
      : b.published.localeCompare(a.published),
  );
  return {
    followed: all.filter((i) => i.source === "follow"),
    discovery: all.filter((i) => i.source === "foryou"),
    failures,
  };
}

/** Live single-paper lookup (detail page fallback for un-enriched ids). */
export async function loadLivePaper(id: string): Promise<LiveItem | null> {
  const items = await arxivQuery({ id_list: id, max_results: "1" });
  return items[0] ?? null;
}

/** Drop the query cache (pull-to-refresh / manual refresh). */
export function clearLiveCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
