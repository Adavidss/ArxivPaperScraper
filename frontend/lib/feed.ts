// Pure feed-assembly logic: FeedFile + overview + read state → ordered slides.
// Deterministic and explainable by design — nothing here optimizes for dwell
// time. Order: overview → today's followed (unread kept in place, read stay
// swipeable) → carry-over unread ≤7d → caught-up (the finish line, ALWAYS
// before For-You) → review promo → For-You tail (hard-capped) → end.

import type { FeedFile, FeedItem, OverviewFile } from "./data-schema";
import type { ReadEntry } from "./store";

export const FORYOU_TAIL_CAP = 10;

export type Slide =
  | { type: "overview"; overview: OverviewFile }
  | { type: "paper"; item: FeedItem; carryOver: boolean; gem: boolean }
  | { type: "caughtup" }
  | { type: "reviewpromo"; due: number }
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
): BuiltFeed {
  const items = feed.items.filter((i) => !i.withdrawn);
  const follows = items.filter((i) => i.source === "follow");

  // The drop = the most recent announce date among followed papers (falls back
  // to the newest item at all so a follows-less feed still renders).
  const dropDate = follows[0]?.published ?? items[0]?.published ?? null;

  const todays = follows
    .filter((i) => i.published === dropDate)
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
            i.published !== dropDate &&
            !readMap[i.id] &&
            daysBetween(i.published, dropDate) <= 30,
        )
        .slice(0, 12)
    : [];

  const forYou = showForYou
    ? items.filter((i) => i.source === "foryou" && !readMap[i.id]).slice(0, FORYOU_TAIL_CAP)
    : [];
  const gemIndex = forYou.length ? hashCode(dropDate ?? "gem") % forYou.length : -1;

  const slides: Slide[] = [];
  // The overview is generated on the run AFTER the announce; show the latest
  // one as the front page while it's still about this drop.
  if (overview && dropDate && Math.abs(daysBetween(dropDate, overview.date)) <= 3)
    slides.push({ type: "overview", overview });

  for (const item of todays) slides.push({ type: "paper", item, carryOver: false, gem: false });
  for (const item of carry) slides.push({ type: "paper", item, carryOver: true, gem: false });

  const caughtUpIndex = slides.length;
  slides.push({ type: "caughtup" });

  if (reviewDue >= 3) slides.push({ type: "reviewpromo", due: reviewDue });

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
    firstUnreadIndex: firstUnread === -1 ? caughtUpIndex : firstUnread,
    caughtUpIndex,
  };
}
