"use client";

// One paper = one full-screen card = a horizontal snap strip of 3 panes:
//   A "Bite"   — hook + 3 TLDR bullets + key-number pills (the resting state)
//   B "Deeper" — why-it-matters + ELI5 + glossary chips
//   C "Source" — real title, authors, clamped abstract, arXiv links
// Gesture grammar: vertical = between papers (parent pager), horizontal =
// depth on THIS paper, tap = learn/act. No pane ever scrolls vertically.

import { useEffect, useRef, useState } from "react";
import type { FeedItem, GlossaryEntry, PaperDetail } from "@/lib/data-schema";
import { usePaperDetail, useStoreVersion } from "@/lib/hooks";
import { snapScrollTo } from "@/lib/scroll";
import { isSaved, markDepth, toggleSaved } from "@/lib/store";
import { Icons } from "@/components/ui/icons";
import { TermText } from "@/components/learn/TermText";

const PANES = ["Bite", "Deeper", "Source"];

export function PaperCard({
  item,
  active,
  near,
  gem,
  carryOver,
  onTerm,
}: {
  item: FeedItem;
  /** This card is the current slide. */
  active: boolean;
  /** Within prefetch range of the current slide. */
  near: boolean;
  gem: boolean;
  carryOver: boolean;
  onTerm: (entry: GlossaryEntry, paper: PaperDetail | null) => void;
}) {
  useStoreVersion();
  const detail = usePaperDetail(item.id, near);
  const stripRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState(0);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const saved = isSaved(item.id);

  // Track the active pane (horizontal orthogonal scroll-snap).
  const paneRef = useRef(0);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        if (idx === paneRef.current) return;
        paneRef.current = idx;
        setPane(idx);
        // Store write stays OUT of the setState updater (it re-renders Feed).
        if (idx >= 1) markDepth(item.id, idx, true);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [item.id]);

  const jumpPane = (idx: number) => {
    const el = stripRef.current;
    if (el) snapScrollTo(el, { left: idx * el.clientWidth });
  };

  // Double-tap anywhere on the card body = save/unsave, burst at tap point.
  const handleTap = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    const now = Date.now();
    if (now - lastTap.current < 320) {
      toggleSaved(item.id);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setBurst({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setTimeout(() => setBurst(null), 700);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  const fallback = item.biteStatus === "fallback";

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-surface ${
        gem ? "border-gem/60 shadow-[0_0_24px_-6px_var(--color-gem)]" : "border-border"
      }`}
      onPointerUp={handleTap}
    >
      {/* Badges row */}
      <div className="flex items-center gap-2 px-4 pt-3 text-xs">
        {item.followedIds.length > 0 ? (
          <span className="flex items-center gap-1.5 font-medium text-accent">
            <span className="text-[8px]">●</span>
            {item.authorsLine.split(",")[0]}
          </span>
        ) : (item.matchedKeywords ?? []).length > 0 ? (
          <span className="min-w-0 truncate font-medium text-accent">
            #{item.matchedKeywords[0]}
          </span>
        ) : (
          <span className="flex items-center gap-1 font-medium text-gem">
            ◆ {gem ? "Today's gem" : "For you"}
          </span>
        )}
        {carryOver && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
            from earlier
          </span>
        )}
        {fallback && (
          <span
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted"
            title="AI summary unavailable — showing extracted sentences"
          >
            auto-summary
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-muted">
          <span className="font-mono text-[10px]">{item.primaryCategory}</span>
          <span aria-label={`difficulty ${item.difficulty} of 5`} className="tracking-tighter">
            {"●".repeat(item.difficulty)}
            <span className="opacity-30">{"●".repeat(5 - item.difficulty)}</span>
          </span>
          <span className="font-mono text-[10px]">~{item.readSeconds}s</span>
        </span>
      </div>

      {/* Depth panes */}
      <div
        ref={stripRef}
        className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        <Pane>
          <BitePane item={item} detail={detail} onTerm={(t) => onTerm(t, detail)} />
        </Pane>
        <Pane>
          <DeepPane item={item} detail={detail} onTerm={(t) => onTerm(t, detail)} />
        </Pane>
        <Pane>
          <SourcePane item={item} detail={detail} />
        </Pane>
      </div>

      {/* Depth dots + advance */}
      <div className="flex items-center justify-between px-4 pb-1">
        <div className="flex gap-1.5" aria-label={`pane ${pane + 1} of 3: ${PANES[pane]}`}>
          {PANES.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={() => jumpPane(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === pane ? "w-5 bg-accent" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
        {pane < 2 && (
          <button
            type="button"
            onClick={() => jumpPane(pane + 1)}
            className="flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium text-accent"
          >
            Deeper <Icons.ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* Identity + actions rail */}
      <div className="flex items-center gap-3 border-t border-border/60 px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-xs text-muted">
          {item.title} — {item.authorsLine}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={saved ? "Unsave" : "Save"}
            aria-pressed={saved}
            onClick={() => toggleSaved(item.id)}
            className={`rounded-lg p-2 transition ${saved ? "text-accent" : "text-muted hover:text-fg"}`}
          >
            <Icons.Bookmark size={18} filled={saved} />
          </button>
          <button
            type="button"
            aria-label="Share"
            onClick={() => {
              const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
              const url = `${location.origin}${base}/paper/?id=${encodeURIComponent(item.id)}`;
              if (navigator.share)
                navigator.share({ title: item.title, text: item.hook, url }).catch(() => {});
              else navigator.clipboard?.writeText(`${item.hook}\n${url}`).catch(() => {});
            }}
            className="rounded-lg p-2 text-muted transition hover:text-fg"
          >
            <Icons.Share size={18} />
          </button>
          <a
            href={`https://arxiv.org/abs/${item.id}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open on arXiv"
            className="rounded-lg p-2 text-muted transition hover:text-fg"
          >
            <Icons.External size={18} />
          </a>
        </div>
      </div>

      {/* Double-tap save burst */}
      {burst && (
        <div
          className="pointer-events-none absolute z-10 animate-pop text-accent"
          style={{ left: burst.x - 20, top: burst.y - 20 }}
        >
          <Icons.Bookmark size={40} filled={saved} />
        </div>
      )}
    </div>
  );
}

function Pane({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full shrink-0 snap-center flex-col overflow-hidden px-4 py-3">
      {children}
    </div>
  );
}

function BitePane({
  item,
  detail,
  onTerm,
}: {
  item: FeedItem;
  detail: PaperDetail | null;
  onTerm: (t: GlossaryEntry) => void;
}) {
  const bite = detail?.bite;
  const glossary = bite?.glossary ?? [];
  return (
    <>
      <h2 className="font-display text-[26px] font-semibold leading-[1.18] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] overflow-hidden">
        {item.hook}
      </h2>
      <ul className="mt-3 flex min-h-0 flex-col gap-2.5">
        {(bite?.tldr ?? []).map((line, i) => (
          <li key={i} className="flex gap-2 text-[15px] leading-snug">
            <span className="mt-0.5 shrink-0 text-accent">▸</span>
            <span className="[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
              <TermText text={line} glossary={glossary} onTerm={onTerm} />
            </span>
          </li>
        ))}
        {!bite &&
          [0, 1, 2].map((i) => (
            <li key={i} className="h-4 w-full animate-pulse rounded bg-surface-2" />
          ))}
      </ul>
      {bite && bite.keyNumbers.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2 pt-3">
          {bite.keyNumbers.slice(0, 3).map((k) => (
            <KeyNumberPill key={k.value + k.label} value={k.value} label={k.label} context={k.context} />
          ))}
        </div>
      )}
    </>
  );
}

