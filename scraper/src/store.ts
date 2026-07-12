// Persistence layer over data/. All writes are whole-file JSON with 1-space
// indent (small diffs, small payloads). data/ is committed back to the repo
// so pipeline state (and paid-for LLM output) survives across runs.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type {
  AuthorSuggestion,
  FeedFile,
  FeedItem,
  FollowedAuthor,
  MetaFile,
  OverviewFile,
  PaperAuthor,
  PaperDetail,
  RunStatus,
  StateFile,
  SuggestionsFile,
} from "./types";
import { paperFileId } from "./types";

const readJson = <T>(path: string): T | null => {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
};

const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);

export function loadState(dataDir: string): StateFile {
  return (
    readJson<StateFile>(join(dataDir, "state.json")) ?? {
      processed: {},
      retryQueue: [],
      lastRun: { at: "", geminiCalls: 0, newPapers: 0, quotaExhausted: false },
    }
  );
}

export function loadPapers(dataDir: string): Map<string, PaperDetail> {
  const dir = join(dataDir, "papers");
  const map = new Map<string, PaperDetail>();
  if (!existsSync(dir)) return map;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const paper = readJson<PaperDetail>(join(dir, file));
    if (paper) map.set(paper.id, paper);
  }
  return map;
}

const lastName = (name: string): string =>
  name.trim().split(/\s+/).pop() ?? name;

/** "Walsworth, Chen +4" — followed authors shown first. */
export function authorsLine(authors: PaperAuthor[]): string {
  const ordered = [
    ...authors.filter((a) => a.followedId),
    ...authors.filter((a) => !a.followedId),
  ];
  const shown = ordered.slice(0, 2).map((a) => lastName(a.name));
  const extra = authors.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} +${extra}` : shown.join(", ");
}

/**
 * Re-tag every paper's authors against the CURRENT follow list, so follow
 * edits apply retroactively to papers already in the window.
 */
export function retagFollowedAuthors(
  papers: Map<string, PaperDetail>,
  follows: FollowedAuthor[],
): void {
  const byLastName = new Map<string, string>(); // lowercase last name -> follow id
  for (const f of follows) byLastName.set(lastName(f.name).toLowerCase(), f.id);
  for (const paper of papers.values()) {
    for (const author of paper.authors) {
      const id = byLastName.get(lastName(author.name).toLowerCase());
      if (id) author.followedId = id;
      else delete author.followedId;
    }
  }
}

const toFeedItem = (p: PaperDetail, firstSeen: string): FeedItem => ({
  id: p.id,
  title: p.title,
  hook: p.bite.hook,
  authorsLine: authorsLine(p.authors),
  followedIds: [...new Set(p.authors.flatMap((a) => (a.followedId ? [a.followedId] : [])))],
  matchedKeywords: p.matchedKeywords ?? [],
  figureUrl: p.figure?.url ?? null,
  firstSeen,
  primaryCategory: p.primaryCategory,
  published: p.published.slice(0, 10),
  difficulty: p.bite.difficulty,
  readSeconds: p.bite.readSeconds,
  source: p.source,
  biteStatus: p.biteStatus,
  withdrawn: p.withdrawn,
});

export interface WriteInput {
  dataDir: string;
  nowIso: string;
  windowDays: number;
  papers: Map<string, PaperDetail>;
  state: StateFile;
  /** Today's overview, if one was generated this run. */
  overview: OverviewFile | null;
  /** Author discovery, recomputed from the window every run. */
  suggestions: AuthorSuggestion[];
  runStatus: RunStatus;
}

/** Prune the window, rebuild feed.json + meta.json, write everything. */
export function writeAll(input: WriteInput): { feed: FeedFile; meta: MetaFile } {
  const { dataDir, nowIso, windowDays, papers, state, overview } = input;
  const papersDir = join(dataDir, "papers");
  const overviewsDir = join(dataDir, "overviews");
  mkdirSync(papersDir, { recursive: true });
  mkdirSync(overviewsDir, { recursive: true });

  const cutoff = new Date(Date.parse(nowIso) - windowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const retry = new Set(state.retryQueue);

  // Prune papers outside the window (retry-queued papers are kept so their
  // pending LLM upgrade isn't orphaned).
  for (const [id, paper] of [...papers]) {
    if (paper.published.slice(0, 10) < cutoff && !retry.has(id)) {
      papers.delete(id);
      delete state.processed[id];
      rmSync(join(papersDir, `${paperFileId(id)}.json`), { force: true });
    }
  }

  for (const paper of papers.values())
    writeJson(join(papersDir, `${paperFileId(paper.id)}.json`), paper);

  if (overview) writeJson(join(overviewsDir, `${overview.date}.json`), overview);
  for (const file of readdirSync(overviewsDir)) {
    if (file.endsWith(".json") && file.slice(0, 10) < cutoff)
      rmSync(join(overviewsDir, file), { force: true });
  }
  const overviewDates = readdirSync(overviewsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, 10))
    .sort()
    .reverse();

  const items = [...papers.values()]
    .map((p) =>
      toFeedItem(
        p,
        (state.processed[p.id]?.firstSeen ?? p.published).slice(0, 10),
      ),
    )
    .sort((a, b) =>
      a.published === b.published
        ? b.id.localeCompare(a.id)
        : b.published.localeCompare(a.published),
    );
  const feed: FeedFile = { generatedAt: nowIso, windowDays, items };
  writeJson(join(dataDir, "feed.json"), feed);

  writeJson(join(dataDir, "suggestions.json"), {
    generatedAt: nowIso,
    suggestions: input.suggestions,
  } satisfies SuggestionsFile);

  const meta: MetaFile = {
    schemaVersion: 1,
    lastUpdated: nowIso,
    buildId: nowIso.replace(/[-:]/g, "").slice(0, 15) + "Z",
    lastRunStatus: input.runStatus,
    paperCount: items.length,
    pendingBites: state.retryQueue.length,
    latestOverview: overviewDates[0] ?? null,
    overviewDates,
    windowDays,
  };
  writeJson(join(dataDir, "meta.json"), meta);
  writeJson(join(dataDir, "state.json"), state);
  return { feed, meta };
}
