// Daily digest pipeline. Stages:
//   follows.json → arXiv author queries → dedupe vs state → For-You categories
//   → Gemini bites (capped, batched, model chain) → extractive fallback
//   → daily overview → prune window → write data/*.json.
// Exit 0 even on partial runs (fallback bites published, status "partial");
// nonzero only if something hard-fails before any output.

import {
  FORYOU_CATEGORY_COUNT,
  FORYOU_FETCH_PER_CATEGORY,
  FORYOU_MAX_AGE_DAYS,
  loadConfig,
} from "./config";
import {
  fetchAuthorPapers,
  fetchCategoryPapers,
  fetchFirstFigure,
  fetchKeywordPapers,
} from "./arxiv";
import { GeminiClient, QuotaExhaustedError } from "./gemini";
import { extractiveBite } from "./fallback";
import { loadPapers, loadState, retagFollowedAuthors, writeAll } from "./store";
import type {
  Bite,
  BiteStatus,
  Candidate,
  OverviewFile,
  PaperDetail,
  RawPaper,
  RunStatus,
} from "./types";

const isWithdrawn = (raw: RawPaper): boolean =>
  /withdraw/i.test(raw.comment ?? "") || /withdraw/i.test(raw.title);

const detailToRaw = (p: PaperDetail): RawPaper => ({
  id: p.id,
  version: p.version,
  title: p.title,
  authorNames: p.authors.map((a) => a.name),
  categories: p.categories,
  primaryCategory: p.primaryCategory,
  published: p.published,
  updated: p.updated,
  abstract: p.abstract,
  comment: p.comment,
  doi: p.doi,
});

