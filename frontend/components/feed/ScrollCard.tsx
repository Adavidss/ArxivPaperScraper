"use client";

// One paper in the scrolling feed: a rich, variable-height card. Renders
// instantly from live arXiv data (title/authors/abstract) and upgrades in
// place when the pipeline's enrichment exists (hook, bullets, glossary,
// key numbers, real figure).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { GlossaryEntry, PaperDetail } from "@/lib/data-schema";
import type { LiveItem } from "@/lib/arxiv-live";
import { usePaperDetail, useStoreVersion } from "@/lib/hooks";
import { getFollows, isRead, isSaved, markRead, toggleSaved } from "@/lib/store";
import { Icons } from "@/components/ui/icons";
import { TermText } from "@/components/learn/TermText";
import { categoryHue, CoverArt } from "./CoverArt";

const READ_DWELL_MS = 1800;

export function ScrollCard({
  item,
  onTerm,
  onPlay,
}: {
  item: LiveItem;
  onTerm: (entry: GlossaryEntry, paper: PaperDetail | null) => void;
  /** Launch the per-paper game (enriched cards only). */
  onPlay?: (detail: PaperDetail) => void;
}) {
  useStoreVersion();
  const ref = useRef<HTMLElement>(null);
  // Enrichment loads on mount — NEVER gate content on IntersectionObserver:
  // backgrounded tabs suppress IO callbacks entirely, which left cards
  // un-enriched (and, worse, opacity-0) until the tab was refocused.
  const detail = usePaperDetail(item.id, true);

  // IO is only the read-dwell signal (≥60% visible for ~2s = read).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let dwell: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= 0.6) {
            dwell ??= setTimeout(() => markRead(item.id), READ_DWELL_MS);
          } else if (dwell) {
            clearTimeout(dwell);
            dwell = null;
          }
        }
      },
      { threshold: [0, 0.6] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (dwell) clearTimeout(dwell);
    };
  }, [item.id]);

  const bite = detail?.bite;
  const figure = detail?.figure?.url ?? null;
  const glossary = bite?.glossary ?? [];
  const read = isRead(item.id);
  const saved = isSaved(item.id);
  const ageDays = Math.max(
    0,
    Math.round((Date.now() - Date.parse(`${item.published}T12:00:00Z`)) / 86_400_000),
  );

  const share = () => {
    const url = `https://arxiv.org/abs/${item.id}`;
    if (navigator.share) void navigator.share({ title: item.title, url });
    else void navigator.clipboard?.writeText(url);
  };

  return (
    <article
      ref={ref}
      className={`animate-fade-in overflow-hidden rounded-2xl border bg-surface transition-opacity ${
        item.source === "foryou" ? "border-gem/25" : "border-border"
      } ${read ? "opacity-80" : ""}`}
    >
      {/* Visual: real figure when enriched, cover art otherwise. */}
      <Link href={`/paper/?id=${item.id}`} className="block">
        <div className="relative h-36 w-full overflow-hidden border-b border-border">
          {figure ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={figure}
              alt=""
              loading="lazy"
              className="h-full w-full bg-white object-contain p-1.5"
            />
          ) : (
            <CoverArt seed={item.id} category={item.primaryCategory} className="h-full w-full" />
          )}
          {read && (
            <span className="absolute right-2 top-2 rounded-full bg-canvas/80 px-2 py-0.5 text-[10px] text-muted backdrop-blur">
              read ✓
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-col gap-2 p-4">
        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {item.followedIds.length > 0 ? (
            <span className="flex items-center gap-1.5 font-medium text-accent">
              <span className="text-[8px]">●</span>
              {/* Name the FOLLOWED author — the reason this paper is here. */}
              {getFollows()?.authors.find((a) => a.id === item.followedIds[0])?.name ??
                item.authorsLine.split(",")[0]}
            </span>
          ) : item.matchedKeywords.length > 0 ? (
            <span className="font-medium text-accent">#{item.matchedKeywords[0]}</span>
          ) : (
            <span className="font-medium text-gem">◆ discovery</span>
          )}
          {ageDays <= 1 ? (
            <span className="new-badge rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-canvas">
              New
            </span>
          ) : (
            <span className="font-mono text-[10px] text-muted">{ageDays}d</span>
          )}
          <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: `hsl(${categoryHue(item.primaryCategory)} 70% 55%)` }}
            />
            {item.primaryCategory}
            {bite && <span aria-hidden> · ~{bite.readSeconds}s</span>}
          </span>
        </div>

        {/* Headline: AI hook when enriched, else the paper title. */}
        <Link href={`/paper/?id=${item.id}`} className="block">
          <h2 className="font-display text-[19px] font-semibold leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
            {bite?.hook ?? item.title}
          </h2>
          {bite && (
            <p className="mt-1 truncate text-[11px] text-muted">
              {item.title} — {item.authorsLine}
            </p>
          )}
          {!bite && <p className="mt-1 truncate text-[11px] text-muted">{item.authorsLine}</p>}
        </Link>

        {/* Body: TLDR bullets (tap terms to learn) or abstract snippet. */}
        {bite ? (
          <ul className="flex flex-col gap-1.5">
            {bite.tldr.map((line, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-snug">
                <span className="mt-0.5 shrink-0 text-accent">▸</span>
                <span className="[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
                  <TermText text={line} glossary={glossary} onTerm={(t) => onTerm(t, detail)} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] leading-relaxed text-fg/75 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden">
            {item.abstract}
          </p>
        )}

        {/* Key numbers */}
        {bite && bite.keyNumbers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {bite.keyNumbers.slice(0, 3).map((k) => (
              <span
                key={k.value + k.label}
                className="rounded-full border border-data/30 bg-data/10 px-2 py-0.5 font-mono text-[11px] text-data"
                title={k.context}
              >
                {k.value} <span className="text-muted">{k.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-1 flex items-center gap-1 border-t border-border pt-2">
          {detail && onPlay && detail.bite.glossary.length > 0 && (
            <button
              type="button"
              onClick={() => onPlay(detail)}
              className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent"
            >
              <Icons.Brain size={15} /> Play
            </button>
          )}
          <button
            type="button"
            aria-pressed={saved}
            onClick={() => toggleSaved(item.id)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition ${
              saved ? "text-accent" : "text-muted hover:text-fg"
            }`}
          >
            <Icons.Bookmark size={15} filled={saved} /> {saved ? "Saved" : "Save"}
          </button>
          <button
            type="button"
            onClick={share}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:text-fg"
          >
            <Icons.Share size={15} /> Share
          </button>
          <a
            href={`https://arxiv.org/abs/${item.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:text-fg"
          >
            <Icons.External size={15} /> arXiv
          </a>
          <Link
            href={`/paper/?id=${item.id}`}
            className="ml-auto flex items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent"
          >
            {bite ? "Go deeper" : "Details"} <Icons.ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}
