// Client-side personal state: reads, saves, concepts, streaks, settings.
// All of it lives in localStorage under the "ab:" namespace; nothing personal
// ever leaves the device (except follows sync, which the user opts into with
// a PAT). Components subscribe via useSyncExternalStore on a coarse version
// counter — fine at this app's scale.

export interface ReadEntry {
  /** First-read timestamp (epoch ms). */
  at: number;
  /** Deepest pane visited: 0 bite, 1 deeper, 2 source. */
  depth?: number;
  /** True if this was a deep read (pane B+ or ≥10s dwell). */
  deep?: boolean;
}

export interface SavedEntry {
  at: number;
}

export interface ConceptSrs {
  /** Leitner box: 1..3; 4 = mastered (retired). */
  box: number;
  /** Next review due (epoch ms). */
  due: number;
  lapses: number;
}

export interface ConceptEntry {
  term: string;
  shortDef: string;
  eli5Def: string;
  wikiTitle: string | null;
  /** Paper the term was first saved from ("" for Wikipedia lookups). */
  paperId: string;
  paperHook?: string;
  addedAt: number;
  srs: ConceptSrs;
}

export interface StreakData {
  /** Qualified days (read ≥1 paper or completed a review), YYYY-MM-DD → 1. */
  days: Record<string, 1>;
  /** Days rescued by an auto-applied freeze. */
  frozen: Record<string, 1>;
  /** Banked freezes (max 2, earn 1 per 7 qualified days). */
  freezes: number;
  best: number;
}

export interface SettingsData {
  pat?: string;
  eli5Default?: boolean;
  showForYou?: boolean;
  onboarded?: boolean;
}

export interface SyncData {
  /** Last meta.buildId the user has "opened" — drives the sealed-drop ritual. */
  openedBuildId?: string;
  /** Drop date of the last caught-up celebration (once per day). */
  celebratedDrop?: string;
}

export interface StatsData {
  /** Review sessions completed. */
  sessions: number;
  /** Concepts ever mastered (box 4 reached). */
  mastered: number;
}

const NS = "ab:";

let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  for (const l of listeners) l();
};

export function subscribeStore(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export const storeVersion = () => version;

function get<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    // Quota/private-mode failures degrade to session-only state.
  }
  notify();
}

export const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);

// --- reads -------------------------------------------------------------------

export const getReadMap = () => get<Record<string, ReadEntry>>("read", {});

export function markRead(id: string): void {
  const map = getReadMap();
  if (map[id]) return;
  map[id] = { at: Date.now() };
  set("read", map);
  recordQualifiedDay();
}

export function markDepth(id: string, depth: number, deep = false): void {
  const map = getReadMap();
  const entry = map[id] ?? { at: Date.now() };
  entry.depth = Math.max(entry.depth ?? 0, depth);
  if (deep) entry.deep = true;
  map[id] = entry;
  set("read", map);
}

export const isRead = (id: string) => Boolean(getReadMap()[id]);

// --- saves -------------------------------------------------------------------

export const getSavedMap = () => get<Record<string, SavedEntry>>("saved", {});

export function toggleSaved(id: string): boolean {
  const map = getSavedMap();
  if (map[id]) delete map[id];
  else map[id] = { at: Date.now() };
  set("saved", map);
  return Boolean(map[id]);
}

export const isSaved = (id: string) => Boolean(getSavedMap()[id]);

// --- concepts ------------------------------------------------------------------

export const conceptSlug = (term: string) =>
  term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const getConcepts = () => get<Record<string, ConceptEntry>>("concepts", {});

export function saveConcept(
  entry: Omit<ConceptEntry, "addedAt" | "srs">,
): void {
  const map = getConcepts();
  const slug = conceptSlug(entry.term);
  if (map[slug]) return;
  map[slug] = {
    ...entry,
    addedAt: Date.now(),
    srs: { box: 1, due: Date.now() + 86_400_000, lapses: 0 },
  };
  set("concepts", map);
}

export function removeConcept(slug: string): void {
  const map = getConcepts();
  delete map[slug];
  set("concepts", map);
}