async function main() {
  const cfg = loadConfig();
  const { authors, keywords, extraCategories, settings } = cfg.follows;
  console.log(
    `digest: ${cfg.nowIso} — ${authors.length} author(s), ${keywords.length} keyword(s), gemini key: ${cfg.geminiApiKey ? "present" : "MISSING (extractive fallback only)"}`,
  );

  const state = loadState(cfg.dataDir);
  const papers = loadPapers(cfg.dataDir);
  const lookbackCutoff = new Date(
    Date.now() - settings.lookbackDays * 86_400_000,
  ).toISOString();

  // --- 1. followed authors ---------------------------------------------------
  const candidates = new Map<string, Candidate>();
  for (const author of authors) {
    for (const alias of [author.name, ...author.aliases]) {
      try {
        const results = await fetchAuthorPapers(alias, settings.maxPerAuthor);
        let kept = 0;
        for (const raw of results) {
          if (raw.published < lookbackCutoff) continue;
          kept++;
          const existing = candidates.get(raw.id);
          if (existing) {
            if (!existing.followedIds.includes(author.id))
              existing.followedIds.push(author.id);
            if (raw.version > existing.raw.version) existing.raw = raw;
          } else {
            candidates.set(raw.id, {
              raw,
              followedIds: [author.id],
              matchedKeywords: [],
              source: "follow",
              kind: "new",
            });
          }
        }
        console.log(`arxiv: au:"${alias}" → ${results.length} results, ${kept} in lookback`);
      } catch (err) {
        console.warn(`arxiv: alias "${alias}" FAILED, skipping — ${(err as Error).message}`);
      }
    }
  }

  // --- 1b. followed keywords ---------------------------------------------------
  // Keyword papers are part of the daily drop (source "follow"), same as
  // author papers — these are topics the user explicitly follows.
  for (const keyword of keywords) {
    try {
      const results = await fetchKeywordPapers(keyword, settings.maxPerAuthor);
      let kept = 0;
      for (const raw of results) {
        if (raw.published < lookbackCutoff) continue;
        kept++;
        const existing = candidates.get(raw.id);
        if (existing) {
          if (!existing.matchedKeywords.includes(keyword))
            existing.matchedKeywords.push(keyword);
          if (raw.version > existing.raw.version) existing.raw = raw;
        } else {
          candidates.set(raw.id, {
            raw,
            followedIds: [],
            matchedKeywords: [keyword],
            source: "follow",
            kind: "new",
          });
        }
      }
      console.log(`arxiv: all:"${keyword}" → ${results.length} results, ${kept} in lookback`);
    } catch (err) {
      console.warn(`arxiv: keyword "${keyword}" FAILED, skipping — ${(err as Error).message}`);
    }
  }

  const newFollowed: Candidate[] = [];
  const versionBumps: Candidate[] = [];
  for (const c of candidates.values()) {
    const proc = state.processed[c.raw.id];
    if (!proc) newFollowed.push(c);
    else if (c.raw.version > proc.version) {
      c.kind = "version-bump";
      versionBumps.push(c);
    }
  }

  // --- 2. For-You category pool ----------------------------------------------
  // Discovery draws ONLY from categories the user explicitly configured —
  // nothing is inferred from their papers. No categories = no For-You.
  const cats = [...new Set(extraCategories)].slice(0, FORYOU_CATEGORY_COUNT);
  const forYouCutoff = new Date(
    Date.now() - FORYOU_MAX_AGE_DAYS * 86_400_000,
  ).toISOString();

  // The cap is per DAY, not per run — manual "Refresh now" dispatches must not
  // stack another batch of discovery papers onto today's drop.
  const forYouSeenToday = [...papers.values()].filter(
    (p) => p.source === "foryou" && state.processed[p.id]?.firstSeen === cfg.today,
  ).length;
  const forYouBudget = Math.max(0, settings.forYouPerDay - forYouSeenToday);

  const byCat: RawPaper[][] = [];
  for (const cat of forYouBudget > 0 ? cats : []) {
    try {
      const results = await fetchCategoryPapers(cat, FORYOU_FETCH_PER_CATEGORY);
      byCat.push(
        results.filter(
          (r) =>
            r.published >= forYouCutoff &&
            !candidates.has(r.id) &&
            !state.processed[r.id] &&
            !papers.has(r.id),
        ),
      );
    } catch (err) {
      console.warn(`arxiv: cat:${cat} FAILED, skipping — ${(err as Error).message}`);
    }
  }
  const forYou: Candidate[] = [];
  const seenForYou = new Set<string>();
  outer: for (let i = 0; ; i++) {
    let any = false;
    for (const list of byCat) {
      if (i >= list.length) continue;
      any = true;
      const raw = list[i];
      if (seenForYou.has(raw.id)) continue;
      seenForYou.add(raw.id);
      forYou.push({
        raw,
        followedIds: [],
        matchedKeywords: [],
        source: "foryou",
        kind: "new",
      });
      if (forYou.length >= forYouBudget) break outer;
    }
    if (!any) break;
  }

  // --- 3. retry queue (fallback bites awaiting an LLM upgrade) ----------------
  // Skip only ids already headed into this run's work as new/bump — merely
  // being re-fetched as a known candidate must NOT block the retry, or
  // followed papers would stay on fallback bites forever.
  const workBound = new Set(
    [...newFollowed, ...versionBumps].map((c) => c.raw.id),
  );
  const retries: Candidate[] = [];
  for (const id of state.retryQueue) {
    if (workBound.has(id)) continue;
    const p = papers.get(id);
    if (!p || p.withdrawn) continue;
    retries.push({
      raw: detailToRaw(p),
      followedIds: [],
      matchedKeywords: p.matchedKeywords ?? [],
      source: p.source,
      kind: "retry",
    });
  }

  // --- 4. work list, capped ----------------------------------------------------
  const workAll = [...newFollowed, ...versionBumps, ...forYou, ...retries].filter(
    (c) => !isWithdrawn(c.raw),
  );
  const work = workAll.slice(0, cfg.maxNewBites);
  const overflow = workAll.slice(cfg.maxNewBites);
  console.log(
    `digest: work=${work.length} (new=${newFollowed.length} bumps=${versionBumps.length} foryou=${forYou.length} retry=${retries.length}) overflow=${overflow.length}`,
  );

  // --- 5. generate ---------------------------------------------------------------
  let bites = new Map<string, Bite>();
  let quotaExhausted = false;
  let client: GeminiClient | null = null;
  if (cfg.geminiApiKey && work.length) {
    client = new GeminiClient(cfg.geminiApiKey);
    ({ bites, quotaExhausted } = await client.generateBites(
      work.map((w) => w.raw),
      cfg.nowIso,
    ));
  }

  // --- 6. apply results ------------------------------------------------------------
  const retrySet = new Set(state.retryQueue);
  let fallbacksThisRun = 0;

  const makeDetail = (
    c: Candidate,
    bite: Bite,
    biteStatus: BiteStatus,
    withdrawn: boolean,
  ): PaperDetail => ({
    id: c.raw.id,
    version: c.raw.version,
    title: c.raw.title,
    authors: c.raw.authorNames.map((name) => ({ name })), // retagged before write
    categories: c.raw.categories,
    primaryCategory: c.raw.primaryCategory,
    published: c.raw.published,
    updated: c.raw.updated,
    abstract: c.raw.abstract,
    comment: c.raw.comment,
    doi: c.raw.doi,
    links: {
      abs: `https://arxiv.org/abs/${c.raw.id}`,
      pdf: `https://arxiv.org/pdf/${c.raw.id}`,
      html: `https://arxiv.org/html/${c.raw.id}`,
    },
    source: c.source,
    matchedKeywords: c.matchedKeywords,
    // Preserve an already-fetched figure across retries/version bumps.
    figure: papers.get(c.raw.id)?.figure,
    withdrawn,
    biteStatus,
    bite,
  });

  const record = (c: Candidate, bite: Bite, status: BiteStatus) => {
    const id = c.raw.id;
    const prev = state.processed[id];
    papers.set(id, makeDetail(c, bite, status, false));
    state.processed[id] = {
      version: c.raw.version,
      summarizedVersion:
        status === "ok" ? c.raw.version : prev?.summarizedVersion ?? 0,
      firstSeen: prev?.firstSeen ?? cfg.today,
    };
    if (status === "ok") retrySet.delete(id);
    else {
      retrySet.add(id);
      fallbacksThisRun++;
    }
  };

  for (const c of work) {
    const got = bites.get(c.raw.id);
    const stored = papers.get(c.raw.id);
    if (got) record(c, got, "ok");
    else if (c.kind === "version-bump" && stored?.biteStatus === "ok") {
      // Keep the v(n-1) bite rather than downgrading to extractive.
      record(c, stored.bite, "ok");
    } else {
      record(c, stored?.bite ?? extractiveBite(c.raw, cfg.nowIso), "fallback");
    }
  }
  for (const c of overflow) {
    if (c.kind === "retry") continue; // already published with fallback; stays queued
    record(c, extractiveBite(c.raw, cfg.nowIso), "fallback");
  }

  // Withdrawn papers become tombstones and never re-enter the queue.
  for (const c of candidates.values()) {
    if (!isWithdrawn(c.raw)) continue;
    const stored = papers.get(c.raw.id);
    papers.set(
      c.raw.id,
      makeDetail(c, stored?.bite ?? extractiveBite(c.raw, cfg.nowIso), stored?.biteStatus ?? "fallback", true),
    );
    state.processed[c.raw.id] = {
      version: c.raw.version,
      summarizedVersion: c.raw.version,
      firstSeen: state.processed[c.raw.id]?.firstSeen ?? cfg.today,
    };
    retrySet.delete(c.raw.id);
  }

  // --- 6b. first-figure extraction (the cards' visual layer) -----------------------
  // Politely fetch each unchecked paper's HTML render for its first figure;
  // capped per run so backfills spread across days. figure === undefined
  // means "never checked", null means "checked, none".
  const FIGURES_PER_RUN = 25;
  const needFigure = [...papers.values()]
    .filter((p) => p.figure === undefined && !p.withdrawn)
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, FIGURES_PER_RUN);
  for (const p of needFigure) {
    const url = await fetchFirstFigure(p.id);
    p.figure = url ? { url } : null;
  }
  if (needFigure.length) {
    const found = needFigure.filter((p) => p.figure).length;
    console.log(`figures: checked ${needFigure.length}, found ${found}`);
  }

  // --- 7. daily overview ----------------------------------------------------------
  const todayPapers = [...work, ...overflow]
    .filter((c) => c.kind === "new")
    .map((c) => papers.get(c.raw.id))
    .filter((p): p is PaperDetail => Boolean(p) && !p!.withdrawn);
  const followedToday = todayPapers.filter((p) => p.source === "follow").length;

  let overview: OverviewFile | null = null;
  if (client && !quotaExhausted && (followedToday >= 1 || todayPapers.length >= 2)) {
    const inputs = todayPapers.slice(0, 12).map((p) => ({
      id: p.id,
      title: p.title,
      hook: p.bite.hook,
      tldr: p.bite.tldr,
      followed: p.source === "follow",
    }));
    try {
      const core = await client.generateOverview(inputs);
      if (core)
        overview = {
          date: cfg.today,
          generatedAt: cfg.nowIso,
          model: client.model,
          ...core,
          paperIds: inputs.map((i) => i.id),
        };
    } catch (err) {
      if (err instanceof QuotaExhaustedError) quotaExhausted = true;
      else throw err;
    }
  }

  // --- 8. write --------------------------------------------------------------------
  retagFollowedAuthors(papers, authors);
  // Keywords can newly match papers that were already summarized — merge the
  // tags onto the stored copies (removal keeps historical tags, harmless).
  for (const c of candidates.values()) {
    if (!c.matchedKeywords.length) continue;
    const stored = papers.get(c.raw.id);
    if (!stored) continue;
    stored.matchedKeywords = [
      ...new Set([...(stored.matchedKeywords ?? []), ...c.matchedKeywords]),
    ];
  }
  state.retryQueue = [...retrySet].filter((id) => papers.has(id));
  state.lastRun = {
    at: cfg.nowIso,
    geminiCalls: client?.calls ?? 0,
    newPapers: todayPapers.length,
    quotaExhausted,
  };
  const runStatus: RunStatus =
    quotaExhausted || fallbacksThisRun > 0 ? "partial" : "ok";
  const { feed, meta } = writeAll({
    dataDir: cfg.dataDir,
    nowIso: cfg.nowIso,
    windowDays: settings.windowDays,
    papers,
    state,
    overview,
    runStatus,
  });
  console.log(
    `digest: done — ${feed.items.length} papers in feed, ${meta.pendingBites} pending bites, status=${meta.lastRunStatus}, gemini calls=${client?.calls ?? 0}${overview ? ", overview written" : ""}`,
  );
}

main().catch((err) => {
  console.error("digest: FATAL", err);
  process.exit(1);
});
