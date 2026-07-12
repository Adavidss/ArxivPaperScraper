// Game engine data layer. Terms/bullets come from a chosen SOURCE:
//   "library" (default when you've saved enough concepts) — your own glossary
//   "feed"    — glossary terms + findings from enriched papers in the window
// Round builders turn a paper's bite into a per-paper game: term recognition,
// fill-the-blank from its own TLDR, key-number recall, spot-its-finding.

import { loadFeed, loadPaper } from "./api";
import type { GlossaryEntry, PaperDetail } from "./data-schema";
import { conceptSlug, getConcepts, getSettings } from "./store";

export interface GameTerm {
  slug: string;
  term: string;
  def: string;
  eli5?: string;
  source: "library" | "paper";
}

export interface GameContext {
  terms: GameTerm[];
  /** One representative finding per enriched paper (for decoy findings). */
  bullets: Array<{ text: string; paperId: string }>;
  source: "library" | "feed";
}

export type Round =
  | { kind: "study"; term: string; def: string; eli5?: string }
  | {
      kind: "choice";
      label: string;
      prompt: string;
      options: string[];
      answer: string;
      /** "term" renders mono chips, "text" renders clamped sentences. */
      optionStyle: "term" | "text";
    };

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type GameSource = "library" | "feed";

/** User setting, defaulting to library once it has enough to play with. */
export function resolveGameSource(): GameSource {
  const pref = getSettings().gameSource as GameSource | undefined;
  if (pref === "library" || pref === "feed") return pref;
  return Object.keys(getConcepts()).length >= 4 ? "library" : "feed";
}

const libraryTerms = (): GameTerm[] =>
  Object.entries(getConcepts())
    .filter(([, c]) => c.shortDef && c.shortDef !== c.term)
    .map(([slug, c]) => ({
      slug,
      term: c.term,
      def: c.shortDef,
      eli5: c.eli5Def || undefined,
      source: "library" as const,
    }));

/** Terms + findings pulled from enriched papers in the current window. */
async function feedContext(cap = 40): Promise<Omit<GameContext, "source">> {
  const terms = new Map<string, GameTerm>();
  const bullets: GameContext["bullets"] = [];
  try {
    const feed = await loadFeed();
    const enriched = feed.items
      .filter((i) => i.biteStatus === "ok" && !i.withdrawn)
      .slice(0, 14);
    const details = await Promise.allSettled(enriched.map((i) => loadPaper(i.id)));
    for (const d of details) {
      if (d.status !== "fulfilled") continue;
      if (d.value.bite.tldr[0])
        bullets.push({ text: d.value.bite.tldr[0], paperId: d.value.id });
      for (const g of d.value.bite.glossary) {
        const slug = conceptSlug(g.term);
        if (terms.has(slug) || !g.shortDef || terms.size >= cap) continue;
        terms.set(slug, {
          slug,
          term: g.term,
          def: g.shortDef,
          eli5: g.eli5Def || undefined,
          source: "paper",
        });
      }
    }
  } catch {
    /* offline / no enrichment */
  }
  return { terms: [...terms.values()], bullets };
}

/**
 * Build the play context for the chosen source. The library source still
 * borrows feed bullets (finding-decoys) and tops up terms when the library
 * alone can't fill a 4-option question.
 */
export async function buildGameContext(source = resolveGameSource()): Promise<GameContext> {
  const fromFeed = await feedContext();
  if (source === "feed") {
    return { terms: shuffle(fromFeed.terms), bullets: fromFeed.bullets, source };
  }
  const lib = libraryTerms();
  const slugs = new Set(lib.map((t) => t.slug));
  const padded =
    lib.length >= 8
      ? lib
      : [...lib, ...fromFeed.terms.filter((t) => !slugs.has(t.slug)).slice(0, 8 - lib.length)];
  return { terms: shuffle(padded), bullets: fromFeed.bullets, source };
}

/** Back-compat pool for the quiz/match pages. */
export async function buildTermPool(min = 8): Promise<GameTerm[]> {
  const ctx = await buildGameContext();
  if (ctx.terms.length >= min || ctx.source === "feed") return ctx.terms;
  // Library too small even after padding — fall back to the feed pool.
  return (await buildGameContext("feed")).terms;
}

// --- round builders ------------------------------------------------------------

const containsWord = (line: string, term: string): boolean =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line);

const distractorTerms = (answer: string, pool: GameTerm[], extra: string[] = []): string[] =>
  shuffle([
    ...pool.map((t) => t.term).filter((t) => t.toLowerCase() !== answer.toLowerCase()),
    ...extra.filter((t) => t.toLowerCase() !== answer.toLowerCase()),
  ]).slice(0, 3);

