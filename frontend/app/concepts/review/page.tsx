"use client";

// Review session: 5 cards max, ~90 seconds, self-graded. Fuzzy is never
// punished ("we'll bring it back tomorrow"), and finishing counts toward
// today's streak.

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type ConceptEntry,
  completeReviewSession,
  computeStreak,
  getDueConcepts,
  getStreakData,
  gradeConcept,
} from "@/lib/store";
import { Icons } from "@/components/ui/icons";

const SESSION_MAX = 5;

export default function ReviewPage() {
  // The queue is frozen at mount so grading doesn't reshuffle mid-session.
  const queue = useMemo<Array<[string, ConceptEntry]>>(
    () => getDueConcepts().slice(0, SESSION_MAX),
    [],
  );
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);

  const grade = (gotIt: boolean) => {
    const [slug] = queue[idx];
    gradeConcept(slug, gotIt);
    const next = [...results, gotIt];
    setResults(next);
    setFlipped(false);
    if (idx + 1 >= queue.length) {
      completeReviewSession();
      setDone(true);
    } else {
      setIdx(idx + 1);
    }
  };

  if (queue.length === 0) {
    return (
      <Full>
        <Icons.Check size={40} className="text-data" />
        <h1 className="font-display text-2xl font-semibold">All fresh</h1>
        <p className="text-sm text-muted">Nothing due right now — go read something.</p>
        <Link href="/concepts" className="mt-3 text-sm text-accent underline underline-offset-4">
          Back to Concepts
        </Link>
      </Full>
    );
  }

  if (done) {
    const stronger = results.filter(Boolean).length;
    const back = results.length - stronger;
    return (
      <Full>
        <Icons.Sparkles size={40} className="text-accent" />
        <h1 className="font-display text-2xl font-semibold">Session done</h1>
        <p className="text-sm text-muted">
          +{stronger} stronger{back > 0 ? ` · ${back} back in rotation` : ""}
        </p>
        <p className="flex items-center gap-1 text-xs text-gold">
          <Icons.Flame size={14} /> counts toward today — streak{" "}
          {computeStreak(getStreakData())}
        </p>
        <Link
          href="/concepts"
          className="mt-4 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-6 py-2.5 text-sm font-semibold text-canvas"
        >
          Done
        </Link>
      </Full>
    );
  }

  const [, concept] = queue[idx];

  return (
    <main className="fixed inset-0 z-40 flex flex-col bg-canvas px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {queue.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${
                i < idx ? "bg-accent" : i === idx ? "bg-fg/60" : "bg-border"
              }`}
            />
          ))}
        </div>
        <Link href="/concepts" aria-label="Exit review" className="p-2 text-muted">
          <Icons.X size={20} />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-4 [perspective:1200px]">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          className="relative h-full max-h-96 w-full max-w-sm [transform-style:preserve-3d] transition-transform duration-300"
          style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface px-6 text-center [backface-visibility:hidden]">
            <p className="font-mono text-3xl font-bold text-accent">{concept.term}</p>
            {concept.paperHook && (
              <p className="text-xs text-muted">
                seen in: <span className="italic">{concept.paperHook}</span>
              </p>
            )}
            <p className="text-[11px] uppercase tracking-widest text-muted">tap to flip</p>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-accent/40 bg-surface px-6 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="text-[15px] leading-relaxed">{concept.shortDef}</p>
            {concept.eli5Def && (
              <p className="text-sm leading-relaxed text-fg/75">{concept.eli5Def}</p>
            )}
          </div>
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => grade(false)}
          className="flex-1 rounded-xl border border-border px-4 py-3.5 font-medium text-muted transition hover:text-fg"
        >
          Fuzzy
        </button>
        <button
          type="button"
          onClick={() => grade(true)}
          className="flex-1 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-3.5 font-semibold text-canvas"
        >
          Got it
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">
        Fuzzy just brings it back tomorrow — no penalty.
      </p>
    </main>
  );
}

function Full({ children }: { children: React.ReactNode }) {
  return (
    <main className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-canvas px-8 text-center">
      {children}
    </main>
  );
}
