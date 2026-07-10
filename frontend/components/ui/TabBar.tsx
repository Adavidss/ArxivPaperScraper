"use client";

// Thumb-reachable bottom navigation — 4 daily-loop tabs only (Settings lives
// behind the gear in the feed header). Ported from ConcertFinder's pattern.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "./icons";

export interface TabBadges {
  /** Unread papers in today's drop. */
  today?: number;
  /** Concepts due for review. */
  concepts?: number;
}

const TABS = [
  { href: "/", label: "Today", Icon: Icons.Cards, badge: "today" as const },
  { href: "/saved", label: "Saved", Icon: Icons.Bookmark, badge: undefined },
  { href: "/concepts", label: "Concepts", Icon: Icons.Brain, badge: "concepts" as const },
  { href: "/stats", label: "Stats", Icon: Icons.Chart, badge: undefined },
];

export const TAB_BAR_SPACE = "calc(3.25rem + env(safe-area-inset-bottom))";

export function TabBar({ badges = {} }: { badges?: TabBadges }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-canvas/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {TABS.map((t) => {
          const active =
            t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          const count = t.badge ? badges[t.badge] : undefined;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition ${
                  active ? "text-accent" : "text-muted hover:text-fg"
                }`}
              >
                <span className="relative">
                  <t.Icon size={22} />
                  {count ? (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-bold text-canvas">
                      {count > 9 ? "9+" : count}
                    </span>
                  ) : null}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
