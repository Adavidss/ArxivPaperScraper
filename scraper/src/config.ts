import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { FollowsFile } from "./types";

export interface Config {
  follows: FollowsFile;
  geminiApiKey: string | null;
  /** Hard cap on LLM bites per run; overflow gets fallback + retry queue. */
  maxNewBites: number;
  dataDir: string;
  /** UTC day of this run, YYYY-MM-DD. */
  today: string;
  nowIso: string;
}

// Pipeline constants (not user settings — change here, not in follows.json).
export const ARXIV_THROTTLE_MS = 3000; // arXiv ToS: ≤1 request / 3s
export const RETRY_DELAYS_MS = [5_000, 15_000, 45_000];
export const BITE_BATCH_SIZE = 4;
/**
 * Tried in order; drop down the chain on quota exhaustion (429) or a
 * retired-model 404. The "-latest" names are Google's stable aliases that
 * auto-track the current flash generation — verified working 2026-07-10
 * (flash-latest → gemini-3.5-flash), while the pinned 2.x names had started
 * returning 404 for new keys.
 */
export const MODEL_CHAIN = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
];
export const FORYOU_MAX_AGE_DAYS = 7;
export const FORYOU_FETCH_PER_CATEGORY = 15;
export const FORYOU_CATEGORY_COUNT = 3;

export function loadConfig(): Config {
  const dataDir = fileURLToPath(new URL("../../data/", import.meta.url));
  const follows = JSON.parse(
    readFileSync(join(dataDir, "follows.json"), "utf8"),
  ) as FollowsFile;
  const now = new Date();
  return {
    follows,
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
    maxNewBites: Number(process.env.MAX_NEW_BITES) || 40,
    dataDir,
    today: now.toISOString().slice(0, 10),
    nowIso: now.toISOString(),
  };
}
