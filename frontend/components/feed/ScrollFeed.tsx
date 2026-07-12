"use client";

// The Today feed, scroll edition: a continuous stream of rich paper cards
// assembled LIVE from arXiv (via the arxiv-proxy worker). Follows/keywords/
// categories apply instantly from localStorage. The repo pipeline only
// enriches: AI bites, figures, the daily overview and people suggestions
// upgrade cards as they become available.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadSuggestions } from "@/lib/api";
import {
  clearLiveCache,
  ensureFollows,
  type LiveFeed,
  loadLiveFeed,
} from "@/lib/arxiv-live";
import type { AuthorSuggestion, GlossaryEntry, PaperDetail } from "@/lib/data-schema";
import { useDrop, useMounted, useStoreVersion } from "@/lib/hooks";
import {
  computeStreak,
  dismissSuggestion,
  getDismissedSuggestions,
  getFollows,
  getReadMap,
  getSettings,
  getStreakData,
  setFollows,
} from "@/lib/store";
import { TAB_BAR_SPACE } from "@/components/ui/TabBar";
import { Icons } from "@/components/ui/icons";
import { TermSheet } from "@/components/learn/TermSheet";
import { ScrollCard } from "./ScrollCard";

export function ScrollFeed() {
  useStoreVersion();
  const mounted = useMounted();
  const router = useRouter();
  const drop = useDrop(); // enrichment: overview + freshness meta
  const [live, setLive] = useState<LiveFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pages, setPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggestions, setSuggestions] = useState<AuthorSuggestion[]>([]);
  const [term, setTerm] = useState<{ entry: GlossaryEntry; paper: PaperDetail | null } | null>(
    null,
  );

  useEffect(() => {
    if (!getSettings().onboarded) router.replace("/welcome");
  }, [router]);

  const load = useCallback(async (discoveryPages: number, force = false) => {
    try {
      const follows = await ensureFollows();
      const feed = await loadLiveFeed(follows, { discoveryPages, force });
      setLive(feed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    loadSuggestions().then((s) => {
      const hidden = new Set(getDismissedSuggestions());
      setSuggestions(s.suggestions.filter((x) => !hidden.has(x.slug)));
    });
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    clearLiveCache();
    await load(pages, true);
    setRefreshing(false);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    const next = pages + 1;
    setPages(next);
    await load(next);
    setLoadingMore(false);
  };

  const readMap = getReadMap();
  const streak = mounted ? computeStreak(getStreakData()) : 0;
  const follows = mounted ? getFollows() : null;
  const showForYou = getSettings().showForYou ?? true;
  const unread = live ? live.followed.filter((i) => !readMap[i.id]).length : 0;
  const suggestion = suggestions[0] ?? null;

  // Overview is worth the top slot only while it's fresh (≤3 days).
  const overview = useMemo(() => {
    if (!drop.overview) return null;
    const age = Date.now() - Date.parse(`${drop.overview.date}T12:00:00Z`);
    return age <= 3 * 86_400_000 ? drop.overview : null;
  }, [drop.overview]);

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Daily Drop` : "Daily Drop";
  }, [unread]);

  return (
    <>
      <div
        className="mx-auto w-full max-w-xl px-3"
        style={{ paddingBottom: `calc(${TAB_BAR_SPACE} + 1rem)` }}
      >
        {/* Sticky header */}
        <header className="sticky top-0 z-20 -mx-3 mb-3 flex items-center gap-3 border-b border-border bg-canvas/85 px-4 pb-2.5 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <h1 className="font-display text-xl font-bold">Daily Drop</h1>
          {unread > 0 && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
              {unread} unread
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-sm text-gold">
            <Icons.Flame size={16} /> {streak}
          </span>
          <button
            type="button"
            aria-label="Refresh"
            onClick={refresh}
            className={`rounded-lg p-1.5 text-muted transition hover:text-fg ${refreshing ? "animate-spin" : ""}`}
          >
            <Icons.Refresh size={17} />
          </button>
          <Link href="/settings" aria-label="Settings" className="rounded-lg p-1.5 text-muted transition hover:text-fg">
            <Icons.Gear size={17} />
          </Link>
        </header>

        {/* Soft status */}
        {error && !live && (
          <div className="mb-3 rounded-xl border border-gold/40 px-3 py-2 text-xs text-gold">
            Live fetch failed ({error}) — check your connection and pull refresh.
          </div>
        )}
        {live && live.failures > 0 && (
          <div className="mb-3 rounded-xl border border-border px-3 py-2 text-[11px] text-muted">
            Some sources didn&apos;t respond — showing what arrived. Refresh to retry.
          </div>
        )}

        {/* Empty follows CTA */}
        {mounted && follows && follows.authors.length === 0 && follows.keywords.length === 0 && (
          <div className="mb-3 rounded-2xl border border-accent/40 bg-surface p-5 text-center">
            <h2 className="font-display text-lg font-semibold">Follow your first author</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
              Papers appear here the moment you follow someone — no waiting.
            </p>
            <Link
              href="/settings"
              className="mt-3 inline-block rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2.5 text-sm font-semibold text-canvas"
            >
              Add authors &amp; topics
            </Link>
          </div>
        )}

        {/* Skeletons on first live load */}
        {!live && !error && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl border border-border bg-surface" />
            ))}
          </div>
        )}

        {live && (
          <div className="flex flex-col gap-3">
            {/* Daily overview (enrichment) */}
            {overview && <OverviewCard headline={overview.headline} summary={overview.summary} />}

            {/* Followed stream, suggestion card woven in */}
            {live.followed.map((item, i) => (
              <div key={item.id} className="flex flex-col gap-3">
                <ScrollCard item={item} onTerm={(entry, paper) => setTerm({ entry, paper })} />
                {i === 4 && suggestion && (
                  <SuggestCard
                    suggestion={suggestion}
                    onGone={() => setSuggestions((s) => s.slice(1))}
                    onFollowed={() => void load(pages, true)}
                  />
                )}
              </div>
            ))}
            {live.followed.length === 0 && follows && follows.authors.length > 0 && (
              <p className="rounded-xl border border-border px-3 py-4 text-center text-sm text-muted">
                Nothing from your people in this window — their next paper lands here.
              </p>
            )}
            {live.followed.length > 0 && live.followed.length <= 4 && suggestion && (
              <SuggestCard
                suggestion={suggestion}
                onGone={() => setSuggestions((s) => s.slice(1))}
                onFollowed={() => void load(pages, true)}
              />
            )}

            {/* Finish line + discovery tail */}
            {showForYou && live.discovery.length > 0 && (
              <>
                <div className="flex items-center gap-3 py-2" role="separator">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] uppercase tracking-widest text-muted">
                    {unread === 0 ? "caught up · " : ""}discovery
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                {live.discovery.map((item) => (
                  <ScrollCard
                    key={item.id}
                    item={item}
                    onTerm={(entry, paper) => setTerm({ entry, paper })}
                  />
                ))}
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={loadMore}
                  className="mb-2 rounded-xl border border-border px-4 py-3 text-sm text-muted transition hover:text-fg disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more discovery"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <TermSheet
        entry={term?.entry ?? null}
        paper={term?.paper ?? null}
        onClose={() => setTerm(null)}
      />
    </>
  );
}

function OverviewCard({ headline, summary }: { headline: string; summary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="rounded-2xl border border-gold/40 bg-surface p-4 text-left"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-gold">
        Today across your fields
      </p>
      <h2 className="mt-1 font-display text-lg font-semibold leading-snug">{headline}</h2>
      <p
        className={`mt-1.5 text-[13px] leading-relaxed text-fg/85 ${
          open ? "" : "[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
        }`}
      >
        {summary}
      </p>
      <span className="mt-1 block text-[11px] text-gold">{open ? "less" : "more"}</span>
    </button>
  );
}

function SuggestCard({
  suggestion,
  onGone,
  onFollowed,
}: {
  suggestion: AuthorSuggestion;
  onGone: () => void;
  onFollowed: () => void;
}) {
  const reason = suggestion.coAuthoredWith.length
    ? `Co-author on ${suggestion.paperCount} paper${suggestion.paperCount === 1 ? "" : "s"} with your people`
    : suggestion.viaKeywords.length
      ? `Keeps appearing in #${suggestion.viaKeywords[0]}`
      : `Active in ${suggestion.viaCategories.join(", ")}`;

  const follow = () => {
    const follows = getFollows();
    if (follows && !follows.authors.some((a) => a.id === suggestion.slug)) {
      setFollows({
        ...follows,
        authors: [
          ...follows.authors,
          { id: suggestion.slug, name: suggestion.name, aliases: [] },
        ],
      });
    }
    dismissSuggestion(suggestion.slug);
    onGone();
    onFollowed(); // refetch — their papers appear immediately
  };

  return (
    <div className="rounded-2xl border border-gem/40 bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gem">
        People · suggested for you
      </p>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold">{suggestion.name}</h3>
          <p className="mt-0.5 text-xs text-muted">{reason}</p>
        </div>
        <button
          type="button"
          onClick={follow}
          className="shrink-0 rounded-xl bg-gem px-3.5 py-2 text-sm font-semibold text-canvas"
        >
          + Follow
        </button>
        <button
          type="button"
          aria-label="Dismiss suggestion"
          onClick={() => {
            dismissSuggestion(suggestion.slug);
            onGone();
          }}
          className="shrink-0 rounded-lg p-1.5 text-muted transition hover:text-fg"
        >
          <Icons.X size={16} />
        </button>
      </div>
    </div>
  );
}
