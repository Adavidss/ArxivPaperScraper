"use client";

// Saved papers: compact searchable list. Double-tap a feed card (or its
// bookmark) to fill this.

import { useMemo, useState } from "react";
import { useDrop, useMounted, useStoreVersion } from "@/lib/hooks";
import { getSavedMap, toggleSaved } from "@/lib/store";
import { Icons } from "@/components/ui/icons";
import { PageShell } from "@/components/ui/PageShell";

export default function SavedPage() {
  const drop = useDrop();
  useStoreVersion();
  const mounted = useMounted();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    if (!mounted) return [];
    const saved = getSavedMap();
    const byId = new Map(drop.feed?.items.map((i) => [i.id, i]) ?? []);
    return Object.entries(saved)
      .sort((a, b) => b[1].at - a[1].at)
      .map(([id, entry]) => ({ id, at: entry.at, item: byId.get(id) ?? null }));
  }, [drop.feed, mounted]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.id.includes(q) ||
          r.item?.title.toLowerCase().includes(q) ||
          r.item?.hook.toLowerCase().includes(q) ||
          r.item?.authorsLine.toLowerCase().includes(q),
      )
    : rows;

  return (
    <PageShell title="Saved">
      {rows.length > 3 && (
        <div className="relative">
          <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved papers"
            className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {mounted && rows.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Nothing saved yet. Double-tap any card in the feed (or hit the
          bookmark) to keep it here.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {filtered.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-semibold leading-snug">
                  {r.item?.hook ?? r.id}
                </p>
                <p className="mt-1 truncate text-xs text-muted">
                  {r.item ? `${r.item.title} — ${r.item.authorsLine}` : "outside the current window"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`https://arxiv.org/abs/${r.id}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open on arXiv"
                  className="rounded-lg p-2 text-muted transition hover:text-fg"
                >
                  <Icons.External size={16} />
                </a>
                <button
                  type="button"
                  aria-label="Unsave"
                  onClick={() => toggleSaved(r.id)}
                  className="rounded-lg p-2 text-accent"
                >
                  <Icons.Bookmark size={16} filled />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
