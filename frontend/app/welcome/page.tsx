"use client";

// First-run onboarding: the promise, the gesture grammar, follows, and
// optional GitHub sync. Three screens, skippable.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadFollows } from "@/lib/api";
import type { FollowsFile } from "@/lib/data-schema";
import { updateSettings } from "@/lib/store";
import { Icons } from "@/components/ui/icons";

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [follows, setFollows] = useState<FollowsFile | null>(null);

  useEffect(() => {
    loadFollows().then(setFollows).catch(() => null);
  }, []);

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
              Your daily research drop. New papers from the people you follow,
              distilled into bites you can read in under a minute — then it{" "}
              <span className="text-accent">ends</span>. No feed to drown in.
            </p>
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 text-left text-sm">
              <p className="flex items-center gap-3">
                <span className="w-8 text-center text-lg">↑</span> swipe up — next paper
              </p>
              <p className="flex items-center gap-3">
                <span className="w-8 text-center text-lg">←</span> swipe left — go deeper
              </p>
              <p className="flex items-center gap-3">
                <span className="w-8 text-center text-lg">👆</span>
                <span>
                  tap <span className="term-btn">underlined terms</span> — learn them
                </span>
              </p>
              <p className="flex items-center gap-3">
                <span className="w-8 text-center text-lg">👆👆</span> double-tap — save
              </p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Icons.Cards size={40} className="text-accent" />
            <h2 className="font-display text-2xl font-semibold">People, not algorithms</h2>
            <p className="max-w-xs text-[15px] leading-relaxed text-fg/90">
              The pipeline checks arXiv once a day for new papers by your
              followed authors and writes the bites overnight.
            </p>
            {follows && follows.authors.length > 0 && (
              <div className="flex max-w-xs flex-wrap justify-center gap-1.5">
                {follows.authors.map((a) => (
                  <span
                    key={a.id}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent"
                  >
                    ● {a.name}
                  </span>
                ))}
              </div>
            )}
            <p className="max-w-xs text-xs text-muted">
              Follow or unfollow anytime in Settings — changes rebuild your feed
              in about three minutes.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <Icons.Refresh size={40} className="text-accent" />
            <h2 className="font-display text-2xl font-semibold">Sync from your phone</h2>
            <p className="max-w-xs text-[15px] leading-relaxed text-fg/90">
              Optional: paste a fine-grained GitHub token in Settings to
              follow/unfollow from here and trigger refreshes. Without it, you
              can always edit the follow list on GitHub.
            </p>
            <Link
              href="/settings"
              onClick={() => updateSettings({ onboarded: true })}
              className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent"
            >
              Open Settings
            </Link>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => (step < 2 ? setStep(step + 1) : finish())}
        className="rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-3.5 font-semibold text-canvas"
      >
        {step < 2 ? "Next" : "Open today's drop"}
      </button>
    </main>
  );
}
