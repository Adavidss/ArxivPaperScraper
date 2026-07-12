"use client";

// Settings: follows/keywords/discovery edit localStorage and take effect in
// the feed IMMEDIATELY — no repo round-trip. The GitHub section is optional
// enrichment plumbing: with a PAT the app quietly mirrors follows into
// data/follows.json so the nightly pipeline can generate AI bites/figures.

import { useEffect, useRef, useState } from "react";
import { loadFollows, loadSuggestions } from "@/lib/api";
import { ensureFollows } from "@/lib/arxiv-live";
import type { AuthorSuggestion, FollowsFile } from "@/lib/data-schema";
import {
  authorSlug,
  dispatchDigest,
  syncFollowsSnapshot,
  validatePat,
} from "@/lib/github";
import { useDrop, useMounted, useStoreVersion } from "@/lib/hooks";
import {
  type ClientFollows,
  dismissSuggestion,
  exportBackup,
  getDismissedSuggestions,
  getFollows,
  getSettings,
  importBackup,
  setFollows,
  updateSettings,
} from "@/lib/store";
import { applyTheme, DEFAULT_THEME, THEMES, type ThemeId } from "@/lib/theme";
import { Icons } from "@/components/ui/icons";
import { PageShell } from "@/components/ui/PageShell";

const REPO_URL = "https://github.com/Adavidss/ArxivPaperScraper";
const NEW_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=Daily%20Drop%20sync";

type SyncStatus =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "ok"; label: string }
  | { kind: "error"; label: string };

