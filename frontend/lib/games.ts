// Term pool for the learning games. Saved concepts come first (that's the
// personal library), topped up with glossary terms from enriched papers in
// the current window so the games are playable from day one.

import { loadFeed, loadPaper } from "./api";
import { conceptSlug, getConcepts } from "./store";

export interface GameTerm {
  slug: string;
  term: string;
  def: string;
  eli5?: string;
  source: "library" | "paper";
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a pool of at least `min` terms when possible. Library terms are
 * always included; paper glossaries fill the rest (up to `cap`).
 */
export async function buildTermPool(min = 8, cap = 40): Promise<GameTerm[]> {
  const pool = new Map<string, GameTerm>();
  for (const [slug, c] of Object.entries(getConcepts())) {
    if (c.shortDef && c.shortDef !== c.term)
      pool.set(slug, {
        slug,
        term: c.term,
        def: c.shortDef,
        eli5: c.eli5Def || undefined,
        source: "library",
      });
  }

  if (pool.size < min) {
    try {
      const feed = await loadFeed();
      const enriched = feed.items
        .filter((i) => i.biteStatus === "ok" && !i.withdrawn)
        .slice(0, 12);
      const details = await Promise.allSettled(enriched.map((i) => loadPaper(i.id)));
      for (const d of details) {
        if (d.status !== "fulfilled") continue;
        for (const g of d.value.bite.glossary) {
          const slug = conceptSlug(g.term);
          if (pool.has(slug) || !g.shortDef) continue;
          pool.set(slug, {
            slug,
            term: g.term,
            def: g.shortDef,
            eli5: g.eli5Def || undefined,
            source: "paper",
          });
          if (pool.size >= cap) break;
        }
        if (pool.size >= cap) break;
      }
    } catch {
      /* offline / no enrichment — play with what the library has */
    }
  }

  return shuffle([...pool.values()]);
}

export const fmtMs = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Celebration burst; a no-op under reduced motion. */
export async function fireConfetti(): Promise<void> {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
}
