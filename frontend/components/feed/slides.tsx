"use client";

// Non-paper slides: daily overview (front page), caught-up finish line,
// review promo, author suggestion, end-of-feed floor.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AuthorSuggestion, OverviewFile } from "@/lib/data-schema";
import { queueOrSyncOps } from "@/lib/github";
import { dismissSuggestion, getSync, updateSync } from "@/lib/store";
import { Icons } from "@/components/ui/icons";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function OverviewSlide({ overview }: { overview: OverviewFile }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gold/40 bg-surface">
      <div className="border-b border-gold/20 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gold">
          Today across your people
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">
          {overview.headline}
        </h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
        <p className="text-sm leading-relaxed text-fg/90">{overview.summary}</p>
        {overview.themes.slice(0, 3).map((t) => (
          <section key={t.title} className="border-l-2 border-gold/50 pl-3">
            <h3 className="text-sm font-semibold text-gold">{t.title}</h3>
            <p className="mt-0.5 text-[13px] leading-snug text-fg/85 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
              {t.body}
            </p>
          </section>
        ))}
      </div>
      <p className="px-4 pb-3 text-xs text-muted">
        {overview.paperIds.length} paper{overview.paperIds.length === 1 ? "" : "s"} · swipe up ↑
      </p>
    </div>
  );
}