function termRound(g: { term: string; shortDef?: string; def?: string }, pool: GameTerm[], extra: string[]): Round | null {
  const def = ("shortDef" in g && g.shortDef) || ("def" in g && g.def) || "";
  const distractors = distractorTerms(g.term, pool, extra);
  if (!def || distractors.length < 3) return null;
  return {
    kind: "choice",
    label: "Which term is this?",
    prompt: def,
    options: shuffle([g.term, ...distractors]),
    answer: g.term,
    optionStyle: "term",
  };
}

function blankRound(line: string, term: string, pool: GameTerm[], extra: string[]): Round | null {
  const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (!re.test(line)) return null;
  const distractors = distractorTerms(term, pool, extra);
  if (distractors.length < 3) return null;
  return {
    kind: "choice",
    label: "Fill the blank",
    prompt: line.replace(re, "_____"),
    options: shuffle([term, ...distractors]),
    answer: term,
    optionStyle: "term",
  };
}

/** Decoy values scaled off the real one ("10x" → "2x", "5x", "100x"). */
function decoyValues(value: string): string[] | null {
  const m = value.match(/^(~?)([\d.]+)\s*(.*)$/);
  if (!m) return null;
  const n = parseFloat(m[2]);
  if (!Number.isFinite(n) || n === 0) return null;
  const fmt = (x: number) =>
    `${m[1]}${Number.isInteger(x) && x < 1e6 ? x : x.toPrecision(2)}${m[3] ? `${value.includes(" ") ? " " : ""}${m[3]}` : ""}`;
  const decoys = [...new Set([n / 2, n * 2, n * 10, n / 10].map(fmt))].filter(
    (v) => v !== value,
  );
  return decoys.length >= 3 ? decoys.slice(0, 3) : null;
}

function numberRound(kn: { value: string; label: string; context: string }): Round | null {
  const decoys = decoyValues(kn.value);
  if (!decoys) return null;
  return {
    kind: "choice",
    label: "What was the number?",
    prompt: kn.context || kn.label,
    options: shuffle([kn.value, ...decoys]),
    answer: kn.value,
    optionStyle: "term",
  };
}

function findingRound(detail: PaperDetail, others: GameContext["bullets"]): Round | null {
  const answer = detail.bite.tldr[Math.floor(Math.random() * detail.bite.tldr.length)];
  const decoys = shuffle(others).slice(0, 3).map((b) => b.text);
  if (!answer || decoys.length < 3) return null;
  return {
    kind: "choice",
    label: "Which one is THIS paper's finding?",
    prompt: detail.bite.hook,
    options: shuffle([answer, ...decoys]),
    answer,
    optionStyle: "text",
  };
}

/** The per-paper game: 4–6 rounds built entirely from the paper's own bite. */
export function buildPaperGame(detail: PaperDetail, ctx: GameContext): Round[] {
  const rounds: Round[] = [];
  const gl = detail.bite.glossary.filter((g) => g.shortDef);
  const siblingTerms = gl.map((g) => g.term);

  for (const g of gl.slice(0, 3)) {
    const r = termRound(g, ctx.terms, siblingTerms);
    if (r) rounds.push(r);
  }
  let blanks = 0;
  for (const line of detail.bite.tldr) {
    if (blanks >= 2) break;
    const g = gl.find((x) => containsWord(line, x.term));
    if (!g) continue;
    const r = blankRound(line, g.term, ctx.terms, siblingTerms);
    if (r) {
      rounds.push(r);
      blanks++;
    }
  }
  const kn = detail.bite.keyNumbers.find((k) => decoyValues(k.value));
  if (kn) {
    const r = numberRound(kn);
    if (r) rounds.push(r);
  }
  const others = ctx.bullets.filter((b) => b.paperId !== detail.id);
  const f = findingRound(detail, others);
  if (f) rounds.push(f);

  return shuffle(rounds).slice(0, 6);
}

/** Micro-drill for ONE term: study card → recognize it → use it in context. */
export function buildTermDrill(
  entry: GlossaryEntry,
  paper: PaperDetail | null,
  ctx: GameContext,
): Round[] {
  const rounds: Round[] = [
    { kind: "study", term: entry.term, def: entry.shortDef, eli5: entry.eli5Def || undefined },
  ];
  const siblings = paper?.bite.glossary.map((g) => g.term) ?? [];
  const t = termRound({ term: entry.term, def: entry.shortDef }, ctx.terms, siblings);
  if (t) rounds.push(t);
  const line = paper?.bite.tldr.find((l) => containsWord(l, entry.term));
  if (line) {
    const b = blankRound(line, entry.term, ctx.terms, siblings);
    if (b) rounds.push(b);
  }
  return rounds;
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
