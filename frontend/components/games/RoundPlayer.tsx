"use client";

// Generic round engine shared by the per-paper game and the term drill:
// study cards (read → continue) and choice rounds (instant feedback, wrong
// answers reveal the correction and wait for an explicit Next).

import { useState } from "react";
import type { Round } from "@/lib/games";

export function RoundPlayer({
  rounds,
  onDone,
}: {
  rounds: Round[];
  /** Called once after the last round: correct picks / answerable rounds. */
  onDone: (score: number, answerable: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const answerable = rounds.filter((r) => r.kind === "choice").length;
  const round = rounds[idx];

  const advance = (nextScore: number) => {
    if (idx + 1 >= rounds.length) onDone(nextScore, answerable);
    else {
      setIdx(idx + 1);
      setPicked(null);
    }
  };

  const pick = (option: string) => {
    if (picked || round.kind !== "choice") return;
    setPicked(option);
    const correct = option === round.answer;
    navigator.vibrate?.(correct ? 8 : 30);
    if (correct) {
      const next = score + 1;
      setScore(next);
      setTimeout(() => advance(next), 700);
    }
  };

  if (!round) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Progress dots */}
      <div className="flex gap-1.5">
        {rounds.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-6 rounded-full ${
              i < idx ? "bg-accent" : i === idx ? "bg-fg/60" : "bg-border"
            }`}
          />
        ))}
      </div>

      {round.kind === "study" ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
            Study it first
          </p>
          <p className="font-mono text-3xl font-bold text-accent">{round.term}</p>
          <p className="text-[16px] leading-relaxed">{round.def}</p>
          {round.eli5 && (
            <p className="text-[14px] leading-relaxed text-fg/75">{round.eli5}</p>
          )}
          <button
            type="button"
            onClick={() => advance(score)}
            className="mt-2 self-start rounded-xl bg-gradient-to-r from-accent to-accent-2 px-6 py-2.5 text-sm font-semibold text-canvas"
          >
            Got it — quiz me
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-5 overflow-y-auto py-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
              {round.label}
            </p>
            <p className="mt-2 text-[16px] leading-relaxed">{round.prompt}</p>
          </div>
          <div className="flex flex-col gap-2.5">
            {round.options.map((opt) => {
              const isAnswer = opt === round.answer;
              const state = !picked
                ? "idle"
                : isAnswer
                  ? "correct"
                  : picked === opt
                    ? "wrong"
                    : "dim";
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => pick(opt)}
                  disabled={Boolean(picked)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    round.optionStyle === "term"
                      ? "font-mono text-[15px]"
                      : "text-[13px] leading-snug"
                  } ${
                    state === "correct"
                      ? "border-data bg-data/15 text-data"
                      : state === "wrong"
                        ? "animate-shake border-gold bg-gold/10 text-gold"
                        : state === "dim"
                          ? "border-border opacity-40"
                          : "border-border bg-surface-2 active:border-accent"
                  }`}
                >
                  {round.optionStyle === "text" ? (
                    <span className="[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] overflow-hidden">
                      {opt}
                    </span>
                  ) : (
                    opt
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex h-11 items-center justify-between">
            <p className="text-sm text-muted">
              {score} correct · {idx + 1}/{rounds.length}
            </p>
            {picked && picked !== round.answer && (
              <button
                type="button"
                onClick={() => advance(score)}
                className="animate-fade-in rounded-xl bg-gradient-to-r from-accent to-accent-2 px-6 py-2 text-sm font-semibold text-canvas"
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
