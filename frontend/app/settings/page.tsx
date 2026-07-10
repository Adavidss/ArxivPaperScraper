"use client";

// Settings: follows/keywords/discovery/pipeline editors (always editable —
// with a PAT changes sync straight to GitHub; without one they queue locally
// and a one-tap "Apply on GitHub" flow copies the finished follows.json into
// the web editor), appearance, backup, and pipeline status.

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFollows, loadMeta } from "@/lib/api";
import type { FollowedAuthor, FollowsFile, MetaFile } from "@/lib/data-schema";
import {
  applyOps,
  authorSlug,
  dispatchDigest,
  type FollowOp,
  syncFollowOps,
  validatePat,
} from "@/lib/github";
import { useDrop, useMounted, useStoreVersion } from "@/lib/hooks";
import {
  exportBackup,
  getSettings,
  getSync,
  importBackup,
  updateSettings,
  updateSync,
} from "@/lib/store";
import { applyTheme, DEFAULT_THEME, THEMES, type ThemeId } from "@/lib/theme";
import { Icons } from "@/components/ui/icons";
import { PageShell } from "@/components/ui/PageShell";

const REPO_URL = "https://github.com/Adavidss/ArxivPaperScraper";
const EDIT_URL = `${REPO_URL}/edit/main/data/follows.json`;
// Classic token with repo scope covers contents + workflow dispatch — one
// click, generate, paste. (Fine-grained works too; instructions below.)
const NEW_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=Daily%20Drop%20sync";

type SyncStatus =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "polling"; sinceBuildId: string; label: string }
  | { kind: "ok"; label: string }
  | { kind: "error"; label: string };

const getPendingOps = () => (getSync().pendingFollowOps ?? []) as FollowOp[];

