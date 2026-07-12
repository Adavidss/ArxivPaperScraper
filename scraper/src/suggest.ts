// Author discovery: mine the window's papers for people the user doesn't
// follow yet but keeps crossing paths with. Pure function of (papers,
// follows) — recomputed every run, so unfollowing/dismissing self-heals.
//
// Signals per paper an author appears on:
//   +3  co-authored with a followed author (the strongest "your circle" tie)
//   +2  appeared in a followed-keyword match
//   +1  appeared in a discovery-category pull
// Kept when score ≥ 3 or they show up on ≥ 2 papers.

import type { AuthorSuggestion, FollowsFile, PaperDetail } from "./types";

const MAX_SUGGESTIONS = 10;

const slugify = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function computeSuggestions(
  papers: PaperDetail[],
  follows: FollowsFile,
): AuthorSuggestion[] {
  const followedNames = new Set<string>();
  for (const a of follows.authors) {
    followedNames.add(a.name.toLowerCase());
    for (const alias of a.aliases) followedNames.add(alias.toLowerCase());
  }

  interface Agg {
    name: string;
    score: number;
    count: number;
    coAuthoredWith: Set<string>;
    viaKeywords: Set<string>;
    viaCategories: Set<string>;
    paperIds: string[];
    titles: Map<string, string>;
  }
  const byAuthor = new Map<string, Agg>();

  // Newest first so paperIds/titles collect the freshest evidence.
  const sorted = [...papers]
    .filter((p) => !p.withdrawn)
    .sort((a, b) => b.published.localeCompare(a.published));

  for (const paper of sorted) {
    const followedOnPaper = [
      ...new Set(
        paper.authors.flatMap((a) => (a.followedId ? [a.followedId] : [])),
      ),
    ];
    for (const author of paper.authors) {
      if (author.followedId) continue;
      if (followedNames.has(author.name.toLowerCase())) continue;
      const slug = slugify(author.name);
      if (!slug) continue;
      let agg = byAuthor.get(slug);
      if (!agg) {
        agg = {
          name: author.name,
          score: 0,
          count: 0,
          coAuthoredWith: new Set(),
          viaKeywords: new Set(),
          viaCategories: new Set(),
          paperIds: [],
          titles: new Map(),
        };
        byAuthor.set(slug, agg);
      }
      if (followedOnPaper.length) {
        agg.score += 3;
        for (const id of followedOnPaper) agg.coAuthoredWith.add(id);
      }
      if ((paper.matchedKeywords ?? []).length) {
        agg.score += 2;
        for (const kw of paper.matchedKeywords) agg.viaKeywords.add(kw);
      }
      if (paper.source === "foryou") {
        agg.score += 1;
        agg.viaCategories.add(paper.primaryCategory);
      }
      agg.count++;
      if (agg.paperIds.length < 3) {
        agg.paperIds.push(paper.id);
        if (agg.titles.size < 2) agg.titles.set(paper.id, paper.title);
      }
    }
  }

  return [...byAuthor.entries()]
    .filter(([, a]) => a.score >= 3 || a.count >= 2)
    .sort((a, b) => b[1].score - a[1].score || b[1].count - a[1].count)
    .slice(0, MAX_SUGGESTIONS)
    .map(([slug, a]) => ({
      name: a.name,
      slug,
      score: a.score,
      coAuthoredWith: [...a.coAuthoredWith],
      viaKeywords: [...a.viaKeywords],
      viaCategories: [...a.viaCategories],
      paperIds: a.paperIds,
      recentTitles: [...a.titles.values()],
      paperCount: a.count,
    }));
}
