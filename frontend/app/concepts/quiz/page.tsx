"use client";

// Term quiz: definition shown, pick the right term from four. Terms come
// from your concept library topped up with glossary terms from enriched
// papers — playable from day one, counts toward the streak.

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildTermPool, fireConfetti, type GameTerm, shuffle } from "@/lib/games";
import { useMounted } from "@/lib/hooks";
import { computeStreak, getGames, getStreakData, recordQuizRun } from "@/lib/store";
import { Icons } from "@/components/ui/icons";

const ROUNDS = 6;
const OPTIONS = 4;

interface Question {
  target: GameTerm;
  options: GameTerm[];
}

function buildQuestions(pool: GameTerm[]): Question[] {
  const targets = shuffle(pool).slice(0, Math.min(ROUNDS, pool.length));
  return targets.map((target) => ({
    target,
    options: shuffle([
      target,
      ...shuffle(pool.filter((t) => t.slug !== target.slug)).slice(0, OPTIONS - 1),
    ]),
  }));
}

export default function QuizPage() {
  const mounted = useMounted();
  const [pool, setPool] = useState<GameTerm[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    void buildTermPool(OPTIONS).then((p) => {
      setPool(p);
      setQuestions(buildQuestions(p));
    });
  }, [mounted]);

  const restart = () => {
    if (!pool) return;
    setQuestions(buildQuestions(pool));
    setQIdx(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  const finish = (finalScore: number, total: number) => {
    const pct = Math.round((finalScore / total) * 100);
    recordQuizRun(pct);
    if (pct >= 50) void fireConfetti();
    setDone(true);
  };

  const pick = (slug: string) => {
    if (picked) return;
    const q = questions[qIdx];
    const correct = slug === q.target.slug;
    setPicked(slug);
    navigator.vibrate?.(correct ? 8 : 30);
    const nextScore = correct ? score + 1 : score;
    if (correct) {
      setScore(nextScore);
      setTimeout(() => {
        if (qIdx + 1 >= questions.length) finish(nextScore, questions.length);
        else {
          setQIdx((i) => i + 1);
          setPicked(null);
        }
      }, 700);
    }
    // Wrong answers wait for the explicit Next tap so the correction sinks in.
  };

  const next = () => {
    if (qIdx + 1 >= questions.length) finish(score, questions.length);
    else {
      setQIdx((i) => i + 1);
      setPicked(null);
    }
  };

  if (!mounted || pool === null) return <Full>{null}</Full>;

  if (pool.length < OPTIONS) {
    return (
      <Full>
        <Icons.Brain size={40} className="text-muted" />
        <h1 className="font-display text-2xl font-semibold">Not enough terms yet</h1>
        <p className="max-w-xs text-sm text-muted">
          The quiz needs {OPTIONS}+ terms. Tap underlined terms in papers and
          save them — or wait for tonight&apos;s enrichment to bring glossaries.
        </p>
        <Link href="/" className="mt-3 text-sm text-accent underline underline-offset-4">
          Go read something
        </Link>
      </Full>
    );
  }

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    const best = getGames().quizBestPct;
    return (
      <Full>
        <Icons.Sparkles size={40} className="text-accent" />
        <h1 className="font-display text-3xl font-semibold">
          {score}/{questions.length}
        </h1>
        <p className="text-sm text-muted">
          {pct >= 100 ? "Perfect run." : pct >= 50 ? "Solid." : "They'll stick next time."}{" "}
          Best: {best}%
        </p>
        <p className="flex items-center gap-1 text-xs text-gold">
          <Icons.Flame size={14} /> counts toward today — streak{" "}
          {computeStreak(getStreakData())}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={restart}
            className="rounded-xl bg-gradient-to-r from-accent to-accent-2 px-6 py-2.5 text-sm font-semibold text-canvas"
          >
            Play again
          </button>
          <Link
            href="/concepts"
            className="rounded-xl border border-border px-6 py-2.5 text-sm text-muted"
          >
            Done
          </Link>
        </div>
      </Full>
    );
  }

  const q = questions[qIdx];

  return (
    <main className="fixed inset-0 z-40 flex flex-col bg-canvas px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {questions.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${
                i < qIdx ? "bg-accent" : i === qIdx ? "bg-fg/60" : "bg-border"
              }`}
            />
          ))}
        </div>
        <Link href="/concepts" aria-label="Exit quiz" className="p-2 text-muted">
          <Icons.X size={20} />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
            Which term is this?
          </p>
          <p className="mt-2 text-[17px] leading-relaxed">{q.target.def}</p>
          {q.target.source === "paper" && (
            <p className="mt-1.5 text-[11px] text-muted">from a paper in your window</p>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          {q.options.map((opt) => {
            const isCorrect = opt.slug === q.target.slug;
            const state = !picked
              ? "idle"
              : isCorrect
                ? "correct"
                : picked === opt.slug
                  ? "wrong"
                  : "dim";
            return (
              <button
                key={opt.slug}
                type="button"
                onClick={() => pick(opt.slug)}
                disabled={Boolean(picked)}
                className={`rounded-xl border px-4 py-3.5 text-left font-mono text-[15px] transition ${
                  state === "correct"
                    ? "border-data bg-data/15 text-data"
                    : state === "wrong"
                      ? "animate-shake border-gold bg-gold/10 text-gold"
                      : state === "dim"
                        ? "border-border opacity-40"
                        : "border-border bg-surface active:border-accent"
                }`}
              >
                {opt.term}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex h-12 items-center justify-between">
        <p className="text-sm text-muted">
          {score} correct · {qIdx + 1}/{questions.length}
        </p>
        {picked && picked !== q.target.slug && (
          <button
            type="button"
            onClick={next}
            className="animate-fade-in rounded-xl bg-gradient-to-r from-accent to-accent-2 px-6 py-2.5 text-sm font-semibold text-canvas"
          >
            Next
          </button>
        )}
      </div>
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
