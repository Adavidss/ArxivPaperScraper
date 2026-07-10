// Wikipedia REST summary lookup — keyless and CORS-open, used for term
// definitions beyond the precomputed glossary.

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
}

export async function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
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