export default function SettingsPage() {
  useStoreVersion();
  const mounted = useMounted();
  const drop = useDrop();
  const [status, setStatus] = useState<SyncStatus>({ kind: "idle" });
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [patInput, setPatInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [categoriesInput, setCategoriesInput] = useState("");
  const [editingCategories, setEditingCategories] = useState(false);
  const [people, setPeople] = useState<AuthorSuggestion[]>([]);
  const [repoDoc, setRepoDoc] = useState<FollowsFile | null>(null);
  const [pipe, setPipe] = useState({ lookbackDays: "", maxPerAuthor: "", forYouPerDay: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settings = getSettings();
  const pat = settings.pat;
  const theme = (settings.theme as ThemeId) || DEFAULT_THEME;
  const follows = mounted ? getFollows() : null;

  useEffect(() => {
    void ensureFollows(); // seed on first visit
    loadSuggestions().then((s) => {
      const hidden = new Set(getDismissedSuggestions());
      setPeople(s.suggestions.filter((x) => !hidden.has(x.slug)));
    });
    loadFollows()
      .then((f) => {
        setRepoDoc(f);
        setPipe({
          lookbackDays: String(f.settings.lookbackDays),
          maxPerAuthor: String(f.settings.maxPerAuthor),
          forYouPerDay: String(f.settings.forYouPerDay),
        });
      })
      .catch(() => setRepoDoc(null));
  }, []);

  /** Apply a follows edit locally (instant) + debounce-mirror to the repo. */
  const applyFollows = (mutate: (f: ClientFollows) => ClientFollows) => {
    const current = getFollows() ?? { authors: [], keywords: [], categories: [] };
    const next = mutate(current);
    setFollows(next);
    if (!pat) return; // feed unaffected; pipeline copy just lags
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      setStatus({ kind: "working", label: "Mirroring to the enrichment pipeline…" });
      syncFollowsSnapshot(pat, next)
        .then(() => setStatus({ kind: "ok", label: "Pipeline copy synced" }))
        .catch((e) =>
          setStatus({ kind: "error", label: `${(e as Error).message} — feed unaffected` }),
        );
    }, 2000);
  };

  const addAuthor = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const author = {
      id: authorSlug(trimmed),
      name: trimmed,
      aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
    };
    setName("");
    setAliases("");
    setShowAdd(false);
    applyFollows((f) => ({
      ...f,
      authors: f.authors.some((a) => a.id === author.id)
        ? f.authors
        : [...f.authors, author],
    }));
  };

  const savePipeline = () => {
    if (!pat) return;
    const clamp = (v: string, lo: number, hi: number, dflt: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : dflt;
    };
    const patch = {
      lookbackDays: clamp(pipe.lookbackDays, 3, 365, 60),
      maxPerAuthor: clamp(pipe.maxPerAuthor, 5, 100, 25),
      forYouPerDay: clamp(pipe.forYouPerDay, 0, 20, 6),
    };
    setPipe({
      lookbackDays: String(patch.lookbackDays),
      maxPerAuthor: String(patch.maxPerAuthor),
      forYouPerDay: String(patch.forYouPerDay),
    });
    setStatus({ kind: "working", label: "Saving pipeline settings…" });
    syncFollowsSnapshot(pat, getFollows() ?? { authors: [], keywords: [], categories: [] }, patch)
      .then(() => setStatus({ kind: "ok", label: "Pipeline settings saved" }))
      .catch((e) => setStatus({ kind: "error", label: (e as Error).message }));
  };

  if (!mounted) return <PageShell title="Settings">{null}</PageShell>;

  const inputCls =
    "rounded-lg border border-border bg-canvas px-3 py-2 text-fg placeholder:text-muted focus:border-accent focus:outline-none";

  return (
    <PageShell title="Settings">
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
          {status.kind === "working" ? "⟳ " : ""}
          {status.label}
        </p>
      )}

      {/* Follows — instant */}
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
        <p className="mt-1 text-[11px] text-muted">
          Changes hit your feed immediately.
        </p>

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
              <button
                type="button"
                aria-label={`Unfollow ${a.name}`}
                onClick={() =>
                  applyFollows((f) => ({
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
          {follows !== null && follows.authors.length === 0 && (
            <li className="text-xs text-muted">no one yet — follow your first author</li>
          )}
          {follows === null && <li className="h-12 animate-pulse rounded-xl bg-surface-2" />}
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
              arXiv matches exact strings — add the name variants they publish under.
            </p>
            <button
              type="button"
              onClick={addAuthor}
              disabled={!name.trim()}
              className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-2 text-sm font-semibold text-canvas disabled:opacity-40"
            >
              Follow — papers appear now
            </button>
          </div>
        )}
      </section>

      {/* Author discovery */}
      {people.length > 0 && (
        <section className="rounded-2xl border border-gem/30 bg-surface p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gem">
            People you might follow
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {people.slice(0, 5).map((s) => (
              <li
                key={s.slug}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="truncate text-[11px] text-muted">
                    {s.coAuthoredWith.length
                      ? `co-author · ${s.paperCount} paper${s.paperCount === 1 ? "" : "s"} together`
                      : s.viaKeywords.length
                        ? `matches #${s.viaKeywords[0]}`
                        : s.viaCategories.join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    dismissSuggestion(s.slug);
                    setPeople((p) => p.filter((x) => x.slug !== s.slug));
                    applyFollows((f) => ({
                      ...f,
                      authors: f.authors.some((a) => a.id === s.slug)
                        ? f.authors
                        : [...f.authors, { id: s.slug, name: s.name, aliases: [] }],
                    }));
                  }}
                  className="shrink-0 rounded-lg border border-gem/40 bg-gem/10 px-2.5 py-1 text-xs font-medium text-gem"
                >
                  + Follow
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss ${s.name}`}
                  onClick={() => {
                    dismissSuggestion(s.slug);
                    setPeople((p) => p.filter((x) => x.slug !== s.slug));
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-muted transition hover:text-fg"
                >
                  <Icons.X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Keywords — instant */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
          Followed keywords
        </h2>
        <p className="mt-1 text-[11px] text-muted">
          Searched live as exact phrases — matches join your stream instantly.
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
                  applyFollows((f) => ({
                    ...f,
                    keywords: f.keywords.filter((k) => k !== kw),
                  }))
                }
                className="-mr-1 rounded-full p-0.5 opacity-70 transition hover:opacity-100"
              >
                <Icons.X size={12} />
              </button>
            </span>
          ))}
          {follows !== null && follows.keywords.length === 0 && (
            <span className="text-xs text-muted">none yet</span>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const kw = keywordInput.trim();
              if (!kw) return;
              setKeywordInput("");
              applyFollows((f) => ({
                ...f,
                keywords: f.keywords.includes(kw) ? f.keywords : [...f.keywords, kw],
              }));
            }}
            placeholder="e.g. quantum sensing"
            className={`min-w-0 flex-1 ${inputCls}`}
          />
          <button
            type="button"
            disabled={!keywordInput.trim()}
            onClick={() => {
              const kw = keywordInput.trim();
              setKeywordInput("");
              applyFollows((f) => ({
                ...f,
                keywords: f.keywords.includes(kw) ? f.keywords : [...f.keywords, kw],
              }));
            }}
            className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent disabled:opacity-40"
          >
            Follow
          </button>
        </div>
      </section>

      {/* Discovery — instant */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Discovery</h2>
        <p className="mt-1 text-[11px] text-muted">
          The stream below your follows comes ONLY from these categories.
          Empty = follows-only feed.
        </p>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span>
            Show discovery after your follows
            <span className="block text-[11px] text-muted">
              always below the line, never the goal
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
                placeholder="comma-separated, e.g. quant-ph, cs.LG"
                className={`min-w-0 flex-1 font-mono text-sm placeholder:font-sans ${inputCls}`}
              />
              <button
                type="button"
                onClick={() => {
                  const cats = categoriesInput
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean);
                  setEditingCategories(false);
                  applyFollows((f) => ({ ...f, categories: cats }));
                }}
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
                  {follows?.categories.join(", ") || "none (no discovery)"}
                </span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setCategoriesInput((follows?.categories ?? []).join(", "));
                  setEditingCategories(true);
                }}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:text-fg"
              >
                Edit
              </button>
            </div>
          )}
        </div>
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

      {/* AI enrichment (GitHub) */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
          AI enrichment {pat && <span className="text-data">· connected</span>}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          The nightly pipeline writes AI summaries, glossaries and figures for
          your follows — cards upgrade automatically. It reads the repo&apos;s
          copy of your follows{pat ? ", which now syncs from here." : "."}
        </p>
        {drop.meta && (
          <p className="mt-2 text-[11px] text-muted">
            {drop.meta.paperCount} papers enriched · updated{" "}
            {new Date(drop.meta.lastUpdated).toLocaleString()}
            {drop.meta.pendingBites > 0 && ` · ${drop.meta.pendingBites} upgrading overnight`}
          </p>
        )}
        {!pat ? (
          <div className="mt-3 flex flex-col gap-2">
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
              placeholder="Paste token to auto-sync follows"
              className={`font-mono text-sm placeholder:font-sans ${inputCls}`}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!patInput.trim()}
                onClick={async () => {
                  setStatus({ kind: "working", label: "Checking token…" });
                  const token = patInput.trim();
                  if (await validatePat(token)) {
                    updateSettings({ pat: token });
                    setPatInput("");
                    setStatus({ kind: "working", label: "Connected — syncing follows…" });
                    try {
                      await syncFollowsSnapshot(
                        token,
                        getFollows() ?? { authors: [], keywords: [], categories: [] },
                      );
                      setStatus({ kind: "ok", label: "Connected & synced" });
                    } catch {
                      setStatus({ kind: "error", label: "Connected; sync will retry on next edit" });
                    }
                  } else {
                    setStatus({ kind: "error", label: "Token can't access the repo" });
                  }
                }}
                className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-2 text-sm font-semibold text-canvas disabled:opacity-40"
              >
                Connect
              </button>
              <a
                className="text-[11px] text-muted underline underline-offset-2"
                href={`${REPO_URL}/edit/main/data/follows.json`}
                target="_blank"
                rel="noreferrer"
              >
                or edit follows.json manually
              </a>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setStatus({ kind: "working", label: "Dispatching pipeline…" });
                  try {
                    await syncFollowsSnapshot(
                      pat,
                      getFollows() ?? { authors: [], keywords: [], categories: [] },
                    );
                    await dispatchDigest(pat);
                    setStatus({ kind: "ok", label: "Pipeline running — enrichment in ~3-5 min" });
                  } catch (e) {
                    setStatus({ kind: "error", label: (e as Error).message });
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
              >
                <Icons.Refresh size={15} /> Enrich now
              </button>
              <a
                href={`${REPO_URL}/actions`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-fg"
              >
                View runs
              </a>
              <button
                type="button"
                onClick={() => updateSettings({ pat: undefined })}
                className="ml-auto rounded-lg px-3 py-2 text-sm text-muted transition hover:text-fg"
              >
                Disconnect
              </button>
            </div>

            {/* Pipeline knobs — meaningful only with write access */}
            <div className="mt-4 grid grid-cols-3 gap-2">
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
            {repoDoc &&
              (pipe.lookbackDays !== String(repoDoc.settings.lookbackDays) ||
                pipe.maxPerAuthor !== String(repoDoc.settings.maxPerAuthor) ||
                pipe.forYouPerDay !== String(repoDoc.settings.forYouPerDay)) && (
                <button
                  type="button"
                  onClick={savePipeline}
                  className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
                >
                  Save pipeline settings
                </button>
              )}
          </>
        )}
      </section>

      {/* Data */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Data</h2>
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
          Follows, reads, saves, concepts and streaks live on this device (and
          in backups — tokens are never exported). Enriched summaries are
          public on the Pages site.
        </p>
      </section>
    </PageShell>
  );
}
