// Wikipedia REST summary lookup — keyless and CORS-open, used for term
// definitions beyond the precomputed glossary. Exact titles miss constantly
// (case, plurals, jargon variants), so a direct hit falls back to full-text
// search and takes the top result.

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
}

async function trySummary(title: string): Promise<WikiSummary | null> {
  const slug = encodeURIComponent(title.trim().replace(/ /g, "_"));
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
      type?: string;
    };
    if (!j.extract || j.type === "disambiguation") return null;
    return {
      title: j.title ?? title,
      extract: j.extract,
      url: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${slug}`,
    };
  } catch {
    return null;
  }
}

/** Top search hit for a phrase (action API with origin=* — CORS-safe). */
async function searchTitle(q: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    return j.query?.search?.[0]?.title ?? null;
  } catch {
    return null;
  }
}

export async function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
  const direct = await trySummary(title);
  if (direct) return direct;
  const hit = await searchTitle(title);
  if (hit && hit.toLowerCase() !== title.trim().toLowerCase()) {
    return trySummary(hit);
  }
  return null;
}

/** Where to send the user when even search-assisted lookup finds nothing. */
export const wikiSearchUrl = (q: string): string =>
  `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`;
