// Extractive (no-LLM) bite: keeps the site alive when Gemini quota runs out.
// Sentence-picking heuristic ported from the v12 prototype's
// generateFallbackSummary; papers carrying one of these are marked
// biteStatus:"fallback" and queued for an LLM retry on later runs.

import type { Bite, RawPaper } from "./types";

const IMPORTANCE =
  /\b(demonstrate|show|find|present|propose|develop|achieve|discover|reveal|introduce)\b/i;
const NOVELTY =
  /\b(novel|new|first|improve|significant|breakthrough|state[- ]of[- ]the[- ]art|outperform)\b/i;
const RESULTS =
  /\b(result|performance|accuracy|efficiency|measure|observe|obtain|reach)\b/i;

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [text]).map((s) => s.trim());
}

function trimTo(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}

export function extractiveBite(paper: RawPaper, nowIso: string): Bite {
  const sents = sentences(paper.abstract);
  const pick = (re: RegExp, used: Set<number>): string | null => {
    const i = sents.findIndex((s, idx) => !used.has(idx) && re.test(s));
    if (i === -1) return null;
    used.add(i);
    return sents[i];
  };

  const used = new Set<number>();
  const did = pick(IMPORTANCE, used) ?? sents[0] ?? paper.title;
  used.add(sents.indexOf(did));
  const how = pick(NOVELTY, used) ?? sents[1] ?? "";
  const found = pick(RESULTS, used) ?? sents[sents.length - 1] ?? "";

  const tldr = [did, how, found].map((s) => trimTo(s, 160));
  const words = tldr.join(" ").split(/\s+/).length;

  return {
    model: "extractive",
    generatedAt: nowIso,
    hook: trimTo(sents[0] ?? paper.title, 120),
    tldr,
    whyItMatters: "",
    eli5: "",
    keyNumbers: [],
    glossary: [],
    difficulty: 3,
    readSeconds: Math.max(30, Math.min(90, Math.round(words / 3) + 20)),
  };
}
