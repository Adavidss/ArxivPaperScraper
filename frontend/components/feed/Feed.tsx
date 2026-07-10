"use client";

// The Today feed: data → ordered slides → full-screen snap pager, plus the
// sealed-drop ritual, dwell-based read tracking, and the term sheet.
//
// Slides are built ONCE per data load (read state captured at build time) so
// reading never reshuffles the strip mid-session; live read state drives only
// the header counts and celebration.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GlossaryEntry, PaperDetail } from "@/lib/data-schema";
import { buildFeed } from "@/lib/feed";
import { useDrop, useStoreVersion } from "@/lib/hooks";
import {
  computeStreak,
  getDueConcepts,
  getReadMap,
  getSettings,
  getStreakData,
  getSync,
  markRead,
  updateSync,
} from "@/lib/store";
import { TAB_BAR_SPACE } from "@/components/ui/TabBar";
import { FeedHeader } from "./FeedHeader";
import { FeedPager, type PagerHandle } from "./FeedPager";
import { PaperCard } from "./PaperCard";
import {
  CaughtUpSlide,
  ConnectionSlide,
  EndSlide,
  OverviewSlide,
  ReviewPromoSlide,
  WeekendSlide,
} from "./slides";
import { TermSheet } from "@/components/learn/TermSheet";

/** Pager position survives tab switches within the session. */
let sessionIndex: number | null = null;

const READ_DWELL_MS = 2000;
const STALE_AFTER_MS = 48 * 3600 * 1000;

