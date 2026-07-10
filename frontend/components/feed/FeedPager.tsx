"use client";

// Vertical full-screen snap pager — the ConcertFinder Discover mechanism:
// CSS scroll-snap does the physics, a rAF scroll handler derives the active
// index, and browser direction-locking keeps the nested horizontal pane
// strips from ever fighting the vertical pager.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { snapScrollTo } from "@/lib/scroll";

export interface PagerHandle {
  jumpTo: (index: number, smooth?: boolean) => void;
}

export const FeedPager = forwardRef<
  PagerHandle,
  {
    count: number;
    initialIndex: number;
    onActive: (index: number) => void;
    children: React.ReactNode;
  }
>(function FeedPager({ count, initialIndex, onActive, children }, ref) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Restore position before paint (tab switches, fresh opens land on the
  // first unread slide).
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || initialIndex <= 0) return;
    el.scrollTop = initialIndex * el.clientHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !count) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        onActive(
          Math.min(
            count - 1,
            Math.round(el.scrollTop / Math.max(1, el.clientHeight)),
          ),
        );
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [count, onActive]);

  useImperativeHandle(ref, () => ({
    jumpTo: (index, smooth = true) => {
      const el = scrollerRef.current;
      if (!el) return;
      if (smooth) snapScrollTo(el, { top: index * el.clientHeight });
      else el.scrollTo({ top: index * el.clientHeight });
    },
  }));

  // Desktop keyboard nav: ↑/↓ papers (snap handles the rest natively).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
        snapScrollTo(el, {
          top: (idx + (e.key === "ArrowDown" ? 1 : -1)) * el.clientHeight,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={scrollerRef}
      className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
    >
      {children}
    </div>
  );
});
