// Gemini REST client (no SDK — one endpoint, one auth header).
// JSON mode with responseSchema; model fallback chain on quota exhaustion.

import { BITE_BATCH_SIZE, MODEL_CHAIN } from "./config";
import type {
  Bite,
  GlossaryEntry,
  KeyNumber,
  OverviewConnection,
  OverviewTheme,
  RawPaper,
} from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clampInt = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
};
const str = (s: unknown, max = 400): string =>
  String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// --- response schemas (Gemini's OpenAPI-subset Type vocabulary) -------------

const BITE_ITEM_SCHEMA = {
  type: "OBJECT",
  properties: {
    id: { type: "STRING" },
    hook: { type: "STRING", description: "≤120 chars, punchy, specific" },
    tldr: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
    whyItMatters: { type: "STRING" },
    eli5: { type: "STRING" },
    keyNumbers: {
      type: "ARRAY",
      maxItems: 4,
      items: {
        type: "OBJECT",
        properties: {
          value: { type: "STRING" },
          label: { type: "STRING" },
          context: { type: "STRING" },
        },
        required: ["value", "label", "context"],
      },
    },
    glossary: {
      type: "ARRAY",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          shortDef: { type: "STRING" },
          eli5Def: { type: "STRING" },
          wikiTitle: { type: "STRING", nullable: true },
        },
        required: ["term", "shortDef", "eli5Def", "wikiTitle"],
      },
    },
    difficulty: { type: "INTEGER" },
    readSeconds: { type: "INTEGER" },
  },
  required: [
    "id", "hook", "tldr", "whyItMatters", "eli5",
    "keyNumbers", "glossary", "difficulty", "readSeconds",
  ],
};

const BITES_SCHEMA = {
  type: "OBJECT",
  properties: { bites: { type: "ARRAY", items: BITE_ITEM_SCHEMA } },
  required: ["bites"],
};

const OVERVIEW_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING", description: "≤60 chars" },
    summary: { type: "STRING" },
    themes: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          body: { type: "STRING" },
          paperIds: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "body", "paperIds"],
      },
    },
    connections: {
      type: "ARRAY",
      maxItems: 3,
      items: {
        type: "OBJECT",
        properties: {
          body: { type: "STRING" },
          paperIds: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["body", "paperIds"],
      },
    },
  },
  required: ["headline", "summary", "themes", "connections"],
};

// --- prompts -----------------------------------------------------------------

const BITE_PROMPT = `You write "bites" for a research-feed app: bite-sized, faithful distillations of arXiv papers. The reader is sharp and scientifically literate but NOT an expert in this subfield, reading on a phone.

For EACH paper in the JSON below, return one bite with:
- id: copied exactly from the input.
- hook: ≤120 chars, punchy and specific — lead with the most striking concrete claim or number from the abstract. Never clickbait, never invent facts.
- tldr: exactly 3 bullets, each ≤160 chars: (1) what they did, (2) how they did it, (3) what they found.
- whyItMatters: 1–2 sentences of stakes — why a non-specialist should care.
- eli5: 2–3 sentences with a concrete analogy a smart 12-year-old would get.
- keyNumbers: 0–4 items {value, label, context} using ONLY numbers that appear in the title/abstract/comment. Empty array if none.
- glossary: the 3–6 hardest terms in the abstract {term, shortDef ≤120 chars, eli5Def ≤160 chars, wikiTitle = exact English Wikipedia article title, or null if no good article exists}.
- difficulty: 1 (general-audience) … 5 (deep specialist).
- readSeconds: honest 30–90s estimate to read the bite.

Never state results that are not in the abstract. Plain language beats hedging.

PAPERS:
`;

const OVERVIEW_PROMPT = `You write the daily front-page card for a personal research feed. Below are today's new papers (already distilled: hook + tldr; "followed": true means the reader follows one of its authors).

Return:
- headline: ≤60 chars capturing the day.
- summary: 2–3 sentences on what today's crop collectively says.
- themes: 2–4 {title, body ≤280 chars, paperIds} grouping the papers.
- connections: 0–3 {body ≤240 chars, paperIds} — ONLY genuine methodological or topical links between specific papers; an empty array beats forced connections.

Reference papers by their exact ids. If it's a one-paper day, say so plainly and go deeper on that paper.

PAPERS:
`;

