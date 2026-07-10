"use client";

// Concept library: every term you've tapped-and-saved, grouped by how well
// you know it. The Review button is the daily 90-second snack.

import Link from "next/link";
import { useState } from "react";
import { useStoreVersion } from "@/lib/hooks";
import {
  type ConceptEntry,
  getConcepts,
  getDueConcepts,
  removeConcept,
} from "@/lib/store";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icons } from "@/components/ui/icons";
import { PageShell } from "@/components/ui/PageShell";

const GROUPS: Array<{ label: string; match: (box: number) => boolean }> = [
  { label: "Learning", match: (b) => b <= 2 },
  { label: "Solid", match: (b) => b === 3 },
  { label: "Mastered", match: (b) => b >= 4 },
];

export default function ConceptsPage() {
  useStoreVersion();
  const [open, setOpen] = useState<[string, ConceptEntry] | null>(null);
  const concepts = Object.entries(getConcepts()).sort(
    (a, b) => b[1].addedAt - a[1].addedAt,
  );
  const due = getDueConcepts().length;

  return (
    <PageShell
      title="Concepts"
      action={
        <Link
          href="/concepts/review"
          aria-disabled={due === 0}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            due > 0
              ? "bg-gradient-to-r from-accent to-accent-2 text-canvas"
              : "pointer-events-none border border-border text-muted"
          }`}
        >
          {due > 0 ? `Review ${due > 9 ? "9+" : due} due` : "Nothing due"}
        </Link>
      }
    >
      {concepts.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Tap any <span className="term-btn">underlined term</span> in a paper,
          then &ldquo;Save to Concepts&rdquo; — your personal glossary builds
          itself.
        </p>
      )}

      {GROUPS.map(({ label, match }) => {
        const group = concepts.filter(([, c]) => match(c.srs.box));
        if (!group.length) return null;
        return (
          <section key={label}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
              {label} · {group.length}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {group.map(([slug, c]) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setOpen([slug, c])}
                  className="rounded-xl border border-border bg-surface p-3 text-left transition hover:border-accent/50"
                >
                  <p className="font-mono text-sm font-semibold text-accent">{c.term}</p>
                  <p className="mt-1 text-xs leading-snug text-muted [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                    {c.shortDef}
                  </p>
                  <p className="mt-2 tracking-widest text-[9px] text-muted">
                    <span className="text-accent">{"■".repeat(Math.min(c.srs.box, 3))}</span>
                    {"□".repeat(Math.max(0, 3 - c.srs.box))}
                    {c.srs.box >= 4 && <span className="ml-1 text-gold">★</span>}
                  </p>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <BottomSheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={<span className="font-mono text-accent">{open?.[1].term}</span>}
        footer={
          open && (
            <button
              type="button"
              onClick={() => {
                removeConcept(open[0]);
                setOpen(null);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm text-muted transition hover:text-fg"
            >
              <Icons.Trash size={16} /> Remove from library
            </button>
          )
        }
      >
        {open && (
          <div className="flex flex-col gap-3 pb-1">
            <p className="text-[15px] leading-relaxed">{open[1].shortDef}</p>
            {open[1].eli5Def && (
              <p className="text-sm leading-relaxed text-fg/80">{open[1].eli5Def}</p>
            )}
            {open[1].paperHook && (
              <p className="text-xs text-muted">
                from <span className="italic">{open[1].paperHook}</span>
              </p>
            )}
          </div>
        )}
      </BottomSheet>
    </PageShell>
  );
}
