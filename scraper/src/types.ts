// The scraper's data types ARE the frontend contract — one source of truth.
// tsx resolves the relative TS import at runtime; `paperFileId` is the only
// runtime export and is dependency-free.
export * from "../../frontend/lib/data-schema";

import type { PaperSource } from "../../frontend/lib/data-schema";

/** A paper as parsed from the arXiv Atom API, before enrichment. */
export interface RawPaper {
  /** Base id without version suffix ("2507.01234" / "quant-ph/0301123"). */
  id: string;
  version: number;
  title: string;
  authorNames: string[];
  categories: string[];
  primaryCategory: string;
  published: string;
  updated: string;
  abstract: string;
  comment: string | null;
  doi: string | null;
}

/** A deduplicated paper queued for (possible) summarization this run. */
export interface Candidate {
  raw: RawPaper;
  followedIds: string[];
  source: PaperSource;
  kind: "new" | "version-bump" | "retry";
}
