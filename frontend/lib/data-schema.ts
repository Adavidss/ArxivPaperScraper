// Canonical data contract between the scraper pipeline and the frontend.
//
// The scraper (scraper/src/*) imports these types via a relative path and
// WRITES data/*.json; the frontend READS the same JSON from the published
// Pages copy under <basePath>/data/. This file is the single source of truth
// for those shapes — change it here or nowhere.

// ---------------------------------------------------------------------------
// data/follows.json — the one file the user edits (in-app via PAT, or on GitHub)

export interface FollowedAuthor {
  /** Stable slug, e.g. "ronald-walsworth". Used to badge papers in the UI. */
  id: string;
  name: string;
  /** Name-format variants; each is queried separately as au:"<alias>". */
  aliases: string[];
}

export interface FollowsSettings {
  /** How far back author queries look, in days. */
  lookbackDays: number;
  /** Max results fetched per author alias per run. */
  maxPerAuthor: number;
  /** How many For-You (category) papers get summarized per day. */
  forYouPerDay: number;
  /** Rolling retention window for feed/papers/overviews, in days. */
  windowDays: number;
}

export interface FollowsFile {
  version: 1;
  authors: FollowedAuthor[];
  /** Followed topic keywords; each is searched as an exact phrase (all:"…"). */
  keywords: string[];
  /**
   * The ONLY categories the For-You tail draws from — nothing is inferred.
   * Empty array = no discovery papers at all.
   */
  extraCategories: string[];
  settings: FollowsSettings;
}

// ---------------------------------------------------------------------------
// Bite: the AI-generated, bite-sized reading layer of a paper

export interface KeyNumber {
  /** The number itself, e.g. "17x", "4.2 nT/√Hz". */
  value: string;
  label: string;
  /** Sentence-length context shown when the pill is flipped. */
  context: string;
}

export interface GlossaryEntry {
  term: string;
  shortDef: string;
  eli5Def: string;
  /** Exact English Wikipedia article title, or null if none fits. */
  wikiTitle: string | null;
}

export interface Bite {
  /** Model that produced this bite, or "extractive" for the no-LLM fallback. */
  model: string;
  generatedAt: string;
  /** ≤120 chars, punchy and specific. */
  hook: string;
  /** Exactly 3 bullets: what they did / how / what they found. */
  tldr: string[];
  whyItMatters: string;
  eli5: string;
  keyNumbers: KeyNumber[];
  glossary: GlossaryEntry[];
  /** 1 (accessible) … 5 (deep specialist). */
  difficulty: number;
  /** Honest estimate for reading the bite, 30–90. */
  readSeconds: number;
}

/** "ok" = LLM bite; "fallback" = extractive summary, queued for retry. */
export type BiteStatus = "ok" | "fallback";

/** "follow" = from a followed author; "foryou" = category discovery. */
export type PaperSource = "follow" | "foryou";

// ---------------------------------------------------------------------------
// data/papers/<fileId>.json — full per-paper detail (one fetch per opened card)

export interface PaperAuthor {
  name: string;
  /** Present iff this author matches a FollowedAuthor. */
  followedId?: string;
}

export interface PaperLinks {
  abs: string;
  pdf: string;
  /** arXiv's native HTML render (CORS-open; may 404 for older papers). */
  html: string;
}

export interface PaperDetail {
  /** Base arXiv id without version suffix, e.g. "2507.01234" or "quant-ph/0301123". */
  id: string;
  version: number;
  title: string;
  authors: PaperAuthor[];
  categories: string[];
  primaryCategory: string;
  published: string;
  updated: string;
  abstract: string;
  comment: string | null;
  doi: string | null;
  links: PaperLinks;
  source: PaperSource;
  /** Followed keywords this paper matched (empty for author/discovery hits). */
  matchedKeywords: string[];
  /**
   * First content figure from the paper's arXiv HTML render.
   * undefined = not checked yet · null = checked, none available.
   */
  figure?: { url: string } | null;
  /** Tombstone: kept in the feed so client read-state never dangles. */
  withdrawn: boolean;
  biteStatus: BiteStatus;
  bite: Bite;
}

