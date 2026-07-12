"use client";

// Match: pair each term with its definition against the clock. Six pairs,
// twelve tiles, best time saved — finishing counts toward the streak.

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildTermPool, fireConfetti, fmtMs, type GameTerm, shuffle } from "@/lib/games";
import { useMounted } from "@/lib/hooks";
import { computeStreak, getGames, getStreakData, recordMatchRun } from "@/lib/store";
import { Icons } from "@/components/ui/icons";

const MAX_PAIRS = 6;

interface Tile {
  slug: string;
  kind: "term" | "def";
  text: string;
}

const buildTiles = (pool: GameTerm[]): Tile[] => {
  const pairs = shuffle(pool).slice(0, Math.min(MAX_PAIRS, pool.length));
  return shuffle(
    pairs.flatMap((p): Tile[] => [
      { slug: p.slug, kind: "term", text: p.term },
      { slug: p.slug, kind: "def", text: p.def },
    ]),
  );
};

export default function MatchPage() {
  const mounted = useMounted();
  const [pool, setPool] = useState<GameTerm[] | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<[number, number] | null>(null);
  const [misses, setMisses] = useState(0);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [doneMs, setDoneMs] = useState<number | null>(null);

  useEffect(() => {
    if (!mounted) return;
    void buildTermPool(3).then((p) => {
      setPool(p);
      setTiles(buildTiles(p));
    });
  }, [mounted]);

  // Ticking clock while a run is live.
  useEffect(() => {
    if (startAt === null || doneMs !== null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startAt, doneMs]);

  const pairCount = Math.min(MAX_PAIRS, pool?.length ?? 0);

  const restart = () => {
    if (!pool) return;
    setTiles(buildTiles(pool));
    setSel(null);
    setMatched(new Set());
    setWrong(null);
    setMisses(0);
    setStartAt(null);
    setDoneMs(null);
  };

  const tap = (i: number) => {
    if (wrong || matched.has(tiles[i].slug) || doneMs !== null) return;
    if (startAt === null) setStartAt(Date.now());
    if (sel === i) {
      setSel(null);
      return;
    }
    if (sel === null) {
      setSel(i);
      return;
    }
    const a = tiles[sel];
    const b = tiles[i];
    if (a.slug === b.slug && a.kind !== b.kind) {
      const next = new Set(matched).add(a.slug);
      setMatched(next);
      setSel(null);
      navigator.vibrate?.(8);
      if (next.size === pairCount) {
        const ms = Date.now() - (startAt ?? Date.now());
        setDoneMs(ms);
        recordMatchRun(ms);
        void fireConfetti();
      }
    } else {
      setWrong([sel, i]);
      setMisses((m) => m + 1);
      navigator.vibrate?.(30);
      setTimeout(() => {
        setWrong(null);
        setSel(null);
      }, 550);
    }
  };

  if (!mounted || pool === null) return <Full>{null}</Full>;

  if (pool.length < 3) {
    return (
      <Full>
        <Icons.Brain size={40} className="text-muted" />
        <h1 className="font-display text-2xl font-semibold">Not enough terms yet</h1>
        <p className="max-w-xs text-sm text-muted">
          Match needs 3+ terms. Tap underlined terms in papers and save them to
          build your library.
        </p>
        <Link href="/" className="mt-3 text-sm text-accent underline underline-offset-4">
          Go read something
        </Link>
      </Full>
    );
  }

  if (doneMs !== null) {
    const best = getGames().matchBestMs;
    return (
      <Full>
        <Icons.Sparkles size={40} className="text-accent" />
        <h1 className="font-display text-3xl font-semibold">{fmtMs(doneMs)}</h1>
        <p className="text-sm text-muted">
          {pairCount} pairs · {misses} miss{misses === 1 ? "" : "es"} · best {fmtMs(best)}
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

  const elapsed = startAt ? (doneMs ?? Math.max(now, startAt)) - startAt : 0;

  return (
    <main className="fixed inset-0 z-40 flex flex-col bg-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm text-muted">
          {fmtMs(elapsed)} · {matched.size}/{pairCount}
        </p>
        <Link href="/concepts" aria-label="Exit match" className="p-2 text-muted">
          <Icons.X size={20} />
        </Link>
      </div>
      <p className="mb-3 text-[11px] uppercase tracking-widest text-muted">
        pair each term with its definition
      </p>

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-3 gap-2 overflow-y-auto pb-2">
        {tiles.map((tile, i) => {
          const isMatched = matched.has(tile.slug);
          const isSel = sel === i;
          const isWrong = wrong?.includes(i) ?? false;
          return (
            <button
              key={`${tile.slug}-${tile.kind}`}
              type="button"
              onClick={() => tap(i)}
              disabled={isMatched}
              className={`min-h-24 rounded-xl border p-2 text-center transition ${
                isMatched
                  ? "pointer-events-none border-data/30 bg-data/5 opacity-25"
                  : isWrong
                    ? "animate-shake border-gold bg-gold/10"
                    : isSel
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface"
              }`}
            >
              {tile.kind === "term" ? (
                <span className="font-mono text-[13px] font-semibold text-accent">
                  {tile.text}
                </span>
              ) : (
                <span className="text-[11px] leading-snug text-fg/85 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:5] overflow-hidden">
                  {tile.text}
                </span>
              )}
            </button>
          );
        })}
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
