"use client";

// Temporary shell page proving the data plumbing end-to-end on Pages.
// Replaced by the feed pager in the next phase.

import { useEffect, useState } from "react";
import { loadFeed, loadMeta } from "@/lib/api";
import type { FeedFile, MetaFile } from "@/lib/data-schema";

export default function TodayPage() {
  const [meta, setMeta] = useState<MetaFile | null>(null);
  const [feed, setFeed] = useState<FeedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadMeta(), loadFeed()])
      .then(([m, f]) => {
        setMeta(m);
        setFeed(f);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-5 py-10">
      <header>
        <h1 className="text-gradient-brand font-display text-4xl font-semibold">
          Daily Drop
        </h1>
        <p className="mt-2 text-sm text-muted">
          Bite-sized arXiv from the people you follow.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-gold/40 bg-surface p-4 text-sm text-gold">
          Couldn&apos;t load data: {error}
        </p>
      )}

      {meta && (
        <p className="text-xs text-muted">
          {meta.paperCount} papers in window · updated{" "}
          {new Date(meta.lastUpdated).toLocaleString()} · pipeline{" "}
          {meta.lastRunStatus}
        </p>
      )}

      <section className="flex flex-col gap-3">
        {feed?.items.map((item) => (
          <article
            key={item.id}
            className="animate-fade-in rounded-2xl border border-border bg-surface p-4"
          >
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              <span className={item.source === "follow" ? "text-accent" : "text-gem"}>
                {item.source === "follow" ? "● following" : "◆ for you"}
              </span>
              <span>{item.authorsLine}</span>
              <span className="ml-auto font-mono">{item.primaryCategory}</span>
            </div>
            <h2 className="font-display text-lg leading-snug">{item.hook}</h2>
          </article>
        ))}
      </section>
    </main>
  );
}
