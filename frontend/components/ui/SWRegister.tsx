"use client";

// Registers the service worker (production only — caching in dev fights HMR)
// and quietly prefetches the newest paper details for offline reading.

import { useEffect } from "react";
import { BASE, loadFeed } from "@/lib/api";
import { paperFileId } from "@/lib/data-schema";

const PREFETCH_COUNT = 30;

export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(`${BASE}/sw.js`)
      .then(() => {
        // Subway mode: warm the data cache with the newest details. Requests
        // flow through the SW's stale-while-revalidate cache.
        const idle =
          window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2500));
        idle(async () => {
          try {
            const feed = await loadFeed();
            for (const item of feed.items.slice(0, PREFETCH_COUNT)) {
              await fetch(`${BASE}/data/papers/${paperFileId(item.id)}.json`).catch(
                () => null,
              );
            }
          } catch {
            /* best-effort */
          }
        });
      })
      .catch(() => {
        /* SW is an enhancement, never a requirement */
      });
  }, []);
  return null;
}
