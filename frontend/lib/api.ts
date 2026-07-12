// Static data client. There is no live backend: the app reads pre-built JSON
// from <basePath>/data/*.json (baked in by the digest workflow) and does all
// filtering/ordering in the browser. Personal state lives in localStorage.

import type {
  FeedFile,
  FollowsFile,
  MetaFile,
  OverviewFile,
  PaperDetail,
  SuggestionsFile,
} from "./data-schema";
import { paperFileId } from "./data-schema";

/** Project sites live under /<repo>; next.config sets this. Empty in dev. */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function loadJSON<T>(path: string, noCache = false): Promise<T> {
  const res = await fetch(
    `${BASE}/data/${path}`,
    noCache ? { cache: "no-cache" } : undefined,
  );
  if (!res.ok) throw new Error(`data/${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Freshness beacon — always revalidated. */
export const loadMeta = () => loadJSON<MetaFile>("meta.json", true);

export const loadFeed = () => loadJSON<FeedFile>("feed.json");

export const loadPaper = (id: string) =>
  loadJSON<PaperDetail>(`papers/${paperFileId(id)}.json`);

export const loadOverview = (date: string) =>
  loadJSON<OverviewFile>(`overviews/${date}.json`);

export const loadFollows = () => loadJSON<FollowsFile>("follows.json");

/** Author discovery — tolerant of deploys that predate the file. */
export const loadSuggestions = (): Promise<SuggestionsFile> =>
  loadJSON<SuggestionsFile>("suggestions.json").catch(() => ({
    generatedAt: "",
    suggestions: [],
  }));
