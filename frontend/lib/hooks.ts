"use client";

// Data + store hooks shared across pages.

import { useEffect, useState, useSyncExternalStore } from "react";
import { loadFeed, loadMeta, loadOverview, loadPaper } from "./api";
import type { FeedFile, MetaFile, OverviewFile, PaperDetail } from "./data-schema";
import { subscribeStore, storeVersion } from "./store";

/** Re-render on ANY personal-store change (coarse but cheap at this scale). */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribeStore, storeVersion, () => 0);
}

/**
 * True after client mount. Pages whose first paint depends on localStorage
 * must gate on this — the static prerender has no store, and rendering
 * store-derived UI immediately causes hydration mismatches.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export interface DropState {
  meta: MetaFile | null;
  feed: FeedFile | null;
  overview: OverviewFile | null;
  loading: boolean;
  /** True when rendering from the offline cache. */
  offline: boolean;
  error: string | null;
}

interface DropCache {
  meta: MetaFile;
  feed: FeedFile;
  overview: OverviewFile | null;
}

const CACHE_KEY = "ab:cacheDrop";

function readDropCache(): DropCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DropCache) : null;
  } catch {
    return null;
  }
}

/** Load meta + feed + latest overview, falling back to the offline cache. */
export function useDrop(): DropState {
  const [state, setState] = useState<DropState>({
    meta: null,
    feed: null,
    overview: null,
    loading: true,
    offline: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meta, feed] = await Promise.all([loadMeta(), loadFeed()]);
        let overview: OverviewFile | null = null;
        if (meta.latestOverview) {
          overview = await loadOverview(meta.latestOverview).catch(() => null);
        }
        if (cancelled) return;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ meta, feed, overview }));
        } catch {
          /* cache is best-effort */
        }
        setState({ meta, feed, overview, loading: false, offline: false, error: null });
      } catch (err) {
        if (cancelled) return;
        const cached = readDropCache();
        if (cached) {
          setState({ ...cached, loading: false, offline: true, error: null });
        } else {
          setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// --- per-paper detail, lazily fetched around the active slide -----------------

const detailCache = new Map<string, PaperDetail>();
const detailPending = new Map<string, Promise<PaperDetail>>();

export function usePaperDetail(id: string, shouldLoad: boolean): PaperDetail | null {
  const [detail, setDetail] = useState<PaperDetail | null>(
    () => detailCache.get(id) ?? null,
  );

  useEffect(() => {
    if (!shouldLoad || detail?.id === id) return;
    const cached = detailCache.get(id);
    if (cached) {
      setDetail(cached);
      return;
    }
    let cancelled = false;
    let promise = detailPending.get(id);
    if (!promise) {
      promise = loadPaper(id);
      detailPending.set(id, promise);
    }
    promise
      .then((p) => {
        detailCache.set(id, p);
        detailPending.delete(id);
        if (!cancelled) setDetail(p);
      })
      .catch(() => detailPending.delete(id));
    return () => {
      cancelled = true;
    };
  }, [id, shouldLoad, detail]);

  return detail?.id === id ? detail : null;
}
