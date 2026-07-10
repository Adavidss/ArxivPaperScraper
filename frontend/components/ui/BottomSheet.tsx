"use client";

// Ported from ConcertFinder's proven BottomSheet: sheet on phones, centered
// modal on desktop; dismissed by backdrop, X, or Escape.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./icons";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Hidden/throttled tabs freeze compositor animations at frame 0, which
    // would park the sheet at its translateY(100%) start position below the
    // viewport (timers are throttled too, so finish() — a programmatic seek —
    // is the only reliable tool). Visible tabs keep the normal slide-up.
    const settle = () =>
      sheetRef.current?.getAnimations().forEach((a) => {
        try {
          a.finish();
        } catch {
          /* infinite animations can't finish — none here */
        }
      });
    if (document.visibilityState === "hidden") settle();
    const t = setTimeout(settle, 400);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portal to <body>: ancestors with fixed positioning (the feed shell)
  // create stacking contexts that would trap the sheet under the tab bar.
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-border bg-canvas shadow-2xl max-sm:animate-sheet-up sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[30rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <h3 className="min-w-0 text-base font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted transition hover:text-fg"
          >
            <Icons.X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-3">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