export function Feed() {
  const drop = useDrop();
  useStoreVersion();
  const router = useRouter();
  const pagerRef = useRef<PagerHandle>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [term, setTerm] = useState<{ entry: GlossaryEntry; paper: PaperDetail | null } | null>(null);
  const [define, setDefine] = useState<{ text: string; x: number; y: number } | null>(null);
  const [coachDismissed, setCoachDismissed] = useState(false);

  // First run → onboarding.
  useEffect(() => {
    if (!getSettings().onboarded) router.replace("/welcome");
  }, [router]);

  // Long-press text selection → floating "Define" pill (Wikipedia mode).
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setDefine(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text || text.length > 60 || text.split(/\s+/).length > 5) {
        setDefine(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setDefine({ text, x: rect.left + rect.width / 2, y: rect.top });
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  // Build once per data load — deliberately NOT re-run on read-state changes.
  const built = useMemo(() => {
    if (!drop.feed) return null;
    return buildFeed(
      drop.feed,
      drop.overview,
      getReadMap(),
      getDueConcepts().length,
      getSettings().showForYou ?? true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop.feed, drop.overview]);

  const initialIndex = useMemo(
    () => sessionIndex ?? built?.firstUnreadIndex ?? 0,
    [built],
  );
  useEffect(() => {
    if (built) setActiveIdx(initialIndex);
  }, [built, initialIndex]);

  // Sealed-drop ritual: one "Open" moment per pipeline build.
  const [sealed, setSealed] = useState(false);
  useEffect(() => {
    if (!drop.meta || !built) return;
    const opened = getSync().openedBuildId;
    if (opened === drop.meta.buildId) return;
    if (built.unreadTodayCount > 0 && sessionIndex === null) setSealed(true);
    else updateSync({ openedBuildId: drop.meta.buildId });
  }, [drop.meta, built]);

  // Dwell-based read tracking: 2s on a paper slide = read.
  useEffect(() => {
    const slide = built?.slides[activeIdx];
    if (!slide || slide.type !== "paper") return;
    sessionIndex = activeIdx;
    const t = setTimeout(() => markRead(slide.item.id), READ_DWELL_MS);
    return () => clearTimeout(t);
  }, [activeIdx, built]);
  const coachAnchor = useRef<number | null>(null);
  useEffect(() => {
    if (built) {
      if (coachAnchor.current === null) coachAnchor.current = activeIdx;
      else if (activeIdx !== coachAnchor.current) setCoachDismissed(true);
      sessionIndex = activeIdx;
    }
  }, [activeIdx, built]);

  // ---- render states ----------------------------------------------------------

  if (drop.loading) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center">
          <div className="h-40 w-64 animate-pulse rounded-2xl bg-surface" />
        </div>
      </Shell>
    );
  }

  if (drop.error || !built || !drop.feed) {
    return (
      <Shell>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <h2 className="font-display text-xl font-semibold">No data yet</h2>
          <p className="text-sm text-muted">
            {drop.error
              ? `Couldn't load the feed (${drop.error}). If this is a fresh deploy, the first digest may still be running.`
              : "The first digest hasn't landed yet."}
          </p>
          <Link href="/settings" className="text-sm text-accent underline underline-offset-4">
            Check settings
          </Link>
        </div>
      </Shell>
    );
  }

  const readMap = getReadMap();
  const allTodayRead = built.todayIds.every((id) => readMap[id]);
  const streak = computeStreak(getStreakData());
  const activeSlide = built.slides[activeIdx];
  const forYouCount = built.slides.filter(
    (s, i) => i > built.caughtUpIndex && s.type === "paper",
  ).length;
  const readTodayCount = built.slides.filter(
    (s) => s.type === "paper" && readMap[s.item.id],
  ).length;
  const isStale =
    drop.meta &&
    Date.now() - Date.parse(drop.meta.lastUpdated) > STALE_AFTER_MS &&
    ![0, 6].includes(new Date().getDay());

  return (
    <Shell>
      <FeedHeader
        dropDate={built.dropDate}
        todayIds={built.todayIds}
        readMap={readMap}
        activePaperId={activeSlide?.type === "paper" ? activeSlide.item.id : null}
        streak={streak}
        inBonus={activeIdx > built.caughtUpIndex}
        onJumpToPaper={(id) => {
          const idx = built.slides.findIndex(
            (s) => s.type === "paper" && s.item.id === id,
          );
          if (idx >= 0) pagerRef.current?.jumpTo(idx);
        }}
      />

      {(drop.offline || isStale) && (
        <div className="absolute inset-x-3 top-[calc(3.2rem+env(safe-area-inset-top))] z-20 rounded-lg border border-gold/40 bg-canvas/90 px-3 py-1.5 text-center text-xs text-gold backdrop-blur">
          {drop.offline
            ? "Offline — showing your last synced drop"
            : "No fresh data in 48h — the pipeline may have failed"}
        </div>
      )}

      <FeedPager
        ref={pagerRef}
        count={built.slides.length}
        initialIndex={initialIndex}
        onActive={setActiveIdx}
      >
        {built.slides.map((slide, i) => (
          <section
            key={slideKey(slide, i)}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${built.slides.length}`}
            className="h-full w-full snap-start px-3 pb-2 pt-[calc(3.1rem+env(safe-area-inset-top))]"
          >
            {slide.type === "paper" ? (
              <PaperCard
                item={slide.item}
                active={i === activeIdx}
                near={Math.abs(i - activeIdx) <= 2}
                gem={slide.gem}
                carryOver={slide.carryOver}
                onTerm={(entry, paper) => setTerm({ entry, paper })}
              />
            ) : slide.type === "overview" ? (
              <OverviewSlide overview={slide.overview} />
            ) : slide.type === "weekend" ? (
              <WeekendSlide reviewDue={slide.reviewDue} />
            ) : slide.type === "connection" ? (
              <ConnectionSlide body={slide.body} items={slide.items} />
            ) : slide.type === "caughtup" ? (
              <CaughtUpSlide
                active={i === activeIdx}
                allRead={allTodayRead}
                countToday={built.todayIds.length}
                dropDate={built.dropDate}
                reviewDue={getDueConcepts().length}
                forYouCount={forYouCount}
                streak={streak}
                onContinue={() => pagerRef.current?.jumpTo(built.caughtUpIndex + 1)}
              />
            ) : slide.type === "reviewpromo" ? (
              <ReviewPromoSlide due={slide.due} />
            ) : (
              <EndSlide readToday={readTodayCount} />
            )}
          </section>
        ))}
      </FeedPager>

      {/* Sealed-drop gate */}
      {sealed && drop.meta && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-canvas/85 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-fade-in rounded-2xl border border-accent/40 bg-surface p-6 text-center">
            <p className="text-xs uppercase tracking-widest text-muted">
              {built.dropDate &&
                new Date(`${built.dropDate}T12:00:00Z`).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
            </p>
            <h2 className="text-gradient-brand mt-2 font-display text-3xl font-semibold">
              Today&apos;s drop
            </h2>
            <p className="mt-2 text-sm text-muted">
              {built.todayIds.length} paper{built.todayIds.length === 1 ? "" : "s"}
              {built.unreadTodayCount !== built.todayIds.length
                ? ` · ${built.unreadTodayCount} unread`
                : ""}{" "}
              from your people
            </p>
            <button
              type="button"
              onClick={() => {
                updateSync({ openedBuildId: drop.meta!.buildId });
                setSealed(false);
              }}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-3 font-semibold text-canvas"
            >
              Open
            </button>
          </div>
        </div>
      )}

      {/* First-session coach mark */}
      {!coachDismissed &&
        !sealed &&
        activeSlide?.type === "paper" &&
        Object.keys(readMap).length <= 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center">
            <p className="animate-fade-in rounded-full bg-canvas/85 px-4 py-2 text-xs text-fg/90 backdrop-blur">
              swipe up ↑ next paper · swipe left ← go deeper
            </p>
          </div>
        )}

      {/* Selection "Define" pill */}
      {define && !term && (
        <button
          type="button"
          className="fixed z-40 -translate-x-1/2 -translate-y-full rounded-full border border-accent/50 bg-canvas px-3 py-1.5 text-xs font-medium text-accent shadow-lg"
          style={{ left: define.x, top: Math.max(60, define.y - 8) }}
          onClick={() => {
            setTerm({
              entry: {
                term: define.text,
                shortDef: "",
                eli5Def: "",
                wikiTitle: define.text,
              },
              paper: null,
            });
            setDefine(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          Define &ldquo;{define.text.length > 24 ? `${define.text.slice(0, 24)}…` : define.text}&rdquo;
        </button>
      )}

      <TermSheet
        entry={term?.entry ?? null}
        paper={term?.paper ?? null}
        onClose={() => setTerm(null)}
      />
    </Shell>
  );
}

function slideKey(slide: { type: string }, i: number): string {
  return "item" in slide
    ? `p-${(slide as { item: { id: string } }).item.id}`
    : `${slide.type}-${i}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-0" style={{ bottom: TAB_BAR_SPACE }}>
      <div className="relative mx-auto h-full w-full max-w-xl">{children}</div>
    </div>
  );
}
