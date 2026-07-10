// Follows sync from the phone: a fine-grained PAT (this repo only; Contents
// R/W + Actions R/W) lets the app commit data/follows.json and trigger the
// digest workflow. Edits are queued as OPERATIONS and replayed onto a fresh
// GET before every PUT, so a sha race (e.g. with the nightly data commit)
// merges cleanly on retry.

import type { FollowedAuthor, FollowsFile } from "./data-schema";

const REPO = "Adavidss/ArxivPaperScraper";
const FILE_PATH = "data/follows.json";
const API = `https://api.github.com/repos/${REPO}`;

export type FollowOp =
  | { op: "add-author"; author: FollowedAuthor }
  | { op: "remove-author"; id: string }
  | { op: "edit-author"; author: FollowedAuthor }
  | { op: "set-categories"; categories: string[] };

export function applyOps(doc: FollowsFile, ops: FollowOp[]): FollowsFile {
  const next: FollowsFile = JSON.parse(JSON.stringify(doc));
  for (const o of ops) {
    if (o.op === "add-author") {
      if (!next.authors.some((a) => a.id === o.author.id)) next.authors.push(o.author);
    } else if (o.op === "remove-author") {
      next.authors = next.authors.filter((a) => a.id !== o.id);
    } else if (o.op === "edit-author") {
      next.authors = next.authors.map((a) => (a.id === o.author.id ? o.author : a));
    } else {
      next.extraCategories = o.categories;
    }
  }
  return next;
}

export const authorSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface GhFile {
  sha: string;
  content: string;
}

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
  const file = (await res.json()) as GhFile;
  return { doc: JSON.parse(b64decode(file.content)) as FollowsFile, sha: file.sha };
}

/**
 * Apply ops onto the freshest follows.json and PUT it back. One sha-conflict
 * retry (re-GET, replay, re-PUT). The PAT-authored push itself triggers the
 * digest workflow via its follows.json path filter — no dispatch needed.
 */
export async function syncFollowOps(pat: string, ops: FollowOp[]): Promise<FollowsFile> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { doc, sha } = await getFollowsFile(pat);
    const next = applyOps(doc, ops);
    const summary = ops
      .map((o) =>
        o.op === "add-author"
          ? `follow ${o.author.name}`
          : o.op === "remove-author"
            ? `unfollow ${o.id}`
            : o.op === "edit-author"
              ? `edit ${o.author.name}`
              : "update categories",
      )
      .join(", ");
    const res = await gh(pat, `/contents/${FILE_PATH}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `follows: ${summary}`,
        content: b64encode(`${JSON.stringify(next, null, 1)}\n`),
        sha,
        branch: "main",
      }),
    });
    if (res.ok) return next;
    if (res.status !== 409 && res.status !== 422)
      throw new Error(`GitHub write failed (HTTP ${res.status})`);
    lastErr = new Error(`GitHub write conflict (HTTP ${res.status})`);
  }
  throw lastErr ?? new Error("GitHub write failed");
}

/** "Refresh now": dispatch the digest workflow without an edit. */
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
