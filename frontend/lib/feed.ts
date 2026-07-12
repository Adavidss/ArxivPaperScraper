// Pure feed-assembly logic: FeedFile + overview + read state → ordered slides.
// Deterministic and explainable by design — nothing here optimizes for dwell
// time. Order: overview → today's followed (unread kept in place, read stay
// swipeable) → carry-over unread ≤7d → caught-up (the finish line, ALWAYS
// before For-You) → review promo → For-You tail (hard-capped) → end.

import type { AuthorSuggestion, FeedFile, FeedItem, OverviewFile } from "./data-schema";
import type { ReadEntry } from "./store";

export const FORYOU_TAIL_CAP = 10;

export type Slide =
  | { type: "weekend"; reviewDue: number }
  | { type: "overview"; overview: OverviewFile }
  | { type: "paper"; item: FeedItem; carryOver: boolean; gem: boolean }
  | { type: "connection"; body: string; items: FeedItem[] }
  | { type: "caughtup" }
  | { type: "reviewpromo"; due: number }
  | { type: "suggest"; suggestion: AuthorSuggestion }
  | { type: "end" };

export interface BuiltFeed {
  slides: Slide[];
  /** The announce date this drop covers (YYYY-MM-DD), or null when empty. */
  dropDate: string | null;
  /** Today's followed paper ids, in slide order (drives the stories bar). */
  todayIds: string[];
  unreadTodayCount: number;
  /** Index the pager should restore to on a fresh open. */
  firstUnreadIndex: number;
  caughtUpIndex: number;
}

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00Z`) - Date.parse(`${a}T00:00Z`)) / 86_400_000);

/** Small deterministic hash — seeds the daily gem position. */
const hashCode = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export function buildFeed(
  feed: FeedFile,
  overview: OverviewFile | null,
  readMap: Record<string, ReadEntry>,
  reviewDue: number,
  showForYou = true,
  suggestions: AuthorSuggestion[] = [],
  today = new Date().toISOString().slice(0, 10),
): BuiltFeed {
  const items = feed.items.filter((i) => !i.withdrawn);
  const follows = items.filter((i) => i.source === "follow");

  // "The drop" groups by ANNOUNCEMENT (pipeline firstSeen), not submission
  // date — arXiv announces papers days after submission. Older cached feeds
  // predate firstSeen; fall back to published.
  const seen = (i: FeedItem): string => i.firstSeen ?? i.published;
  const dropDate = follows.length
    ? follows.map(seen).sort().at(-1)!
    : items.length
      ? items.map(seen).sort().at(-1)!
      : null;

  const todays = follows
    .filter((i) => seen(i) === dropDate)
    .sort((a, b) =>
      b.followedIds.length !== a.followedIds.length
        ? b.followedIds.length - a.followedIds.length
        : b.id.localeCompare(a.id),
    );

  // Unread backlog from before the drop. A 30-day window (capped) rather than
  // the strict 7 days keeps a fresh install from hiding a follow's recent
  // papers, while staying bounded for lapsed users.
  const carry = dropDate
    ? follows
        .filter(
          (i) =>
            seen(i) !== dropDate &&
            !readMap[i.id] &&
            daysBetween(seen(i), dropDate) <= 30,
        )
        .slice(0, 12)
    : [];

  const forYou = showForYou
    ? items.filter((i) => i.source === "foryou" && !readMap[i.id]).slice(0, FORYOU_TAIL_CAP)
    : [];
  const gemIndex = forYou.length ? hashCode(dropDate ?? "gem") % forYou.length : -1;

  const slides: Slide[] = [];

  // Weekend calm: arXiv doesn't announce Sat/Sun. When the drop is cleared,
  // lead with rest (review, backlog) instead of pretending there's news.
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const isWeekend = dow === 0 || dow === 6;
  const nothingUnread =
    todays.every((i) => readMap[i.id]) && carry.length === 0;
  if (isWeekend && nothingUnread && dropDate && dropDate < today)
    slides.push({ type: "weekend", reviewDue });

  // The overview is generated on the run AFTER the announce; show the latest
  // one as the front page while it's still about this drop.
  if (overview && dropDate && Math.abs(daysBetween(dropDate, overview.date)) <= 3)
    slides.push({ type: "overview", overview });

  for (const item of todays) slides.push({ type: "paper", item, carryOver: false, gem: false });
  for (const item of carry) slides.push({ type: "paper", item, carryOver: true, gem: false });

  // Connection interstitials: cross-paper links the pipeline spotted, placed
  // right after the later of the two papers they join. Max 2.
  if (overview) {
    const itemById = new Map(items.map((i) => [i.id, i]));
    let placed = 0;
    for (const conn of overview.connections) {
      if (placed >= 2) break;
      const linked = conn.paperIds
        .map((id) => itemById.get(id))
        .filter((i): i is FeedItem => Boolean(i));
      if (linked.length < 2) continue;
      let lastIdx = -1;
      for (let s = 0; s < slides.length; s++) {
        const sl = slides[s];
        if (sl.type === "paper" && conn.paperIds.includes(sl.item.id)) lastIdx = s;
      }
      if (lastIdx === -1) continue;
      slides.splice(lastIdx + 1, 0, { type: "connection", body: conn.body, items: linked });
      placed++;
    }
  }

  const caughtUpIndex = slides.length;
  slides.push({ type: "caughtup" });

  if (reviewDue >= 3) slides.push({ type: "reviewpromo", due: reviewDue });

  // One person-to-follow card per day, rotating with the drop date — a
  // variable reward in the bonus tail, never part of the goal.
  if (suggestions.length) {
    const pick = suggestions[hashCode(`sg-${dropDate ?? "x"}`) % suggestions.length];
    slides.push({ type: "suggest", suggestion: pick });
  }

  forYou.forEach((item, i) =>
    slides.push({ type: "paper", item, carryOver: false, gem: i === gemIndex }),
  );
  slides.push({ type: "end" });

  const firstUnread = slides.findIndex(
    (s) => s.type === "paper" && !readMap[s.item.id],
  );

  return {
    slides,
    dropDate,
    todayIds: todays.map((i) => i.id),
    unreadTodayCount: todays.filter((i) => !readMap[i.id]).length,
    firstUnreadIndex:
      firstUnread !== -1
        ? firstUnread
        : slides[0]?.type === "weekend"
          ? 0
          : caughtUpIndex,
    caughtUpIndex,
  };
}
