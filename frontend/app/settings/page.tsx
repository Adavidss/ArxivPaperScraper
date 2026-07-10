"use client";

// Settings: follows editor (PAT-synced to data/follows.json in the repo),
// For-You preferences, GitHub connection, backup, and pipeline status.

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFollows, loadMeta } from "@/lib/api";
import type { FollowedAuthor, FollowsFile, MetaFile } from "@/lib/data-schema";
import {
  authorSlug,
  dispatchDigest,
  type FollowOp,
  syncFollowOps,
  validatePat,
} from "@/lib/github";
import { useDrop, useStoreVersion } from "@/lib/hooks";
import {
  exportBackup,
  getSettings,
  getSync,
  importBackup,
  updateSettings,
  updateSync,
} from "@/lib/store";
import { Icons } from "@/components/ui/icons";
import { PageShell } from "@/components/ui/PageShell";

const REPO_URL = "https://github.com/Adavidss/ArxivPaperScraper";

type SyncStatus =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "polling"; sinceBuildId: string; label: string }
  | { kind: "ok"; label: string }
  | { kind: "error"; label: string };

export default function SettingsPage() {
  useStoreVersion();
  const drop = useDrop();
  const [follows, setFollows] = useState<FollowsFile | null>(null);
  const [status, setStatus] = useState<SyncStatus>({ kind: "idle" });
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [patInput, setPatInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const settings = getSettings();
  const pat = settings.pat;

  useEffect(() => {
    loadFollows().then(setFollows).catch(() => setFollows(null));
  }, []);

  // Papers matched per followed author (from the published window).
  const matchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of drop.feed?.items ?? [])
      for (const id of item.followedIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [drop.feed]);

  // Poll meta.json for a new buildId after a sync/dispatch (~2-5 min).
  useEffect(() => {
    if (status.kind !== "polling") return;
    const t = setInterval(async () => {
      try {
        const meta: MetaFile = await loadMeta();
        if (meta.buildId !== status.sinceBuildId) {
          setStatus({ kind: "ok", label: "Fresh data deployed — pull the feed to refresh" });
        }
      } catch {
        /* keep polling */
      }
    }, 20_000);
    const stop = setTimeout(() => setStatus({ kind: "idle" }), 8 * 60_000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [status]);

  const runOps = async (ops: FollowOp[], optimistic: (f: FollowsFile) => FollowsFile) => {
    if (!pat) return;
    setFollows((f) => (f ? optimistic(f) : f));
    setStatus({ kind: "working", label: "Committing to GitHub…" });
    try {
      const next = await syncFollowOps(pat, ops);
      setFollows(next);
      setStatus({
        kind: "polling",
        sinceBuildId: drop.meta?.buildId ?? "",
        label: "Committed — rebuilding your feed (~3 min)",
      });
    } catch (e) {
      const pending = (getSync().pendingFollowOps ?? []) as FollowOp[];
      updateSync({ pendingFollowOps: [...pending, ...ops] });
      setStatus({ kind: "error", label: `${(e as Error).message} — queued for retry` });
    }
  };

  const addAuthor = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const author: FollowedAuthor = {
      id: authorSlug(trimmed),
      name: trimmed,
      aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
    };
    setName("");
    setAliases("");
    setShowAdd(false);
    void runOps([{ op: "add-author", author }], (f) => ({
      ...f,
      authors: [...f.authors, author],
    }));
  };

  const retryPending = () => {
    const pending = (getSync().pendingFollowOps ?? []) as FollowOp[];
    if (!pending.length || !pat) return;
    updateSync({ pendingFollowOps: [] });
    void runOps(pending, (f) => f);
  };

  const pendingCount = ((getSync().pendingFollowOps ?? []) as FollowOp[]).length;
  const authorSnippet = JSON.stringify(
    { id: "author-slug", name: "Full Name", aliases: ["F. Name", "Full M. Name"] },
    null,
    1,
  );

  return (
    <PageShell title="Settings">
      {/* Status pill */}
      {status.kind !== "idle" && (
        <p
          className={`rounded-xl border px-3 py-2 text-xs ${
            status.kind === "error"
              ? "border-gold/40 text-gold"
              : status.kind === "ok"
                ? "border-data/40 text-data"
                : "border-accent/40 text-accent"
          }`}
        >
          {status.kind === "working" || status.kind === "polling" ? "⟳ " : ""}
          {status.label}
        </p>
      )}

      {/* Follows */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
            Followed authors
          </h2>
          {pat && (
            <button
              type="button"
              onClick={() => setShowAdd((s) => !s)}
              className="flex items-center gap-1 rounded-lg border border-accent/40 px-2.5 py-1 text-xs font-medium text-accent"
            >
              <Icons.Plus size={14} /> Follow
            </button>
          )}
        </div>

        <ul className="mt-3 flex flex-col gap-2">
          {(follows?.authors ?? []).map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.name}</p>
                <p className="truncate text-[11px] text-muted">
                  {a.aliases.length ? a.aliases.join(" · ") : "no aliases"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] ${
                  matchCounts.get(a.id)
                    ? "bg-accent/10 text-accent"
                    : "bg-gold/10 text-gold"
                }`}
                title={
                  matchCounts.get(a.id)
                    ? "papers in the current window"
                    : "0 matches — check spelling/aliases, or they haven't posted recently"
                }
              >
                {matchCounts.get(a.id) ?? 0} papers
              </span>
              {pat && (
                <button
                  type="button"
                  aria-label={`Unfollow ${a.name}`}
                  onClick={() =>
                    runOps([{ op: "remove-author", id: a.id }], (f) => ({
                      ...f,
                      authors: f.authors.filter((x) => x.id !== a.id),
                    }))
                  }
                  className="shrink-0 rounded-lg p-1.5 text-muted transition hover:text-fg"
                >
                  <Icons.X size={16} />
                </button>
              )}
            </li>
          ))}
          {follows === null && (
            <li className="h-12 animate-pulse rounded-xl bg-surface-2" />
          )}
        </ul>

        {showAdd && (
          <div className="mt-3 flex animate-fade-in flex-col gap-2 rounded-xl border border-accent/30 bg-surface-2 p-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name, e.g. Ronald Walsworth"
              className="rounded-lg border border-border bg-canvas px-3 py-2 text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Aliases, comma-separated (R. Walsworth, …)"
              className="rounded-lg border border-border bg-canvas px-3 py-2 text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <p className="text-[11px] text-muted">
              arXiv matches exact strings — add the name variants they publish
              under. Papers appear after the next refresh.
            </p>
            <button
              type="button"
              onClick={addAuthor}
              disabled={!name.trim()}
              className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-2 text-sm font-semibold text-canvas disabled:opacity-40"
            >
              Follow &amp; sync
            </button>
          </div>
        )}

        {!pat && (
          <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted">
            <p>
              Connect GitHub below to follow/unfollow from here — or edit{" "}
              <a
                className="text-accent underline underline-offset-2"
                href={`${REPO_URL}/edit/main/data/follows.json`}
                target="_blank"
                rel="noreferrer"
              >
                follows.json on GitHub
              </a>
              .
            </p>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(authorSnippet)}
              className="mt-2 rounded-lg border border-border px-2.5 py-1.5 text-xs transition hover:text-fg"
            >
              Copy author JSON snippet
            </button>
          </div>
        )}

        {pendingCount > 0 && pat && (
          <button
            type="button"
            onClick={retryPending}
            className="mt-3 w-full rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold"
          >
            {pendingCount} queued edit{pendingCount === 1 ? "" : "s"} — tap to retry
          </button>
        )}
      </section>

      {/* For-You */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Discovery</h2>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span>
            For-You tail after the drop
            <span className="block text-[11px] text-muted">
              a few fresh papers from your categories — capped daily, never a goal
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.showForYou ?? true}
            onChange={(e) => updateSettings({ showForYou: e.target.checked })}
            className="h-5 w-5 accent-[#00d2ff]"
          />
        </label>
        {follows && (
          <p className="mt-3 text-[11px] text-muted">
            Extra categories: {follows.extraCategories.join(", ") || "none"} —
            inferred categories come from your follows&apos; recent papers.
          </p>
        )}
      </section>

      {/* GitHub sync */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
          GitHub sync {pat && <span className="text-data">· connected</span>}
        </h2>
        {!pat ? (
          <div className="mt-3 flex flex-col gap-2">
            <input
              type="password"
              value={patInput}
              onChange={(e) => setPatInput(e.target.value)}
              placeholder="Fine-grained personal access token"
              className="rounded-lg border border-border bg-canvas px-3 py-2 font-mono text-sm text-fg placeholder:font-sans placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <details className="text-[11px] text-muted">
              <summary className="cursor-pointer text-accent">How to create one</summary>
              <ol className="mt-1 list-decimal pl-4 leading-relaxed">
                <li>GitHub → Settings → Developer settings → Fine-grained tokens</li>
                <li>Repository access: only ArxivPaperScraper</li>
                <li>Permissions: Contents Read&amp;Write, Actions Read&amp;Write</li>
                <li>The token stays in this browser&apos;s localStorage only.</li>
              </ol>
            </details>
            <button
              type="button"
              disabled={!patInput.trim()}
              onClick={async () => {
                setStatus({ kind: "working", label: "Checking token…" });
                if (await validatePat(patInput.trim())) {
                  updateSettings({ pat: patInput.trim() });
                  setPatInput("");
                  setStatus({ kind: "ok", label: "Connected" });
                } else {
                  setStatus({ kind: "error", label: "Token can't access the repo" });
                }
              }}
              className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-2 text-sm font-semibold text-canvas disabled:opacity-40"
            >
              Connect
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setStatus({ kind: "working", label: "Dispatching pipeline…" });
                try {
                  await dispatchDigest(pat);
                  setStatus({
                    kind: "polling",
                    sinceBuildId: drop.meta?.buildId ?? "",
                    label: "Pipeline running — fresh data in ~3-5 min",
                  });
                } catch (e) {
                  setStatus({ kind: "error", label: (e as Error).message });
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
            >
              <Icons.Refresh size={15} /> Refresh now
            </button>
            <a
              href={`${REPO_URL}/actions`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-fg"
            >
              View pipeline runs
            </a>
            <button
              type="button"
              onClick={() => updateSettings({ pat: undefined })}
              className="ml-auto rounded-lg px-3 py-2 text-sm text-muted transition hover:text-fg"
            >
              Disconnect
            </button>
          </div>
        )}
      </section>

      {/* Data */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Data</h2>
        {drop.meta && (
          <p className="mt-2 text-[11px] text-muted">
            {drop.meta.paperCount} papers · updated{" "}
            {new Date(drop.meta.lastUpdated).toLocaleString()} · pipeline{" "}
            {drop.meta.lastRunStatus}
            {drop.meta.pendingBites > 0 &&
              ` · ${drop.meta.pendingBites} summaries upgrading overnight`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([exportBackup()], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `daily-drop-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-fg"
          >
            Export backup
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-fg"
          >
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                importBackup(await file.text());
                setStatus({ kind: "ok", label: "Backup imported" });
              } catch {
                setStatus({ kind: "error", label: "Invalid backup file" });
              }
              e.target.value = "";
            }}
          />
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-muted">
          Reads, saves, concepts and streaks live only on this device (and in
          backups — tokens are never exported). Follow list and summaries are
          public on the Pages site.
        </p>
      </section>
    </PageShell>
  );
}
