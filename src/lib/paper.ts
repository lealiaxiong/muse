import * as cheerio from "cheerio";
import type { Figure, Paragraph, ReaderData } from "@/lib/types";

/** Extract arXiv ID from abs/html/pdf links. Returns null if not an arXiv URL. */
export function extractArxivId(input: string): string | null {
  const m = input.match(/arxiv\.org\/(?:abs|html|pdf|export|list)\/(\d{4}\.\d{4,5})(v\d+)?/);
  if (m) return m[1];
  // Bare ID, e.g. "2401.12345" or "2401.12345v2"
  const bare = input.trim().match(/^(\d{4}\.\d{4,5})(v\d+)?$/);
  return bare ? bare[1] : null;
}

/**
 * Fetch the arXiv HTML version. Falls back to 404 with a clear error
 * if the paper has no HTML version (older papers).
 */
export async function fetchArxivHtml(arxivId: string): Promise<string> {
  const url = `https://arxiv.org/html/${arxivId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "arxiv-reader-demo/0.1 (local demo)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) {
    throw new Error(
      `No HTML version available for arXiv:${arxivId}. Try a newer paper.`,
    );
  }
  if (!res.ok) {
    throw new Error(`arXiv returned ${res.status} for ${arxivId}`);
  }
  return await res.text();
}

const HTML_BASE = "https://arxiv.org/html/";

/** Resolve a src/data attribute from the arXiv HTML page to an absolute URL. */
function resolveImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }
  return HTML_BASE + raw.replace(/^\.\//, "");
}

/**
 * Deterministically extract title, paragraphs, and figures from arXiv HTML.
 * This is done server-side (free, reliable) so the LLM only has to return
 * a short paragraph->figure map — no truncation risk.
 */
export function extractPaper(html: string, arxivId: string): ReaderData {
  const $ = cheerio.load(html);

  const rawTitle = $("title").text().trim();
  const title = (rawTitle.replace(/\s*[-–—]\s*arXiv.*$/i, "") || `arXiv:${arxivId}`).trim();

  // --- Paragraphs: body <p>, excluding chrome (dialogs, nav, bibliography, sidebars, header/footer) ---
  const chrome = "dialog p, figure p, table p, .ltx_sidebar p, header p, footer p, nav p, .ltx_bibliography p, [id*='modal'] p";
  const paragraphs: Paragraph[] = [];
  $(`p:not(${chrome.replace(/, /g, ", ")})`).each((_i: number, el: unknown) => {
    const text = $(el as never).text().trim().replace(/\s+/g, " ");
    if (text.length < 10) return; // skip nav remnants / labels
    paragraphs.push({ id: `p${paragraphs.length + 1}`, text });
  });

  // --- Figures: caption + image (img src or object data for SVG) ---
  const figures: Figure[] = [];
  $("figure").each((_i: number, el: unknown) => {
    const $f = $(el as never);
    const caption = $f
      .find("figcaption")
      .first()
      .text()
      .trim()
      .replace(/\s+/g, " ");
    if (!caption) return;

    const numMatch = caption.match(/^(?:Figure|Fig\.?|Table)\s*(\d+)/i);
    const labelMatch = caption.match(/^((?:Figure|Table|Fig\.?)\s*\d+)/i);
    const number = numMatch ? parseInt(numMatch[1], 10) : null;
    const label = labelMatch ? labelMatch[1] : `Figure ${figures.length + 1}`;

    const raw =
      $f.find("object[data]").first().attr("data") ??
      $f.find("img[src]").first().attr("src");

    figures.push({
      id: `f${figures.length + 1}`,
      label,
      number,
      caption,
      imageUrl: resolveImageUrl(raw),
    });
  });

  return { arxivId, title, paragraphs, figures, paraFigureMap: {} };
}

type OpenRouterResponse = {
  choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
};

/**
 * Ask meta/muse-ember (via OpenRouter) for the paragraph->figure map.
 *
 * The model is a reasoning model: with large prompts it spends almost all
 * of its token budget on hidden reasoning and truncates before emitting any
 * content. So we keep prompts small (short prefixes) and split into batches.
 * Each batch is independent; failures are per-batch, not fatal.
 */
export async function buildParaFigureMap(
  paragraphs: Paragraph[],
  figures: Figure[],
): Promise<Record<string, string[]>> {
  if (paragraphs.length === 0 || figures.length === 0) return {};

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("OPENROUTER_API_KEY not set; skipping figure mapping");
    return {};
  }

  const system = [
    "You map scientific paragraphs to the figures they reference.",
    "Return ONLY a compact JSON object (no spaces, no markdown fences).",
    'Example: {"p3":["f1","f2"],"p7":["f4"]}',
    "Keys are paragraph ids, values are arrays of figure ids the paragraph cites",
    'via "Fig. N", "Figure N", or "Table N", or discusses directly.',
    "Omit paragraphs that cite no figures. Do not add commentary.",
  ].join("\n");

  // Compact figure list: id + label only (captions are long and add little
  // to the mapping decision; the "Figure N" text in paragraphs drives it).
  const fText = figures
    .map((f) => `${f.id}:${f.label}`)
    .join(" ");

  const BATCH = 25; // small batches keep reasoning_tokens well under budget
  const combined: Record<string, string[]> = {};

  const batches: Paragraph[][] = [];
  for (let i = 0; i < paragraphs.length; i += BATCH) {
    batches.push(paragraphs.slice(i, i + BATCH));
  }

  const paraIds = new Set(paragraphs.map((p) => p.id));
  const figIds = new Set(figures.map((f) => f.id));

  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const pText = batch
        .map((p) => `${p.id}: ${p.text.slice(0, 500)}`)
        .join("\n");

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "arxiv-reader",
        },
        body: JSON.stringify({
          model: "meta/muse-ember",
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: `Figures: ${fText}\n\nParagraphs:\n${pText}`,
            },
          ],
          temperature: 0.1,
          // Batch is small (25 paras × 500 chars ≈ 3.5k tokens) — reasoning
          // comfortably fits in this budget.
          max_tokens: 6000,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        console.error(`OpenRouter ${res.status} batch (skipped)`);
        return {} as Record<string, string[]>;
      }

      const json = (await res.json()) as OpenRouterResponse;
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content) {
        console.error("OpenRouter empty content (batch skipped)");
        return {} as Record<string, string[]>;
      }

      const cleaned = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned) as Record<string, string[]>;
        const map: Record<string, string[]> = {};
        for (const [paraId, figIds2] of Object.entries(parsed)) {
          if (!paraIds.has(paraId) || !Array.isArray(figIds2)) continue;
          const valid = figIds2.filter((id) => figIds.has(id));
          if (valid.length > 0) map[paraId] = valid;
        }
        return map;
      } catch (err) {
        console.error("Batch JSON parse failed:", err);
        return {} as Record<string, string[]>;
      }
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") Object.assign(combined, r.value);
    else console.error("Batch failed:", r.reason);
  }
  console.log(`Figure mapping: ${Object.keys(combined).length} paragraphs mapped`);
  return combined;
}

/** Full pipeline: extract paper from HTML, then attach the model-built map. */
export async function processPaper(arxivId: string, html: string): Promise<ReaderData> {
  const paper = extractPaper(html, arxivId);
  paper.paraFigureMap = await buildParaFigureMap(paper.paragraphs, paper.figures);
  return paper;
}
