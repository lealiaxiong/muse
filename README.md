# Muse

An arXiv reader tuned for human reading: a 650px text column with the paper's figures floating in a side margin, exactly where they're cited — no more hunting through pages to find the chart a paragraph is talking about.

Paste (or drag-and-drop) any arXiv link. The paper renders at ideal reading width; as you scroll, the figure cited by the visible paragraph surfaces in the sidebar, with a plain-English **"In short:"** gloss.

## Features

- **650px reading column**, light-mode only. Figure sidebars and lightbox stay legible against light-background figures.
- **Scroll-synced margin figures.** Whichever paragraph is centered becomes active; its cited figure(s) highlight and align to the paragraph's height. Multiple-figure paragraphs get a carousel (`‹ 1/2 ›` + dots) that resets to the first figure when the paragraph changes and preserves your choice while scrolling within it.
- **Figure explanations.** Each figure gets a 1–2 sentence plain-English gloss (see *How it works*), shown as a blue callout distinct from the violet active-paragraph highlight.
- **Full-screen lightbox.** Click any figure or table to open it at natural size. Rendered via a portal above the URL bar (z-100) so it covers the whole page.
- **Math via KaTeX.** arXiv's `<math>` TeX is extracted server-side and rendered client-side.
- **Clean citations, no bibliography jumps.** `#bib.*` links are resolved to the real source: arXiv ID → `arxiv.org/abs/…`, DOI → `doi.org/…`, otherwise a short-query Google Scholar search. The full bibliography entry shows as a tooltip; double-comma artifacts (`"Bender et al.,, 2021"`) are normalized.
- **Footnote cleanup.** arXiv HTML embeds full footnote text inside body paragraphs; the extractor strips it down to a superscript marker so the note doesn't duplicate in the text.
- **Panel merging.** Tables/figures split across multiple `<figure>` elements (container + panel) are merged into one card. Figure N and Table N are never conflated — papers number them independently.
- **Caching.** In-memory cache keyed by arXiv ID, so `abs/`, `html/`, and `pdf/` links for the same paper share one entry. Repeat loads are instant.
- **Anonymous, single-use.** No accounts or history — paste a link, read, close.
- **Drag-and-drop.** Drop an arXiv link anywhere on the page to load it.

## How it works

### Pipeline

1. **Fetch.** The API route (`src/app/api/fetch/route.ts`) server-side fetches `https://arxiv.org/html/{id}` (deterministic, no LLM). Papers without an HTML version return a clear 404 — try a newer paper.
2. **Extract.** Cheerio parses the raw HTML for title, paragraphs, and figures (caption + image URL, or table HTML for tables). Sub-panels are merged by ID prefix; bibliography entries are scanned for arXiv IDs/DOIs to build the citation map.
3. **Map paragraphs → figures (regex).** A deterministic pattern matches `Figure N` / `Fig. N` / `Table N` (including ranges like `Figures 46–50`) and links them **kind-aware** — `Figure 6` and `Table 6` are distinct. This is the default: free, instant, and accurate for explicit citations.
4. **Explain figures (Muse Ember).** `meta/muse-ember` via OpenRouter generates the "In short:" glosses — batched 8 figures per call, in parallel, from caption + up to three citing paragraphs. Failure-safe: if a batch fails, captions still render. (The Muse Ember code path is the only LLM usage left in the pipeline; see *Model usage* below.)
5. **Cache.** The processed paper is cached in-memory by arXiv ID before responding.

### Model usage

Meta Muse Ember (`meta/muse-ember`, 1M-token context) is reached through OpenRouter. It is a **reasoning model**: it spends most of its token budget on hidden reasoning before emitting content.

- The original full-paper reformatting prompt truncated mid-JSON ("Unterminated string") and was replaced by deterministic extraction.
- The LLM paragraph→figure mapping turned out to be *worse* than regex on the test paper (37 vs 43 mappings, missing explicit citations). It's kept behind `USE_LLM_MAPPING=1` for comparison, but off by default.
- Figure explanations use small batches (8 figures/call, `max_tokens: 8000`) so reasoning comfortably fits in budget. Tune these in `src/lib/paper.ts`.

## Quick start

```bash
# 1. Add your OpenRouter key to .env
OPENROUTER_API_KEY=sk-or-...

# 2. Install and run
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste an arXiv link, e.g. `https://arxiv.org/abs/2203.02155`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Tech stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4**
- **Cheerio** — server-side HTML parsing
- **KaTeX** — math rendering
- **OpenRouter** (`meta/muse-ember`) — figure explanations

## Known limitations

- **In-memory cache** clears on server restart; repeat links re-fetch after a restart.
- **Papers without an arXiv HTML version** (some older papers) return a 404 with a "try a newer paper" message. PDF fallback is not implemented.
- **Tables render inline as HTML**, not as images — that's by design (there's often no image file in the source), but very wide tables scroll inside their card.
