"use client";

// First-run onboarding: the promise, follow-your-people (instant), and the
// enrichment note. Three screens, skippable.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ensureFollows } from "@/lib/arxiv-live";
import { authorSlug } from "@/lib/github";
import { getFollows, setFollows, updateSettings } from "@/lib/store";
import { Icons } from "@/components/ui/icons";

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    void ensureFollows().then((f) => setNames(f.authors.map((a) => a.name)));
  }, []);

  const addName = () => {
    const trimmed = name.trim();
    if (!trimmed || names.includes(trimmed)) return;
    setNames((n) => [...n, trimmed]);
    setName("");
    const follows = getFollows() ?? { authors: [], keywords: [], categories: [] };
    if (!follows.authors.some((a) => a.id === authorSlug(trimmed))) {
      setFollows({
        ...follows,
        authors: [
          ...follows.authors,
          { id: authorSlug(trimmed), name: trimmed, aliases: [] },
        ],
      });
    }
  };

  const finish = () => {
    updateSettings({ onboarded: true });
    router.replace("/");
  };

  return (
    <main className="fixed inset-0 z-40 flex flex-col bg-canvas px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-accent" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
        <button type="button" onClick={finish} className="text-sm text-muted">
          Skip
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 text-center">
        {step === 0 && (
          <>
            <h1 className="text-gradient-brand font-display text-5xl font-semibold">
              Daily Drop
            </h1>
            <p className="max-w-xs text-[15px] leading-relaxed text-fg/90">
              A live stream of new papers from the people and topics you
              follow — scroll it like a feed, learn the hard terms in one tap,
              and it <span className="text-accent">ends</span> when you&apos;re
              caught up.
            </p>
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 text-left text-sm">
              <p className="flex items-center gap-3">
                <span className="w-8 text-center text-lg">↕</span> scroll — the day&apos;s papers
              </p>
              <p className="flex items-center gap-3">
                <span className="w-8 text-center text-lg">👆</span>
                <span>
                  tap <span className="term-btn">underlined terms</span> — learn them
                </span>
              </p>
              <p className="flex items-center gap-3">
                <span className="w-8 text-center text-lg">▸</span> go deeper — bites, ELI5, full paper
              </p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Icons.Cards size={40} className="text-accent" />
            <h2 className="font-display text-2xl font-semibold">Follow your people</h2>
            <p className="max-w-xs text-[15px] leading-relaxed text-fg/90">
              Their papers appear the moment you add them — no waiting, no sync.
            </p>
            <div className="flex w-full max-w-xs gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addName()}
                placeholder="e.g. Ronald Walsworth"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-fg placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={addName}
                disabled={!name.trim()}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent disabled:opacity-40"
              >
                Follow
              </button>
            </div>
            {names.length > 0 && (
              <div className="flex max-w-xs flex-wrap justify-center gap-1.5">
                {names.map((n) => (
                  <span
                    key={n}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent"
                  >
                    ● {n}
                  </span>
                ))}
              </div>
            )}
            <p className="max-w-xs text-xs text-muted">
              Add keywords and discovery topics anytime in Settings.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <Icons.Sparkles size={40} className="text-accent" />
            <h2 className="font-display text-2xl font-semibold">Cards get smarter overnight</h2>
            <p className="max-w-xs text-[15px] leading-relaxed text-fg/90">
              A nightly pipeline writes AI bites, ELI5 explainers, glossaries
              and pulls each paper&apos;s first figure — cards upgrade in
              place. Connect GitHub in Settings if you want it to track your
              follows automatically.
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => (step < 2 ? setStep(step + 1) : finish())}
        className="rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-3.5 font-semibold text-canvas"
      >
        {step < 2 ? "Next" : "Open your feed"}
      </button>
    </main>
  );
}