function KeyNumberPill({
  value,
  label,
  context,
}: {
  value: string;
  label: string;
  context: string;
}) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (!flipped) return;
    const t = setTimeout(() => setFlipped(false), 4500);
    return () => clearTimeout(t);
  }, [flipped]);
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className="max-w-full rounded-xl border border-data/30 bg-data/10 px-2.5 py-1.5 text-left transition"
    >
      {flipped ? (
        <span className="block max-w-60 text-[11px] leading-tight text-data [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {context}
        </span>
      ) : (
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-sm font-bold text-data">{value}</span>
          <span className="text-[10px] text-muted">{label}</span>
        </span>
      )}
    </button>
  );
}

function DeepPane({
  item,
  detail,
  onTerm,
}: {
  item: FeedItem;
  detail: PaperDetail | null;
  onTerm: (t: GlossaryEntry) => void;
}) {
  const bite = detail?.bite;
  if (!bite)
    return <div className="m-auto h-24 w-full animate-pulse rounded-xl bg-surface-2" />;
  const fallback = item.biteStatus === "fallback";
  return (
    <>
      {bite.whyItMatters ? (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-gold">
            Why it matters
          </h3>
          <p className="mt-1.5 border-l-2 border-gold/50 pl-3 text-[15px] leading-relaxed [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:5] overflow-hidden">
            <TermText text={bite.whyItMatters} glossary={bite.glossary} onTerm={onTerm} />
          </p>
        </section>
      ) : fallback ? (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">
            Auto-summary
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:8] overflow-hidden">
            {detail.abstract}
          </p>
        </section>
      ) : null}
      {bite.eli5 && (
        <section className="mt-4">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-accent">
            Like you&apos;re five
          </h3>
          <p className="mt-1.5 text-[15px] leading-relaxed [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6] overflow-hidden">
            {bite.eli5}
          </p>
        </section>
      )}
      {bite.glossary.length > 0 && (
        <div className="mt-auto pt-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-widest text-muted">
            Terms in this paper
          </p>
          <div className="flex flex-wrap gap-1.5">
            {bite.glossary.map((g) => (
              <button
                key={g.term}
                type="button"
                onClick={() => onTerm(g)}
                className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-xs text-accent"
              >
                {g.term}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SourcePane({ item, detail }: { item: FeedItem; detail: PaperDetail | null }) {
  return (
    <>
      <h2 className="font-display text-lg font-semibold leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] overflow-hidden">
        {detail?.title ?? item.title}
      </h2>
      <p className="mt-1.5 text-xs text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
        {detail
          ? detail.authors.map((a, i) => (
              <span key={i} className={a.followedId ? "text-accent" : undefined}>
                {a.name}
                {i < detail.authors.length - 1 ? ", " : ""}
              </span>
            ))
          : item.authorsLine}
      </p>
      <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
        <p className="text-sm leading-relaxed text-fg/90">{detail?.abstract ?? "…"}</p>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <a
          href={detail?.links.abs ?? `https://arxiv.org/abs/${item.id}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-canvas"
        >
          Read the paper
        </a>
        <a
          href={detail?.links.pdf ?? `https://arxiv.org/pdf/${item.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted underline underline-offset-4"
        >
          PDF
        </a>
        <span className="ml-auto font-mono text-[10px] text-muted">{item.published}</span>
      </div>
    </>
  );
}