// ---------------------------------------------------------------------------
// data/feed.json — slim rolling index; the pager renders from this alone

export interface FeedItem {
  id: string;
  title: string;
  hook: string;
  /** Display line, e.g. "Walsworth, Smith +4". */
  authorsLine: string;
  followedIds: string[];
  /** Followed keywords this paper matched. */
  matchedKeywords: string[];
  /** First paper figure to show on the card, if the HTML render has one. */
  figureUrl: string | null;
  /**
   * Date the pipeline first saw this paper (YYYY-MM-DD) — the announcement
   * signal that defines "today's drop" (submission `published` can lag the
   * announce by days).
   */
  firstSeen: string;
  primaryCategory: string;
  /** YYYY-MM-DD (announcement-relevant date). */
  published: string;
  difficulty: number;
  readSeconds: number;
  source: PaperSource;
  biteStatus: BiteStatus;
  withdrawn: boolean;
}

export interface FeedFile {
  generatedAt: string;
  windowDays: number;
  /** Sorted by published desc, then id. */
  items: FeedItem[];
}

// ---------------------------------------------------------------------------
// data/overviews/YYYY-MM-DD.json — daily cross-paper synthesis

export interface OverviewTheme {
  title: string;
  body: string;
  paperIds: string[];
}

export interface OverviewConnection {
  body: string;
  paperIds: string[];
}

export interface OverviewFile {
  date: string;
  generatedAt: string;
  model: string;
  headline: string;
  summary: string;
  themes: OverviewTheme[];
  /** Empty array beats forced connections. */
  connections: OverviewConnection[];
  paperIds: string[];
}

// ---------------------------------------------------------------------------
// data/suggestions.json — author discovery, recomputed every run

/** A not-yet-followed author the pipeline thinks the user would like. */
export interface AuthorSuggestion {
  name: string;
  /** Slugified name — dedupe/dismiss key. */
  slug: string;
  score: number;
  /** Followed-author ids this person co-authored with (strongest signal). */
  coAuthoredWith: string[];
  /** Followed keywords whose matches they appear in. */
  viaKeywords: string[];
  /** Discovery categories they're active in. */
  viaCategories: string[];
  /** Up to 3 recent paper ids, newest first. */
  paperIds: string[];
  /** Titles for the first 1-2 of paperIds (card display). */
  recentTitles: string[];
  paperCount: number;
}

export interface SuggestionsFile {
  generatedAt: string;
  suggestions: AuthorSuggestion[];
}

// ---------------------------------------------------------------------------
// data/meta.json — freshness beacon (client fetches with cache: "no-cache")

export type RunStatus = "ok" | "partial";

export interface MetaFile {
  schemaVersion: 1;
  /** Stamped every run, even on empty days — "checked, nothing new" is signal. */
  lastUpdated: string;
  /** Run timestamp id; changing buildId is the client's re-sync trigger. */
  buildId: string;
  lastRunStatus: RunStatus;
  paperCount: number;
  /** Papers still on extractive fallback awaiting an LLM retry. */
  pendingBites: number;
  latestOverview: string | null;
  overviewDates: string[];
  windowDays: number;
}

// ---------------------------------------------------------------------------
// data/state.json — pipeline-private (excluded from the published site)

export interface ProcessedEntry {
  version: number;
  /** Highest version a bite has been generated for (0 = never). */
  summarizedVersion: number;
  firstSeen: string;
}

export interface StateFile {
  processed: Record<string, ProcessedEntry>;
  /** Paper ids with fallback bites awaiting LLM retry, oldest first. */
  retryQueue: string[];
  lastRun: {
    at: string;
    geminiCalls: number;
    newPapers: number;
    quotaExhausted: boolean;
  };
}

// ---------------------------------------------------------------------------
// Shared helpers

/** Old-style ids contain slashes ("quant-ph/0301123"); flatten for filenames. */
export function paperFileId(id: string): string {
  return id.replace(/\//g, "_");
}
