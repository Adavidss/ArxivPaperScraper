"use client";

// Deep-link / share landing for one paper: every depth pane stacked as a
// normal scroll page — recipients shouldn't need gesture knowledge.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { loadPaper } from "@/lib/api";
import { loadLivePaper } from "@/lib/arxiv-live";
import type { GlossaryEntry, PaperDetail } from "@/lib/data-schema";
import { useStoreVersion } from "@/lib/hooks";
import { isSaved, markRead, toggleSaved } from "@/lib/store";
import { PaperGame } from "@/components/games/PaperGame";
import { TermSheet } from "@/components/learn/TermSheet";
import { TermText } from "@/components/learn/TermText";
import { Icons } from "@/components/ui/icons";

function PaperInner() {
  const id = useSearchParams().get("id");
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [term, setTerm] = useState<GlossaryEntry | null>(null);
  const [playing, setPlaying] = useState(false);
  useStoreVersion();

  useEffect(() => {
    if (!id) return;
    loadPaper(id)
      .then((p) => {
        setPaper(p);
        markRead(p.id);
      })
      .catch(async () => {
        // Not enriched (yet) — build a live view straight from arXiv so every
        // paper in the stream opens instantly.
        try {
          const live = await loadLivePaper(id);
          if (!live) throw new Error("not found");
          setPaper({
            id: live.id,
            version: live.version,
            title: live.title,
            authors: live.authorNames.map((name) => ({ name })),
            categories: [live.primaryCategory],
            primaryCategory: live.primaryCategory,
            published: live.published,
            updated: live.updatedAt,
            abstract: live.abstract,
            comment: null,
            doi: null,
            links: {
              abs: `https://arxiv.org/abs/${live.id}`,
              pdf: `https://arxiv.org/pdf/${live.id}`,
              html: `https://arxiv.org/html/${live.id}`,
            },
            source: "foryou",
            matchedKeywords: [],
            withdrawn: false,
            biteStatus: "fallback",
            bite: {
              hook: live.title,
              tldr: [],
              whyItMatters: "",
              eli5: "",
              keyNumbers: [],
              glossary: [],
              difficulty: 3,
              readSeconds: 60,
              model: "live",
              generatedAt: "",
            },
          });
          markRead(live.id);
        } catch {
          setMissing(true);
        }
      });
  }, [id]);

  if (!id || missing)
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-lg font-semibold">Paper not in the current window</p>
        {id && (
          <a
            href={`https://arxiv.org/abs/${id}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent underline underline-offset-4"
          >
            Open on arXiv instead
          </a>
        )}
        <Link href="/" className="text-sm text-muted underline underline-offset-4">
          Back to the feed
        </Link>
      </main>
    );

  if (!paper)
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-3 px-5 pt-16">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-surface" />
        ))}
      </main>
    );

  const { bite } = paper;
  const saved = isSaved(paper.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-5 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted">
          <Icons.ChevronRight size={16} className="rotate-180" /> Feed
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={saved ? "Unsave" : "Save"}
            onClick={() => toggleSaved(paper.id)}
            className={`rounded-lg p-2 ${saved ? "text-accent" : "text-muted"}`}
          >
            <Icons.Bookmark size={18} filled={saved} />
          </button>
          <a
            href={paper.links.abs}
            target="_blank"
            rel="noreferrer"
            aria-label="Open on arXiv"
            className="rounded-lg p-2 text-muted"
          >
            <Icons.External size={18} />
          </a>
        </div>
      </div>

      <header>
        <p className="mb-2 flex items-center gap-2 text-xs text-muted">
          <span className="font-mono">{paper.primaryCategory}</span>·
          <span>{paper.published.slice(0, 10)}</span>
          {paper.biteStatus === "fallback" && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px]">auto-summary</span>
          )}
        </p>
        <h1 className="font-display text-2xl font-semibold leading-tight">{bite.hook}</h1>
      </header>

      <ul className="flex flex-col gap-2.5">
        {bite.tldr.map((line, i) => (
          <li key={i} className="flex gap-2 text-[15px] leading-relaxed">
            <span className="mt-0.5 shrink-0 text-accent">▸</span>
            <TermText text={line} glossary={bite.glossary} onTerm={setTerm} />
          </li>
        ))}
      </ul>

      {bite.keyNumbers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {bite.keyNumbers.map((k) => (
            <span
              key={k.value + k.label}
              title={k.context}
              className="rounded-xl border border-data/30 bg-data/10 px-2.5 py-1.5"
            >
              <span className="font-mono text-sm font-bold text-data">{k.value}</span>{" "}
              <span className="text-[10px] text-muted">{k.label}</span>
            </span>
          ))}
        </div>
      )}

      {bite.whyItMatters && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-gold">Why it matters</h2>
          <p className="mt-1.5 border-l-2 border-gold/50 pl-3 text-[15px] leading-relaxed">
            <TermText text={bite.whyItMatters} glossary={bite.glossary} onTerm={setTerm} />
          </p>
        </section>
      )}

      {bite.eli5 && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-accent">
            Like you&apos;re five
          </h2>
          <p className="mt-1.5 text-[15px] leading-relaxed">{bite.eli5}</p>
        </section>
      )}

      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted">The paper</h2>
        <h3 className="mt-1.5 font-display text-lg font-semibold leading-snug">{paper.title}</h3>
        <p className="mt-1 text-xs text-muted">
          {paper.authors.map((a, i) => (
            <span key={i} className={a.followedId ? "text-accent" : undefined}>
              {a.name}
              {i < paper.authors.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg/90">{paper.abstract}</p>
      </section>

      <div className="flex flex-wrap items-center gap-3 pb-4">
        {paper.biteStatus === "ok" && paper.bite.glossary.length > 0 && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2.5 text-sm font-semibold text-canvas"
          >
            <Icons.Brain size={16} /> Play this paper
          </button>
        )}
        <Link
          href={`/read/?id=${encodeURIComponent(paper.id)}`}
          className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent"
        >
          Read in app
        </Link>
        <a
          href={paper.links.pdf}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-muted underline underline-offset-4"
        >
          PDF
        </a>
      </div>

      <TermSheet entry={term} paper={paper} onClose={() => setTerm(null)} />
      {playing && <PaperGame detail={paper} onClose={() => setPlaying(false)} />}
    </main>
  );
}

export default function PaperPage() {
  return (
    <Suspense>
      <PaperInner />
    </Suspense>
  );
}
