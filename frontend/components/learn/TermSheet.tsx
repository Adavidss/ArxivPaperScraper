"use client";

// The tap-to-learn loop, kept under 5 seconds: tap a term → short definition
// → optional ELI5 → save to Concepts (one tap, auto-dismiss) or pull the
// Wikipedia summary inline. The card behind never moves.

import { useEffect, useState } from "react";
import type { GlossaryEntry, PaperDetail } from "@/lib/data-schema";
import { bumpEncounter, conceptSlug, getConcepts, saveConcept } from "@/lib/store";
import { fetchWikiSummary, wikiSearchUrl, type WikiSummary } from "@/lib/wiki";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { TermDrill } from "@/components/games/TermDrill";
import { Icons } from "@/components/ui/icons";

export function TermSheet({
  entry,
  paper,
  onClose,
}: {
  entry: GlossaryEntry | null;
  paper: PaperDetail | null;
  onClose: () => void;
}) {
  const [eli5Open, setEli5Open] = useState(false);
  const [savedNow, setSavedNow] = useState(false);
  const [wiki, setWiki] = useState<WikiSummary | null | "loading" | "miss">(null);
  const [encounters, setEncounters] = useState(0);
  const [drill, setDrill] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setEli5Open(false);
    setSavedNow(false);
    setDrill(false);
    setWiki(null);
    setEncounters(bumpEncounter(entry.term));
    // Wikipedia mode (selection "Define"): no precomputed definition — the
    // article summary IS the definition, so fetch it immediately.
    if (!entry.shortDef && entry.wikiTitle) {
      setWiki("loading");
      fetchWikiSummary(entry.wikiTitle).then((w) => setWiki(w ?? "miss"));
    }
  }, [entry]);

  if (!entry) return null;
  const inLibrary = savedNow || Boolean(getConcepts()[conceptSlug(entry.term)]);

  const save = () => {
    const wikiFirstSentence =
      wiki && wiki !== "loading" && wiki !== "miss"
        ? `${wiki.extract.split(". ")[0]}.`
        : "";
    saveConcept({
      term: entry.term,
      shortDef: entry.shortDef || wikiFirstSentence || entry.term,
      eli5Def: entry.eli5Def,
      wikiTitle: entry.wikiTitle,
      paperId: paper?.id ?? "",
      paperHook: paper?.bite.hook,
    });
    setSavedNow(true);
    setTimeout(onClose, 450);
  };

  const loadWiki = async () => {
    setWiki("loading");
    // Prefer the pipeline's exact title, but fall back to the term itself —
    // wikiTitle is sometimes null even when an article exists.
    const result = await fetchWikiSummary(entry.wikiTitle || entry.term);
    setWiki(result ?? "miss");
  };

  if (drill) {
    return (
      <TermDrill
        entry={entry}
        paper={paper}
        onClose={() => {
          setDrill(false);
          onClose();
        }}
      />
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={<span className="font-mono text-accent">{entry.term}</span>}
      footer={
        <div className="flex items-center gap-2">
          {entry.shortDef ? (
            <button
              type="button"
              onClick={() => setDrill(true)}
              className="flex-1 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2.5 text-sm font-semibold text-canvas"
            >
              ▶ Play to learn
            </button>
          ) : (
            <button
              type="button"
              onClick={save}
              disabled={inLibrary}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                inLibrary
                  ? "border border-data/40 bg-data/10 text-data"
                  : "bg-gradient-to-r from-accent to-accent-2 text-canvas"
              }`}
            >
              {inLibrary ? "In your library ✓" : "+ Save to Concepts"}
            </button>
          )}
          {entry.shortDef && (
            <button
              type="button"
              onClick={save}
              disabled={inLibrary}
              aria-label={inLibrary ? "In your library" : "Save to Concepts"}
              className={`rounded-xl border px-3 py-2.5 text-sm transition ${
                inLibrary
                  ? "border-data/40 bg-data/10 text-data"
                  : "border-border text-muted hover:text-fg"
              }`}
            >
              {inLibrary ? "✓" : "+ Save"}
            </button>
          )}
          <button
            type="button"
            onClick={loadWiki}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted transition hover:text-fg"
          >
            Wikipedia
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pb-1">
        <p className="text-[15px] leading-relaxed">{entry.shortDef}</p>

        {entry.eli5Def && (
          <>
            <button
              type="button"
              onClick={() => setEli5Open((o) => !o)}
              className="flex items-center gap-1 self-start text-xs font-bold uppercase tracking-widest text-accent"
            >
              Like you&apos;re five
              <Icons.ChevronDown
                size={14}
                className={`transition-transform ${eli5Open ? "rotate-180" : ""}`}
              />
            </button>
            {eli5Open && (
              <p className="animate-fade-in text-[15px] leading-relaxed text-fg/90">
                {entry.eli5Def}
              </p>
            )}
          </>
        )}

        {encounters >= 3 && !inLibrary && (
          <p className="text-xs text-gold">
            You&apos;ve now met &ldquo;{entry.term}&rdquo; {encounters} times — worth keeping?
          </p>
        )}

        {wiki === "loading" && (
          <div className="h-14 animate-pulse rounded-lg bg-surface-2" />
        )}
        {wiki === "miss" && (
          <div className="animate-fade-in rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-sm text-muted">
              No Wikipedia article matches this exact phrase.
            </p>
            <a
              href={wikiSearchUrl(entry.term)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-accent"
            >
              Search Wikipedia <Icons.External size={12} />
            </a>
          </div>
        )}
        {wiki && wiki !== "loading" && wiki !== "miss" && (
          <div className="animate-fade-in rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-sm leading-relaxed text-fg/90">{wiki.extract}</p>
            <a
              href={wiki.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-accent"
            >
              Open on Wikipedia <Icons.External size={12} />
            </a>
          </div>
        )}

        {paper && (
          <p className="text-xs text-muted">
            from <span className="italic">{paper.bite.hook}</span>
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