export function CaughtUpSlide({
  active,
  allRead,
  countToday,
  dropDate,
  reviewDue,
  forYouCount,
  streak,
  onContinue,
}: {
  active: boolean;
  allRead: boolean;
  countToday: number;
  dropDate: string | null;
  reviewDue: number;
  forYouCount: number;
  streak: number;
  onContinue: () => void;
}) {
  const fired = useRef(false);

  // One celebration per drop, only when the drop is actually cleared.
  useEffect(() => {
    if (!active || !allRead || fired.current || !dropDate) return;
    if (getSync().celebratedDrop === dropDate) return;
    fired.current = true;
    updateSync({ celebratedDrop: dropDate });
    if (!prefersReducedMotion()) {
      Promise.all([import("canvas-confetti"), import("@/lib/theme")]).then(
        ([{ default: confetti }, { themeColors }]) => {
          confetti({
            particleCount: 90,
            spread: 75,
            origin: { y: 0.7 },
            colors: themeColors(),
          });
        },
      );
    }
  }, [active, allRead, dropDate]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface px-6 text-center">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${
          allRead ? "border-data text-data" : "border-border text-muted"
        }`}
      >
        <Icons.Check size={32} />
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold">
          {allRead ? "Drop cleared" : "Almost there"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {allRead
            ? `All ${countToday || "your"} paper${countToday === 1 ? "" : "s"} read${
                streak > 0 ? ` · streak ${streak} 🔥` : ""
              }`
            : "A few papers from your people are still above."}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2 pt-2">
        {reviewDue > 0 && (
          <Link
            href="/concepts/review"
            className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent"
          >
            Review {reviewDue} concept{reviewDue === 1 ? "" : "s"} (~2 min)
          </Link>
        )}
        {forYouCount > 0 && (
          <button
            type="button"
            onClick={onContinue}
            className="rounded-xl border border-gem/40 bg-gem/10 px-4 py-2.5 text-sm font-medium text-gem"
          >
            Keep exploring — {forYouCount} more below
          </button>
        )}
        <Link
          href="/stats"
          className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted"
        >
          Done — see you tomorrow
        </Link>
      </div>
    </div>
  );
}

export function WeekendSlide({ reviewDue }: { reviewDue: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface px-6 text-center">
      <Icons.Moon size={40} className="text-muted" />
      <div>
        <h2 className="font-display text-2xl font-semibold">No drop today</h2>
        <p className="mt-1 text-sm text-muted">
          arXiv rests on weekends — your streak does too.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2 pt-1">
        {reviewDue > 0 && (
          <Link
            href="/concepts/review"
            className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent"
          >
            Review {reviewDue} concept{reviewDue === 1 ? "" : "s"}
          </Link>
        )}
        <Link
          href="/saved"
          className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted"
        >
          Revisit saved papers
        </Link>
      </div>
      <p className="text-xs text-muted">swipe up to re-browse the week ↑</p>
    </div>
  );
}

export function ConnectionSlide({
  body,
  items,
}: {
  body: string;
  items: Array<{ id: string; hook: string; authorsLine: string }>;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 rounded-2xl border border-gold/40 bg-surface px-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">
        These papers are circling the same problem
      </p>
      <p className="font-display text-lg leading-snug">{body}</p>
      <div className="flex flex-col gap-2">
        {items.slice(0, 2).map((i) => (
          <div key={i.id} className="rounded-xl border border-border bg-surface-2 px-3 py-2">
            <p className="text-sm leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
              {i.hook}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">{i.authorsLine}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReviewPromoSlide({ due }: { due: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-accent/30 bg-surface px-6 text-center">
      <Icons.Brain size={40} className="text-accent" />
      <div>
        <h2 className="font-display text-xl font-semibold">
          {due} concept{due === 1 ? "" : "s"} ready for review
        </h2>
        <p className="mt-1 text-sm text-muted">90 seconds, tops. Keep them fresh.</p>
      </div>
      <Link
        href="/concepts/review"
        className="rounded-xl bg-gradient-to-r from-accent to-accent-2 px-5 py-2.5 text-sm font-semibold text-canvas"
      >
        Start review
      </Link>
    </div>
  );
}

/** Author discovery: one person per day, follow in one tap, never a goal. */
export function SuggestSlide({ suggestion }: { suggestion: AuthorSuggestion }) {
  const [state, setState] = useState<"idle" | "following" | "done" | "dismissed">("idle");

  const reason = suggestion.coAuthoredWith.length
    ? `Co-author on ${suggestion.paperCount} paper${suggestion.paperCount === 1 ? "" : "s"} with people you follow`
    : suggestion.viaKeywords.length
      ? `Keeps showing up in #${suggestion.viaKeywords[0]}`
      : `Active in ${suggestion.viaCategories.join(", ")}`;

  const follow = async () => {
    setState("following");
    dismissSuggestion(suggestion.slug);
    const result = await queueOrSyncOps([
      {
        op: "add-author",
        author: { id: suggestion.slug, name: suggestion.name, aliases: [] },
      },
    ]);
    setState("done");
    void result;
  };

  if (state === "dismissed") {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-surface">
        <p className="text-sm text-muted">Okay — fewer like this. Swipe on ↑</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-2xl border border-gem/40 bg-surface px-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gem/15 blur-3xl" />
      <p className="text-[10px] font-bold uppercase tracking-widest text-gem">
        People · suggested for you
      </p>
      <h2 className="mt-2 font-display text-[30px] font-semibold leading-tight">
        {suggestion.name}
      </h2>
      <p className="mt-1.5 text-sm text-fg/85">{reason}</p>

      {suggestion.recentTitles.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {suggestion.recentTitles.slice(0, 2).map((t) => (
            <p
              key={t}
              className="border-l-2 border-gem/40 pl-3 text-[13px] leading-snug text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
            >
              {t}
            </p>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-2">
        {state === "done" ? (
          <p className="rounded-xl border border-data/40 bg-data/10 px-4 py-2.5 text-sm font-medium text-data">
            Following ✓ — papers arrive with the next refresh
          </p>
        ) : (
          <>
            <button
              type="button"
              disabled={state === "following"}
              onClick={follow}
              className="rounded-xl bg-gem px-5 py-2.5 text-sm font-semibold text-canvas disabled:opacity-60"
            >
              {state === "following" ? "Following…" : "+ Follow"}
            </button>
            <button
              type="button"
              onClick={() => {
                dismissSuggestion(suggestion.slug);
                setState("dismissed");
              }}
              className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted transition hover:text-fg"
            >
              Not for me
            </button>
          </>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Mined from your window: co-authorships weigh most, then keyword and
        category overlap.
      </p>
    </div>
  );
}

export function EndSlide({ readToday }: { readToday: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-6 text-center">
      <Icons.Moon size={36} className="text-muted" />
      <h2 className="font-display text-xl font-semibold">That&apos;s everything today</h2>
      <p className="max-w-60 text-sm text-muted">
        {readToday > 0 ? `${readToday} paper${readToday === 1 ? "" : "s"} read. ` : ""}
        No infinite scroll here — next drop lands tomorrow around 6am.
      </p>
      <Link href="/stats" className="mt-2 text-sm text-accent underline underline-offset-4">
        See your week
      </Link>
    </div>
  );
}
