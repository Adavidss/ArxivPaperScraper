// arXiv Atom API client. Server-side only (the API sends no CORS headers).
// Single-lane request queue at ≤1 req / 3s per arXiv's terms of use.

import { XMLParser } from "fast-xml-parser";
import { ARXIV_THROTTLE_MS, RETRY_DELAYS_MS } from "./config";
import type { RawPaper } from "./types";

const API = "https://export.arxiv.org/api/query";
const USER_AGENT =
  "DailyDrop/1.0 (https://github.com/Adavidss/ArxivPaperScraper)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // These repeat per entry; force arrays so single-item feeds parse the same.
  isArray: (name) => ["entry", "author", "category", "link"].includes(name),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;
async function throttledFetch(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const wait = lastRequestAt + ARXIV_THROTTLE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes("<feed")) throw new Error("arXiv: not an Atom feed");
      return text;
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

/** Collapse arXiv's hard-wrapped whitespace into single spaces. */
const clean = (s: unknown): string =>
  String(s ?? "").replace(/\s+/g, " ").trim();

function parseEntry(entry: Record<string, unknown>): RawPaper | null {
  // <id>http://arxiv.org/abs/2507.01234v2</id> (old style has a slash in the id)
  const idUrl = clean(entry.id);
  const m = idUrl.match(/abs\/(.+?)(?:v(\d+))?$/);
  if (!m) return null;

  const authors = (entry.author as Array<{ name?: unknown }> | undefined) ?? [];
  const categories = (
    (entry.category as Array<Record<string, unknown>> | undefined) ?? []
  )
    .map((c) => clean(c["@_term"]))
    .filter(Boolean);
  const primary = clean(
    (entry["arxiv:primary_category"] as Record<string, unknown> | undefined)?.[
      "@_term"
    ],
  );

  return {
    id: m[1],
    version: m[2] ? Number(m[2]) : 1,
    title: clean(entry.title),
    authorNames: authors.map((a) => clean(a.name)).filter(Boolean),
    categories: categories.length ? categories : primary ? [primary] : [],
    primaryCategory: primary || categories[0] || "unknown",
    published: clean(entry.published),
    updated: clean(entry.updated),
    abstract: clean(entry.summary),
    comment: clean(entry["arxiv:comment"]) || null,
    doi: clean(entry["arxiv:doi"]) || null,
  };
}

async function query(params: Record<string, string>): Promise<RawPaper[]> {
  const url = `${API}?${new URLSearchParams(params)}`;
  const xml = await throttledFetch(url);
  const doc = parser.parse(xml);
  const entries = (doc?.feed?.entry ?? []) as Array<Record<string, unknown>>;
  return entries
    .map(parseEntry)
    .filter((p): p is RawPaper => p !== null && p.abstract.length > 0);
}

/** Recent papers by one author name variant, newest first. */
export function fetchAuthorPapers(
  alias: string,
  maxResults: number,
): Promise<RawPaper[]> {
  return query({
    search_query: `au:"${alias}"`,
    sortBy: "submittedDate",
    sortOrder: "descending",
    max_results: String(maxResults),
  });
}

/** Recent papers in one arXiv category, newest first (For-You pool). */
export function fetchCategoryPapers(
  category: string,
  maxResults: number,
): Promise<RawPaper[]> {
  return query({
    search_query: `cat:${category}`,
    sortBy: "submittedDate",
    sortOrder: "descending",
    max_results: String(maxResults),
  });
}
