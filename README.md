# Daily Drop — bite-sized arXiv

A mobile-first, fully static reader for the research you actually follow. A
GitHub Actions pipeline checks arXiv once a day for new papers by your
followed authors, distills each into a swipeable "bite" (hook, 3-bullet TLDR,
why-it-matters, ELI5, key numbers, jargon glossary) with Gemini, and publishes
everything as JSON to GitHub Pages. The app is the feed: one paper per screen,
swipe up for the next, swipe left to go deeper, tap any underlined term to
learn it.

Live: https://www.kidsdc.org/ArxivPaperScraper/

## How it works

```
data/follows.json ──▶ digest.yml (cron, daily ~06:30 UTC)
                        ├─ scraper/: arXiv API → dedupe → Gemini bites + daily overview
                        ├─ commit data/*.json back (state persists; LLM work never redone)
                        └─ next build (data baked into the site) → deploy to Pages
frontend/ (Next.js static export) reads <basePath>/data/*.json
reading state · streaks · saved papers · concept flashcards live in localStorage
```

- `data/feed.json` — slim rolling index (~75 days) the pager renders from
- `data/papers/<id>.json` — full bite + metadata per paper
- `data/overviews/YYYY-MM-DD.json` — daily cross-paper synthesis
- `data/meta.json` — freshness beacon (`buildId` changes = client re-syncs)
- `data/state.json` — pipeline-private state (not published)

The contract for all of these lives in `frontend/lib/data-schema.ts`.

## One-time setup

1. **Gemini key**: create an API key in Google AI Studio → repo secret
   `GEMINI_API_KEY` (Settings → Secrets and variables → Actions).
2. **Pages**: Settings → Pages → Source: **GitHub Actions** (the workflow also
   tries to enable this itself on first run).
3. **Follows**: edit `data/follows.json` (authors + name-variant aliases —
   arXiv matches exact strings, so include e.g. `"R. Walsworth"` and
   `"Ronald L. Walsworth"`).
4. Optional, for editing follows from your phone: create a **fine-grained PAT**
   scoped to this repo only, with **Contents: Read & Write** and
   **Actions: Read & Write**, and paste it into the app's Settings. Follow
   edits then commit straight from the app and trigger a rebuild (~3 min).

## Development

```bash
# pipeline (writes data/*.json)
cd scraper && npm install
GEMINI_API_KEY=... npm run digest        # omit the key → extractive fallback bites

# frontend (http://localhost:3030/ArxivPaperScraper/)
cd frontend && npm install
cp -R ../data public/data && rm -f public/data/state.json   # local data for dev
npm run dev
```

## Anti-doomscroll guarantees

This app is built to be *addictive like a ritual, not like a slot machine*:

- **No infinite scroll.** The daily drop is bounded; For-You discovery is
  hard-capped at 10/day and sits *after* the "caught up" finish line.
- **Deterministic order.** Nothing is reordered to chase your dwell time.
- **No autoplay, no timers, no red badges, no guilt.** Weekends (arXiv
  doesn't announce) can't break your streak.
- **Designed endings.** The feed has a floor: "That's everything today."

## Provenance

`prototype/` holds the original single-file experiments ("ArXiv Digest" v1 and
v12) that this app rebuilds: same core ideas (author follows + AI digests),
now with a real pipeline instead of dead CORS proxies and an Artifacts-only
LLM binding.
