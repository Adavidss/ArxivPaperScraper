"use client";

// The per-paper game: 4–6 rounds generated from THIS paper's bite — its
// glossary, its TLDR with a term blanked out, its key numbers, and its
// finding hidden among other papers'. Launched from any enriched card.

import { useEffect, useState } from "react";
import {
  buildGameContext,
  buildPaperGame,
  fireConfetti,
  type Round,
} from "@/lib/games";
import type { PaperDetail } from "@/lib/data-schema";
import { conceptSlug, getConcepts, recordPaperRun, saveConcept } from "@/lib/store";
import { Icons } from "@/components/ui/icons";
import { RoundPlayer } from "./RoundPlayer";

export function PaperGame({
  detail,
  onClose,
}: {
  detail: PaperDetail;
  onClose: () => void;
}) {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [savedAll, setSavedAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void buildGameContext().then((ctx) => {
      if (!cancelled) setRounds(buildPaperGame(detail, ctx));
    });
    return () => {
      cancelled = true;
    };
  }, [detail, gameKey]);

  const unsavedTerms = detail.bite.glossary.filter(
    (g) => g.shortDef && !getConcepts()[conceptSlug(g.term)],
  );

  const finish = (score: number, total: number) => {
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    recordPaperRun(pct);
    if (pct >= 50) void fireConfetti();
    setResult({ score, total });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-muted">
          Playing: <span className="italic">{detail.bite.hook}</span>
        </p>
        <button type="button" aria-label="Exit game" onClick={onClose} className="p-2 text-muted">
          <Icons.X size={20} />
        </button>
      </div>

      {rounds === null && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-40 w-64 animate-pulse rounded-2xl bg-surface" />
        </div>
      )}

      {rounds !== null && rounds.length < 2 && !result && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Icons.Brain size={40} className="text-muted" />
          <p className="max-w-xs text-sm text-muted">
            Not enough material to build a game for this paper yet — it needs
            an AI summary with glossary terms.
          </p>
          <button type="button" onClick={onClose} className="text-sm text-accent underline underline-offset-4">
            Back
          </button>
        </div>
      )}

      {rounds !== null && rounds.length >= 2 && !result && (
        <RoundPlayer key={gameKey} rounds={rounds} onDone={finish} />
      )}

      {result && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Icons.Sparkles size={40} className="text-accent" />
          <h2 className="font-display text-4xl font-semibold">
            {result.score}/{result.total}
          </h2>
          <p className="max-w-xs text-sm text-muted">
            {result.score === result.total
              ? "You own this paper."
              : result.score >= result.total / 2
                ? "Solid grasp — one more run makes it stick."
                : "Tough one. Replay it — repetition is the game."}
          </p>
          <p className="flex items-center gap-1 text-xs text-gold">
            <Icons.Flame size={14} /> counts toward today&apos;s streak
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {unsavedTerms.length > 0 && !savedAll && (
              <button
                type="button"
                onClick={() => {
                  for (const g of unsavedTerms) {
                    saveConcept({
                      term: g.term,
                      shortDef: g.shortDef,
                      eli5Def: g.eli5Def,
                      wikiTitle: g.wikiTitle,
                      paperId: detail.id,
                      paperHook: detail.bite.hook,
                    });
                  }
                  setSavedAll(true);
                }}
                className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent"
              >
                Keep its {unsavedTerms.length} term{unsavedTerms.length === 1 ? "" : "s"} → library
              </button>
            )}
            {savedAll && (
              <p className="rounded-xl border border-data/40 bg-data/10 px-4 py-2.5 text-sm text-data">
                Terms in your library ✓
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setRounds(null);
                setGameKey((k) => k + 1);
              }}
              className="rounded-xl bg-gradient-to-r from-accent to-accent-2 px-5 py-2.5 text-sm font-semibold text-canvas"
            >
              Play again
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-5 py-2.5 text-sm text-muted"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
