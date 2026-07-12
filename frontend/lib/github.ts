// Optional GitHub sync — enrichment only. The feed no longer depends on the
// repo: follows live in localStorage and take effect instantly. When a PAT is
// connected we quietly mirror them into data/follows.json so the nightly
// pipeline knows whom to enrich (AI bites, figures, suggestions), and expose
// a "run enrichment now" dispatch.

import type { FollowsFile } from "./data-schema";
import type { ClientFollows } from "./store";

const REPO = "Adavidss/ArxivPaperScraper";
const FILE_PATH = "data/follows.json";
const API = `https://api.github.com/repos/${REPO}`;

export const authorSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function gh(pat: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${pat}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });
}

/** Base64 helpers that survive non-ASCII author names. */
const b64encode = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = (s: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)),
  );

async function getFollowsFile(pat: string): Promise<{ doc: FollowsFile; sha: string }> {
  const res = await gh(pat, `/contents/${FILE_PATH}?ref=main`);
  if (!res.ok) throw new Error(`GitHub read failed (HTTP ${res.status})`);
  const file = (await res.json()) as { sha: string; content: string };
  return { doc: JSON.parse(b64decode(file.content)) as FollowsFile, sha: file.sha };
}

/**
 * Mirror the client follows into the repo (preserving pipeline settings the
 * client doesn't own). One sha-conflict retry; callers treat failure as
 * "enrichment lags", never as feed breakage.
 */
export async function syncFollowsSnapshot(
  pat: string,
  client: ClientFollows,
  settingsPatch?: Partial<FollowsFile["settings"]>,
): Promise<void> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { doc, sha } = await getFollowsFile(pat);
    const next: FollowsFile = {
      ...doc,
      authors: client.authors,
      keywords: client.keywords,
      extraCategories: client.categories,
      settings: { ...doc.settings, ...settingsPatch },
    };
    const res = await gh(pat, `/contents/${FILE_PATH}`, {
      method: "PUT",
      body: JSON.stringify({
        message: "follows: sync from app",
        content: b64encode(`${JSON.stringify(next, null, 1)}\n`),
        sha,
        branch: "main",
      }),
    });
    if (res.ok) return;
    if (res.status !== 409 && res.status !== 422)
      throw new Error(`GitHub write failed (HTTP ${res.status})`);
    lastErr = new Error(`GitHub write conflict (HTTP ${res.status})`);
  }
  throw lastErr ?? new Error("GitHub write failed");
}

/** "Run enrichment now": dispatch the digest workflow. */
export async function dispatchDigest(pat: string): Promise<void> {
  const res = await gh(pat, `/actions/workflows/digest.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main" }),
  });
  if (res.status !== 204) throw new Error(`Dispatch failed (HTTP ${res.status})`);
}

/** Cheap PAT validation: can we see the repo? */
export async function validatePat(pat: string): Promise<boolean> {
  try {
    const res = await gh(pat, "");
    return res.ok;
  } catch {
    return false;
  }
}