// --- client ------------------------------------------------------------------

export class QuotaExhaustedError extends Error {
  constructor() {
    super("All Gemini models in the chain are quota-exhausted");
  }
}

export interface BiteInput {
  paper: RawPaper;
}

export class GeminiClient {
  calls = 0;
  private modelIndex = 0;
  /** Models that rejected thinkingConfig — retried without it. */
  private noThinkingConfig = new Set<string>();
  constructor(private apiKey: string) {}

  get model(): string {
    return MODEL_CHAIN[this.modelIndex];
  }

  /** One generateContent call; walks down the model chain on quota errors. */
  private async callJson(prompt: string, schema: object): Promise<unknown> {
    while (this.modelIndex < MODEL_CHAIN.length) {
      const model = MODEL_CHAIN[this.modelIndex];
      for (let attempt = 0; attempt < 4; attempt++) {
        // Current flash models "think" by default and thoughts consume
        // maxOutputTokens — ask for none; if a model rejects the knob (400),
        // drop it for that model and rely on the larger token budget.
        const sendThinking = !this.noThinkingConfig.has(model);
        let res: Response;
        try {
          this.calls++;
          res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
                responseSchema: schema,
                maxOutputTokens: 16384,
                ...(sendThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }),
          });
        } catch {
          await sleep(5000); // network blip — retry same model
          continue;
        }
        if (res.status === 429) break; // quota — next model in chain
        if (res.status === 400 && sendThinking) {
          // Probably the thinkingConfig knob — retry this model without it.
          this.noThinkingConfig.add(model);
          console.warn(`gemini: ${model} rejected thinkingConfig, retrying without`);
          continue;
        }
        if (res.status === 400 || res.status === 404) {
          // Unknown/retired model name — skip down the chain.
          console.warn(`gemini: ${model} rejected (${res.status}), trying next`);
          break;
        }
        if (!res.ok) {
          // 5xx / 503 "high demand" — transient; cron isn't latency-sensitive.
          console.warn(`gemini: ${model} HTTP ${res.status}, retry ${attempt + 1}`);
          await sleep(8000 * (attempt + 1));
          continue;
        }
        const body = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          }>;
        };
        // Thinking models may emit thought parts before the JSON — drop them.
        const text = body.candidates?.[0]?.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => p.text ?? "")
          .join("");
        if (!text) {
          await sleep(3000); // empty candidate (safety block etc.) — retry
          continue;
        }
        try {
          return JSON.parse(text);
        } catch {
          await sleep(3000); // malformed/clipped JSON — retry
          continue;
        }
      }
      this.modelIndex++;
      if (this.modelIndex < MODEL_CHAIN.length)
        console.warn(`gemini: falling back to ${this.model}`);
    }
    throw new QuotaExhaustedError();
  }

  /**
   * Generate bites for papers in batches. Returns whatever succeeded keyed by
   * paper id — callers give absent ids the extractive fallback. If the model
   * chain runs dry mid-run, already-generated bites are kept and
   * quotaExhausted is set instead of throwing.
   */
  async generateBites(
    papers: RawPaper[],
    nowIso: string,
  ): Promise<{ bites: Map<string, Bite>; quotaExhausted: boolean }> {
    const out = new Map<string, Bite>();
    for (let i = 0; i < papers.length; i += BITE_BATCH_SIZE) {
      const batch = papers.slice(i, i + BITE_BATCH_SIZE);
      const payload = batch.map((p) => ({
        id: p.id,
        title: p.title,
        authors: p.authorNames.slice(0, 6),
        categories: p.categories,
        abstract: p.abstract,
        comment: p.comment,
      }));
      let parsed: { bites?: Array<Record<string, unknown>> };
      try {
        parsed = (await this.callJson(
          BITE_PROMPT + JSON.stringify(payload, null, 1),
          BITES_SCHEMA,
        )) as { bites?: Array<Record<string, unknown>> };
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          console.warn(`gemini: chain exhausted at ${out.size}/${papers.length} bites`);
          return { bites: out, quotaExhausted: true };
        }
        throw err;
      }
      for (const b of parsed.bites ?? []) {
        const id = str(b.id, 60);
        if (!batch.some((p) => p.id === id)) continue;
        out.set(id, this.sanitizeBite(b, nowIso));
      }
      console.log(
        `gemini: bites ${Math.min(i + BITE_BATCH_SIZE, papers.length)}/${papers.length} (${this.model})`,
      );
    }
    return { bites: out, quotaExhausted: false };
  }

  private sanitizeBite(b: Record<string, unknown>, nowIso: string): Bite {
    const tldr = (Array.isArray(b.tldr) ? b.tldr : [])
      .map((s) => str(s, 200))
      .filter(Boolean)
      .slice(0, 3);
    const keyNumbers: KeyNumber[] = (Array.isArray(b.keyNumbers) ? b.keyNumbers : [])
      .slice(0, 4)
      .map((k: Record<string, unknown>) => ({
        value: str(k.value, 40),
        label: str(k.label, 60),
        context: str(k.context, 240),
      }))
      .filter((k) => k.value && k.label);
    const glossary: GlossaryEntry[] = (Array.isArray(b.glossary) ? b.glossary : [])
      .slice(0, 6)
      .map((g: Record<string, unknown>) => ({
        term: str(g.term, 60),
        shortDef: str(g.shortDef, 200),
        eli5Def: str(g.eli5Def, 240),
        wikiTitle: g.wikiTitle ? str(g.wikiTitle, 120) : null,
      }))
      .filter((g) => g.term && g.shortDef);
    return {
      model: this.model,
      generatedAt: nowIso,
      hook: str(b.hook, 140),
      tldr,
      whyItMatters: str(b.whyItMatters, 400),
      eli5: str(b.eli5, 500),
      keyNumbers,
      glossary,
      difficulty: clampInt(b.difficulty, 1, 5, 3),
      readSeconds: clampInt(b.readSeconds, 30, 90, 45),
    };
  }

  /** One call: the daily cross-paper overview. Returns null on any failure. */
  async generateOverview(
    inputs: Array<{ id: string; title: string; hook: string; tldr: string[]; followed: boolean }>,
  ): Promise<{
    headline: string;
    summary: string;
    themes: OverviewTheme[];
    connections: OverviewConnection[];
  } | null> {
    try {
      const parsed = (await this.callJson(
        OVERVIEW_PROMPT + JSON.stringify(inputs, null, 1),
        OVERVIEW_SCHEMA,
      )) as Record<string, unknown>;
      const validIds = new Set(inputs.map((i) => i.id));
      const cleanIds = (v: unknown): string[] =>
        (Array.isArray(v) ? v : []).map((x) => str(x, 60)).filter((x) => validIds.has(x));
      const themes: OverviewTheme[] = (Array.isArray(parsed.themes) ? parsed.themes : [])
        .slice(0, 4)
        .map((t: Record<string, unknown>) => ({
          title: str(t.title, 80),
          body: str(t.body, 400),
          paperIds: cleanIds(t.paperIds),
        }))
        .filter((t) => t.title && t.body);
      const connections: OverviewConnection[] = (
        Array.isArray(parsed.connections) ? parsed.connections : []
      )
        .slice(0, 3)
        .map((c: Record<string, unknown>) => ({
          body: str(c.body, 320),
          paperIds: cleanIds(c.paperIds),
        }))
        .filter((c) => c.body && c.paperIds.length >= 1);
      if (!themes.length) return null;
      return {
        headline: str(parsed.headline, 80),
        summary: str(parsed.summary, 500),
        themes,
        connections,
      };
    } catch (err) {
      if (err instanceof QuotaExhaustedError) throw err;
      console.warn("gemini: overview failed, skipping", err);
      return null;
    }
  }
}
