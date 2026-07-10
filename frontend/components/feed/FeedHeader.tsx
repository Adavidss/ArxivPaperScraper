"use client";

// Floating feed chrome: segmented stories bar for today's drop (tap a segment
// to jump), date, progress count, streak flame, settings gear.

import Link from "next/link";
import { Icons } from "@/components/ui/icons";

export function FeedHeader({
  dropDate,
  todayIds,
  readMap,
  activePaperId,
  streak,
  inBonus,
  onJumpToPaper,
}: {
  dropDate: string | null;
  todayIds: string[];
  readMap: Record<string, unknown>;
  activePaperId: string | null;
  streak: number;
  /** Past the caught-up line — bonus (For-You) territory. */
  inBonus: boolean;
  onJumpToPaper: (id: string) => void;
}) {
  const readCount = todayIds.filter((id) => readMap[id]).length;
  const dateLabel = dropDate
    ? new Date(`${dropDate}T12:00:00Z`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      {todayIds.length > 0 && (
        <div className="pointer-events-auto flex gap-1">
          {todayIds.map((id) => (
            <button
              key={id}
              type="button"
              aria-label="Jump to paper"
              onClick={() => onJumpToPaper(id)}
              className={`h-1 flex-1 rounded-full transition-colors ${
                readMap[id]
                  ? "bg-accent"
                  : id === activePaperId
                    ? "bg-fg/70"
                    : "bg-fg/20"
              }`}
            />
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <span className="rounded-full bg-canvas/70 px-2 py-0.5 font-medium text-fg/90 backdrop-blur">
          {inBonus ? (
            <span className="text-gem">bonus · for you</span>
          ) : (
            <>
              {dateLabel}
              {todayIds.length > 0 && (
                <span className="text-muted">
                  {" "}
                  · {Math.min(readCount + 1, todayIds.length)} of {todayIds.length}
                </span>
              )}
            </>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-canvas/70 px-2 py-0.5 font-mono font-medium text-gold backdrop-blur">
          <Icons.Flame size={13} /> {streak}
        </span>
        <Link
          href="/settings"
          aria-label="Settings"
          className="pointer-events-auto rounded-full bg-canvas/70 p-1.5 text-muted backdrop-blur transition hover:text-fg"
        >
          <Icons.Gear size={15} />
        </Link>
      </div>
    </div>
  );
}
