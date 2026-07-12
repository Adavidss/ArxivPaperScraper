"use client";

// Single-term micro-game, launched straight from a highlighted term:
// study card → recognize the definition → use it in the paper's own
// sentence. Finishing saves the term to the library automatically.

import { useEffect, useState } from "react";
import {
  buildGameContext,
  buildTermDrill,
  fireConfetti,
  type Round,
} from "@/lib/games";
import type { GlossaryEntry, PaperDetail } from "@/lib/data-schema";
import { recordDrillRun, saveConcept } from "@/lib/store";
import { Icons } from "@/components/ui/icons";
import { RoundPlayer } from "./RoundPlayer";

export function TermDrill({
  entry,
  paper,
  onClose,
}: {
  entry: GlossaryEntry;
  paper: PaperDetail | null;
  onClose: () => void;
}) {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void buildGameContext().then((ctx) => {
      if (!cancelled) setRounds(buildTermDrill(entry, paper, ctx));
    });
    return () => {
      cancelled = true;
    };
  }, [entry, paper]);

  const finish = (score: number, total: number) => {
    recordDrillRun();
    saveConcept({
      term: entry.term,
      shortDef: entry.shortDef,
      eli5Def: entry.eli5Def,
      wikiTitle: entry.wikiTitle,
      paperId: paper?.id ?? "",
      paperHook: paper?.bite.hook,
    });
    if (total > 0 && score === total) void fireConfetti();
    setResult({ score, total });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Learning: <span className="font-mono text-accent">{entry.term}</span>
        </p>
        <button type="button" aria-label="Exit drill" onClick={onClose} className="p-2 text-muted">
          <Icons.X size={20} />
        </button>
      </div>

      {rounds === null && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-40 w-64 animate-pulse rounded-2xl bg-surface" />
        </div>
      )}

      {rounds !== null && !result && <RoundPlayer rounds={rounds} onDone={finish} />}

      {result && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Icons.Sparkles size={40} className="text-accent" />
          <h2 className="font-display text-2xl font-semibold">
            {result.total > 0 && result.score === result.total
              ? `"${entry.term}" — locked in`
              : `"${entry.term}" — getting there`}
          </h2>
          <p className="max-w-xs text-sm text-muted">
            Saved to your library — it&apos;ll come back as a flashcard
            tomorrow, then in the games.
          </p>
          <p className="flex items-center gap-1 text-xs text-gold">
            <Icons.Flame size={14} /> counts toward today&apos;s streak
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-6 py-2.5 text-sm font-semibold text-canvas"
          >
            Back to reading
          </button>
        </div>
      )}
    </div>
  );
}