/** Leitner-lite: got-it advances (1d/3d/7d → mastered), fuzzy returns to box 1. */
export function gradeConcept(slug: string, gotIt: boolean): void {
  const map = getConcepts();
  const c = map[slug];
  if (!c) return;
  const INTERVALS: Record<number, number> = { 1: 1, 2: 3, 3: 7 };
  if (gotIt) {
    const nextBox = Math.min(4, c.srs.box + 1);
    if (nextBox === 4 && c.srs.box !== 4) {
      const stats = getStats();
      set("stats", { ...stats, mastered: stats.mastered + 1 });
    }
    c.srs = {
      box: nextBox,
      // Mastered terms resurface as a monthly "still got it?" bonus.
      due: Date.now() + (nextBox === 4 ? 30 : INTERVALS[nextBox]) * 86_400_000,
      lapses: c.srs.lapses,
    };
  } else {
    // Mastered terms that lapse drop to box 2, everything else to box 1.
    const wasMastered = c.srs.box === 4;
    c.srs = {
      box: wasMastered ? 2 : 1,
      due: Date.now() + 86_400_000,
      lapses: c.srs.lapses + 1,
    };
  }
  set("concepts", map);
}

/** Concepts due for review now (mastered ones resurface monthly). */
export function getDueConcepts(): Array<[string, ConceptEntry]> {
  const now = Date.now();
  return Object.entries(getConcepts())
    .filter(([, c]) => c.srs.due <= now)
    .sort((a, b) => a[1].srs.due - b[1].srs.due);
}

export const getEncounters = () => get<Record<string, number>>("encounters", {});

export function bumpEncounter(term: string): number {
  const map = getEncounters();
  const slug = conceptSlug(term);
  map[slug] = (map[slug] ?? 0) + 1;
  set("encounters", map);
  return map[slug];
}

export function completeReviewSession(): void {
  const stats = getStats();
  set("stats", { ...stats, sessions: stats.sessions + 1 });
  recordQualifiedDay();
}

export const getStats = () => get<StatsData>("stats", { sessions: 0, mastered: 0 });

// --- streak --------------------------------------------------------------------

export const getStreakData = () =>
  get<StreakData>("streak", { days: {}, frozen: {}, freezes: 0, best: 0 });

/** Sat/Sun have no arXiv announcements — they bridge, never break, a streak. */
const isBridgeDay = (day: string): boolean => {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
};

export function computeStreak(data: StreakData, today = todayStr()): number {
  let streak = 0;
  const d = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < 3660; i++) {
    const day = d.toISOString().slice(0, 10);
    if (data.days[day]) streak++;
    else if (!(isBridgeDay(day) || data.frozen[day] || day === today)) break;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

function recordQualifiedDay(): void {
  const today = todayStr();
  const data = getStreakData();
  if (data.days[today]) return;

  // Auto-apply a banked freeze to a single missed weekday just before today.
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  for (let i = 0; i < 14; i++) {
    const day = d.toISOString().slice(0, 10);
    if (data.days[day] || data.frozen[day]) break; // chain intact
    if (!isBridgeDay(day)) {
      const prev = new Date(d);
      prev.setUTCDate(prev.getUTCDate() - 1);
      // Only rescue a 1-day gap that actually had a streak behind it.
      let hadStreak = false;
      for (let j = 0; j < 3; j++) {
        const p = prev.toISOString().slice(0, 10);
        if (data.days[p]) {
          hadStreak = true;
          break;
        }
        if (!isBridgeDay(p)) break;
        prev.setUTCDate(prev.getUTCDate() - 1);
      }
      if (hadStreak && data.freezes > 0) {
        data.frozen[day] = 1;
        data.freezes--;
      }
      break;
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }

  data.days[today] = 1;
  const qualified = Object.keys(data.days).length;
  if (qualified % 7 === 0 && data.freezes < 2) data.freezes++;
  data.best = Math.max(data.best, computeStreak(data, today));
  set("streak", data);
}

// --- settings / sync -------------------------------------------------------------

export const getSettings = () => get<SettingsData>("settings", {});
export const updateSettings = (patch: Partial<SettingsData>) =>
  set("settings", { ...getSettings(), ...patch });

export const getSync = () => get<SyncData>("sync", {});
export const updateSync = (patch: Partial<SyncData>) =>
  set("sync", { ...getSync(), ...patch });

// --- backup ------------------------------------------------------------------------

const EXPORT_KEYS = ["read", "saved", "concepts", "encounters", "streak", "stats", "sync"];

/** Everything except settings.pat (never write the token to a shareable file). */
export function exportBackup(): string {
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };
  for (const key of EXPORT_KEYS) out[key] = get(key, null);
  const { pat: _pat, ...settings } = getSettings();
  out.settings = settings;
  return JSON.stringify(out, null, 1);
}

export function importBackup(json: string): void {
  const data = JSON.parse(json) as Record<string, unknown>;
  for (const key of [...EXPORT_KEYS, "settings"]) {
    if (data[key] != null) {
      if (key === "settings") {
        const { pat: _pat, ...incoming } = data[key] as SettingsData;
        set("settings", { ...incoming, pat: getSettings().pat });
      } else set(key, data[key]);
    }
  }
}
