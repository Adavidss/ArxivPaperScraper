"use client";

// Stats: streak hero, 14-day calendar, weekly bars, lifetime tiles, top
// authors/categories. All numbers only count up; no red, no comparisons.

import { useMemo } from "react";
import { useDrop, useStoreVersion } from "@/lib/hooks";
import {
  computeStreak,
  getConcepts,
  getReadMap,
  getSavedMap,
  getStats,
  getStreakData,
  todayStr,
} from "@/lib/store";
import { Icons } from "@/components/ui/icons";
import { PageShell } from "@/components/ui/PageShell";

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export default function StatsPage() {
  useStoreVersion();
  const drop = useDrop();

  const streakData = getStreakData();
  const streak = computeStreak(streakData);
  const readMap = getReadMap();
  const concepts = Object.values(getConcepts());
  const stats = getStats();

  const { calendar, weekBars, readTotal, topAuthors, topCats, weekCount } =
    useMemo(() => {
      const reads = Object.entries(readMap);
      const byDay = new Map<string, number>();
      for (const [, e] of reads) {
        const k = dayKey(new Date(e.at));
        byDay.set(k, (byDay.get(k) ?? 0) + 1);
      }

      const cal: Array<{ day: string; state: string }> = [];
      const d = new Date();
      for (let i = 13; i >= 0; i--) {
        const dd = new Date(d);
        dd.setDate(d.getDate() - i);
        const k = dayKey(dd);
        const dow = dd.getDay();
        cal.push({
          day: k,
          state: streakData.days[k]
            ? "active"
            : streakData.frozen[k]
              ? "frozen"
              : dow === 0 || dow === 6
                ? "bridge"
                : "empty",
        });
      }

      const bars: Array<{ label: string; count: number; today: boolean }> = [];
      for (let i = 6; i >= 0; i--) {
        const dd = new Date(d);
        dd.setDate(d.getDate() - i);
        bars.push({
          label: dd.toLocaleDateString(undefined, { weekday: "narrow" }),
          count: byDay.get(dayKey(dd)) ?? 0,
          today: i === 0,
        });
      }
      const weekCount = bars.reduce((s, b) => s + b.count, 0);

      const authors = new Map<string, number>();
      const cats = new Map<string, number>();
      for (const item of drop.feed?.items ?? []) {
        if (!readMap[item.id]) continue;
        cats.set(item.primaryCategory, (cats.get(item.primaryCategory) ?? 0) + 1);
        for (const name of item.authorsLine.replace(/\s\+\d+$/, "").split(", "))
          authors.set(name, (authors.get(name) ?? 0) + 1);
      }
      const top = (m: Map<string, number>) =>
        [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);

      return {
        calendar: cal,
        weekBars: bars,
        readTotal: reads.length,
        topAuthors: top(authors),
        topCats: top(cats),
        weekCount,
      };
    }, [readMap, streakData, drop.feed]);

  const maxBar = Math.max(1, ...weekBars.map((b) => b.count));
  const estMinutes = Math.round((readTotal * 45) / 60);

  return (
    <PageShell title="Stats">
      {/* Streak hero */}
      <section className="rounded-2xl border border-gold/30 bg-surface p-5 text-center">
        <p className="flex items-center justify-center gap-2 font-mono text-5xl font-bold text-gold">
          <Icons.Flame size={40} /> {streak}
        </p>
        <p className="mt-1 text-sm text-muted">
          day streak · best {Math.max(streakData.best, streak)}
          {streakData.freezes > 0 && (
            <span title="Streak freezes — auto-applied to a missed day">
              {" "}
              · {"❄".repeat(streakData.freezes)}
            </span>
          )}
        </p>
        <div className="mt-4 flex justify-center gap-1.5">
          {calendar.map((c) => (
            <span
              key={c.day}
              title={c.day}
              className={`h-2.5 w-2.5 rounded-full ${
                c.state === "active"
                  ? "bg-gold"
                  : c.state === "frozen"
                    ? "bg-accent"
                    : c.state === "bridge"
                      ? "bg-border"
                      : "border border-border"
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted">
          last 14 days · weekends bridge automatically
        </p>
      </section>

      {/* This week */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
          This week · {weekCount} paper{weekCount === 1 ? "" : "s"}
        </h2>
        <div className="mt-3 flex h-24 items-end gap-2">
          {weekBars.map((b, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-t ${b.today ? "bg-accent" : "bg-accent/40"}`}
                style={{ height: `${(b.count / maxBar) * 100}%`, minHeight: b.count ? 4 : 1 }}
              />
              <span className={`text-[10px] ${b.today ? "text-accent" : "text-muted"}`}>
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Lifetime tiles */}
      <section className="grid grid-cols-2 gap-2">
        {[
          { label: "papers read", value: readTotal },
          { label: "concepts · mastered", value: `${concepts.length} · ${stats.mastered}` },
          { label: "review sessions", value: stats.sessions },
          { label: "est. reading time", value: `${estMinutes}m` },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-mono text-2xl font-bold text-fg">{t.value}</p>
            <p className="mt-0.5 text-xs text-muted">{t.label}</p>
          </div>
        ))}
      </section>

      {/* Top chips */}
      {(topAuthors.length > 0 || topCats.length > 0) && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
            Your reading gravitates to
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topAuthors.map(([name, n]) => (
              <span key={name} className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent">
                {name} · {n}
              </span>
            ))}
            {topCats.map(([cat, n]) => (
              <span key={cat} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 font-mono text-xs text-muted">
                {cat} · {n}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Saved count footnote */}
      <p className="text-center text-xs text-muted">
        {Object.keys(getSavedMap()).length} saved · streak counts days with ≥1
        read or a review session · {todayStr()}
      </p>
    </PageShell>
  );
}
