"use client";

// Renders bite text with glossary terms as tappable dotted-underline buttons.
// Only the FIRST occurrence of each term (per TermText block) is highlighted —
// repeated underlines read as noise.

import { useMemo } from "react";
import type { GlossaryEntry } from "@/lib/data-schema";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function TermText({
  text,
  glossary,
  onTerm,
  className,
}: {
  text: string;
  glossary: GlossaryEntry[];
  onTerm: (entry: GlossaryEntry) => void;
  className?: string;
}) {
  const parts = useMemo(() => {
    if (!glossary.length) return [text];
    // Longest terms first so "NV center" wins over "NV".
    const terms = [...glossary].sort((a, b) => b.term.length - a.term.length);
    const re = new RegExp(
      `\\b(${terms.map((t) => escapeRe(t.term)).join("|")})\\b`,
      "gi",
    );
    const out: Array<string | GlossaryEntry> = [];
    const seen = new Set<string>();
    let last = 0;
    for (const m of text.matchAll(re)) {
      const entry = terms.find((t) => t.term.toLowerCase() === m[0].toLowerCase());
      if (!entry || seen.has(entry.term.toLowerCase())) continue;
      seen.add(entry.term.toLowerCase());
      out.push(text.slice(last, m.index), { ...entry, term: m[0] });
      last = (m.index ?? 0) + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }, [text, glossary]);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <button
            key={i}
            type="button"
            className="term-btn -my-2 py-2 text-inherit"
            onClick={(e) => {
              e.stopPropagation();
              onTerm(part);
            }}
          >
            {part.term}
          </button>
        ),
      )}
    </span>
  );
}