export default function SettingsPage() {
  useStoreVersion();
  const mounted = useMounted();
  const drop = useDrop();
  const [follows, setFollows] = useState<FollowsFile | null>(null);
  const [status, setStatus] = useState<SyncStatus>({ kind: "idle" });
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [patInput, setPatInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [categoriesInput, setCategoriesInput] = useState("");
  const [editingCategories, setEditingCategories] = useState(false);
  const [pipe, setPipe] = useState({ lookbackDays: "", maxPerAuthor: "", forYouPerDay: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const settings = getSettings();
  const pat = settings.pat;
  const theme = (settings.theme as ThemeId) || DEFAULT_THEME;
  const pendingCount = getPendingOps().length;

  // Load the published follows and replay any locally-queued edits on top so
  // the page always shows what the user intends.
  useEffect(() => {
    loadFollows()
      .then((f) => {
        const withPending = applyOps(f, getPendingOps());
        setFollows(withPending);
        setPipe({
          lookbackDays: String(withPending.settings.lookbackDays),
          maxPerAuthor: String(withPending.settings.maxPerAuthor),
          forYouPerDay: String(withPending.settings.forYouPerDay),
        });
      })
      .catch(() => setFollows(null));
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

  /**
   * Apply edits: optimistic UI always; with a PAT push to GitHub, without one
   * queue the ops locally for the "Apply on GitHub" flow (or a later connect).
   */
  const runOps = async (ops: FollowOp[], optimistic: (f: FollowsFile) => FollowsFile) => {
    setFollows((f) => (f ? optimistic(f) : f));
    if (!pat) {
      updateSync({ pendingFollowOps: [...getPendingOps(), ...ops] });
      setStatus({
        kind: "ok",
        label: "Saved here — apply it on GitHub below (or connect sync) to take effect",
      });
      return;
    }
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
      updateSync({ pendingFollowOps: [...getPendingOps(), ...ops] });
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

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    setKeywordInput("");
    void runOps([{ op: "add-keyword", keyword: kw }], (f) => ({
      ...f,
      keywords: [...(f.keywords ?? []), kw],
    }));
  };

  const saveCategories = () => {
    const cats = categoriesInput
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    setEditingCategories(false);
    void runOps([{ op: "set-categories", categories: cats }], (f) => ({
      ...f,
      extraCategories: cats,
    }));
  };

  const savePipeline = () => {
    const clamp = (v: string, lo: number, hi: number, dflt: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : dflt;
    };
    const next = {
      lookbackDays: clamp(pipe.lookbackDays, 3, 365, 60),
      maxPerAuthor: clamp(pipe.maxPerAuthor, 5, 100, 25),
      forYouPerDay: clamp(pipe.forYouPerDay, 0, 20, 6),
    };
    setPipe({
      lookbackDays: String(next.lookbackDays),
      maxPerAuthor: String(next.maxPerAuthor),
      forYouPerDay: String(next.forYouPerDay),
    });
    void runOps([{ op: "set-settings", settings: next }], (f) => ({
      ...f,
      settings: { ...f.settings, ...next },
    }));
  };

  const retryPending = () => {
    const pending = getPendingOps();
    if (!pending.length || !pat) return;
    updateSync({ pendingFollowOps: [] });
    void runOps(pending, (f) => f);
  };

  /** No-PAT apply: copy the finished follows.json, open the GitHub editor. */
  const applyOnGitHub = () => {
    if (!follows) return;
    navigator.clipboard
      ?.writeText(`${JSON.stringify(follows, null, 1)}\n`)
      .catch(() => {});
    window.open(EDIT_URL, "_blank", "noopener");
    setStatus({
      kind: "ok",
      label: "JSON copied — select everything in the editor, paste, commit",
    });
  };

  // PAT/theme branches derive from localStorage — never prerender them.
  if (!mounted) return <PageShell title="Settings">{null}</PageShell>;

  const pipeDirty =
    follows &&
    (pipe.lookbackDays !== String(follows.settings.lookbackDays) ||
      pipe.maxPerAuthor !== String(follows.settings.maxPerAuthor) ||
      pipe.forYouPerDay !== String(follows.settings.forYouPerDay));

  const inputCls =
    "rounded-lg border border-border bg-canvas px-3 py-2 text-fg placeholder:text-muted focus:border-accent focus:outline-none";

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

      {/* Pending edits (no PAT yet) */}
      {pendingCount > 0 && !pat && (
        <div className="rounded-2xl border border-gold/40 bg-surface p-4">
          <p className="text-sm font-medium text-gold">
            {pendingCount} change{pendingCount === 1 ? "" : "s"} saved on this
            device — not live yet
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Apply them by pasting the updated follows.json on GitHub, or
            connect sync below and they push automatically.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyOnGitHub}
              className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-2 text-sm font-semibold text-canvas"
            >
              Copy JSON &amp; open GitHub
            </button>
            <button
              type="button"
              onClick={() => {
                updateSync({ pendingFollowOps: [] });
                setStatus({ kind: "ok", label: "Queue cleared" });
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-fg"
            >
              Mark applied / discard
            </button>
          </div>
        </div>
      )}
      {pendingCount > 0 && pat && (
        <button
          type="button"
          onClick={retryPending}
          className="w-full rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold"
        >
          {pendingCount} queued edit{pendingCount === 1 ? "" : "s"} — tap to sync
        </button>
      )}

      {/* Follows */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
            Followed authors
          </h2>
          <button
            type="button"
            onClick={() => setShowAdd((s) => !s)}
            className="flex items-center gap-1 rounded-lg border border-accent/40 px-2.5 py-1 text-xs font-medium text-accent"
          >
            <Icons.Plus size={14} /> Follow
          </button>
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
              className={inputCls}
            />
            <input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Aliases, comma-separated (R. Walsworth, …)"
              className={inputCls}
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
              Follow
            </button>
          </div>
        )}
      </section>

      {/* Keywords */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
          Followed keywords
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          Each keyword is searched daily as an exact phrase — its new papers
          join your drop alongside your authors&apos;.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(follows?.keywords ?? []).map((kw) => (
            <span
              key={kw}
              className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent"
            >
              #{kw}
              <button
                type="button"
                aria-label={`Unfollow keyword ${kw}`}
                onClick={() =>
                  runOps([{ op: "remove-keyword", keyword: kw }], (f) => ({
                    ...f,
                    keywords: (f.keywords ?? []).filter((k) => k !== kw),
                  }))
                }
                className="-mr-1 rounded-full p-0.5 opacity-70 transition hover:opacity-100"
              >
                <Icons.X size={12} />
              </button>
            </span>
          ))}
          {follows && (follows.keywords ?? []).length === 0 && (
            <span className="text-xs text-muted">none yet</span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            placeholder="e.g. quantum sensing"
            className={`min-w-0 flex-1 ${inputCls}`}
          />
          <button
            type="button"
            onClick={addKeyword}
            disabled={!keywordInput.trim()}
            className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent disabled:opacity-40"
          >
            Follow
          </button>
        </div>
      </section>

      {/* Discovery */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Discovery</h2>
        <p className="mt-1 text-[11px] text-muted">
          Off unless you say otherwise: discovery papers come ONLY from the
          categories listed here. Leave it empty for a follows-only feed.
        </p>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span>
            Show the For-You tail after the drop
            <span className="block text-[11px] text-muted">
              capped daily, always after the finish line, never a goal
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.showForYou ?? true}
            onChange={(e) => updateSettings({ showForYou: e.target.checked })}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <div className="mt-3">
          {editingCategories ? (
            <div className="flex gap-2">
              <input
                value={categoriesInput}
                onChange={(e) => setCategoriesInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveCategories()}
                placeholder="comma-separated, e.g. quant-ph, cs.LG"
                className={`min-w-0 flex-1 font-mono text-sm placeholder:font-sans ${inputCls}`}
              />
              <button
                type="button"
                onClick={saveCategories}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted">
                Categories:{" "}
                <span className="font-mono text-fg">
                  {follows?.extraCategories.join(", ") || "none (no discovery)"}
                </span>
              </p>
              {follows && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoriesInput(follows.extraCategories.join(", "));
                    setEditingCategories(true);
                  }}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:text-fg"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Pipeline */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Pipeline</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ["lookbackDays", "lookback days"],
              ["maxPerAuthor", "max per query"],
              ["forYouPerDay", "discovery / day"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-[10px] uppercase tracking-wider text-muted">
              {label}
              <input
                type="number"
                inputMode="numeric"
                value={pipe[key]}
                onChange={(e) => setPipe((p) => ({ ...p, [key]: e.target.value }))}
                className={`mt-1 w-full font-mono text-sm ${inputCls}`}
              />
            </label>
          ))}
        </div>
        {pipeDirty && (
          <button
            type="button"
            onClick={savePipeline}
            className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
          >
            Save pipeline settings
          </button>
        )}
      </section>

      {/* Appearance */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Appearance</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={theme === t.id}
              onClick={() => {
                updateSettings({ theme: t.id });
                applyTheme(t.id);
              }}
              className={`rounded-xl border p-3 text-left transition ${
                theme === t.id ? "border-accent bg-accent/10" : "border-border"
              }`}
            >
              <span
                className="mb-2 flex h-6 w-full overflow-hidden rounded-md border border-border"
                aria-hidden
              >
                {(t.id === "mono-dark"
                  ? ["#000", "#f2f2f2", "#969696"]
                  : t.id === "mono-light"
                    ? ["#fff", "#141414", "#6e6e6e"]
                    : ["#0a0a12", "#00d2ff", "#ffc107"]
                ).map((c) => (
                  <span key={c} className="h-full flex-1" style={{ background: c }} />
                ))}
              </span>
              <span className="block text-xs font-semibold">{t.label}</span>
              <span className="block text-[10px] text-muted">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* GitHub sync */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
          GitHub sync {pat && <span className="text-data">· connected</span>}
        </h2>
        {!pat ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-[11px] text-muted">
              Optional but nice: with a token, every edit above commits and
              rebuilds your feed automatically.
            </p>
            <a
              href={NEW_TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 self-start rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
            >
              Create a token (1 click) <Icons.External size={13} />
            </a>
            <input
              type="password"
              value={patInput}
              onChange={(e) => setPatInput(e.target.value)}
              placeholder="Paste token here"
              className={`font-mono text-sm placeholder:font-sans ${inputCls}`}
            />
            <details className="text-[11px] text-muted">
              <summary className="cursor-pointer text-accent">
                Prefer a fine-grained token?
              </summary>
              <ol className="mt-1 list-decimal pl-4 leading-relaxed">
                <li>GitHub → Settings → Developer settings → Fine-grained tokens</li>
                <li>Repository access: only ArxivPaperScraper</li>
                <li>Permissions: Contents Read&amp;Write, Actions Read&amp;Write</li>
                <li>Either way, the token stays in this browser&apos;s localStorage.</li>
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
                  setStatus({ kind: "ok", label: "Connected — queued edits will sync" });
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
