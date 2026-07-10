"use client";

// In-app full-paper reader: arxiv.org/html/<id> is CORS-open, so we fetch the
// LaTeXML render directly, strip scripts, absolutize asset URLs, and restyle
// it with our own dark reader CSS. Older papers without an HTML render fall
// back to abs/PDF links.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { markDepth, markRead } from "@/lib/store";
import { Icons } from "@/components/ui/icons";

type ReaderState =
  | { kind: "loading" }
  | { kind: "ok"; html: string; title: string }
  | { kind: "missing" };

function absolutize(doc: Document, baseUrl: string) {
  for (const el of doc.querySelectorAll("[src]"))
    el.setAttribute("src", new URL(el.getAttribute("src") ?? "", baseUrl).href);
  for (const el of doc.querySelectorAll("a[href]")) {
    const href = el.getAttribute("href") ?? "";
    if (!href.startsWith("#"))
      el.setAttribute("href", new URL(href, baseUrl).href);
    el.setAttribute("target", "_blank");
  }
}

function ReaderInner() {
  const id = useSearchParams().get("id");
  const [state, setState] = useState<ReaderState>({ kind: "loading" });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `https://arxiv.org/html/${id}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("no html");
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        doc.querySelectorAll("script, style, link, header, nav, footer").forEach((n) => n.remove());
        for (const el of doc.querySelectorAll("*"))
          for (const attr of [...el.attributes])
            if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
        absolutize(doc, `${url}/`);
        const article = doc.querySelector("article") ?? doc.body;
        if (cancelled) return;
        setState({
          kind: "ok",
          html: article.innerHTML,
          title: doc.querySelector("h1")?.textContent?.trim() ?? id,
        });
        markRead(id);
        markDepth(id, 3, true);
      } catch {
        if (!cancelled) setState({ kind: "missing" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id)
    return (
      <p className="p-8 text-center text-sm text-muted">No paper id given.</p>
    );

  return (
    <div className="min-h-dvh pb-16">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-canvas/95 px-3 py-2 backdrop-blur pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/" aria-label="Back to feed" className="rounded-lg p-2 text-muted hover:text-fg">
          <Icons.ChevronRight size={18} className="rotate-180" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm text-muted">
          {state.kind === "ok" ? state.title : id}
        </p>
        <a
          href={`https://arxiv.org/abs/${id}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on arXiv"
          className="rounded-lg p-2 text-muted hover:text-fg"
        >
          <Icons.External size={18} />
        </a>
      </header>

      {state.kind === "loading" && (
        <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 px-5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-surface" />
          ))}
        </div>
      )}

      {state.kind === "missing" && (
        <div className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-3 px-6 text-center">
          <p className="font-display text-lg font-semibold">
            No HTML version of this paper
          </p>
          <p className="text-sm text-muted">
            Older papers aren&apos;t rendered by arXiv — read it there instead.
          </p>
          <div className="flex gap-3">
            <a
              href={`https://arxiv.org/abs/${id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-canvas"
            >
              Abstract page
            </a>
            <a
              href={`https://arxiv.org/pdf/${id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-border px-4 py-2 text-sm text-muted"
            >
              PDF
            </a>
          </div>
        </div>
      )}

      {state.kind === "ok" && (
        <article
          className="reader-content mx-auto max-w-2xl px-5 py-6"
          dangerouslySetInnerHTML={{ __html: state.html }}
        />
      )}
    </div>
  );
}

export default function ReadPage() {
  return (
    <Suspense>
      <ReaderInner />
    </Suspense>
  );
}
