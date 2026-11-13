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
 * Fetch the arXiv HTML version. A 404 means the paper has no HTML version —
 * common for very recent submissions (arXiv generates HTML asynchronously)
 * and for some older papers. PDF fallback is not yet implemented.
 */
export async function fetchArxivHtml(arxivId: string): Promise<string> {
  const url = `https://arxiv.org/html/${arxivId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "arxiv-reader-demo/0.1 (local demo)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) {
    throw new Error(
      `No HTML version available for arXiv:${arxivId}. This paper may be very new ` +
        `(arXiv generates HTML asynchronously), or too old to have one. ` +
        `Please try again later, or use a paper that has an HTML version.`,
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
 * Extract a paragraph's display HTML: replace <math> with @@K{n}@@
 * placeholders (TeX stored in mathTex), strip inline footnote content
 * (keeping only a small superscript marker), resolve citation links
 * (#bib.*) to external sources, keep <a> links, strip other inline tags.
 * The frontend renders KaTeX for @@K{n}@@ segments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractParagraphHtml(
  $: any,
  el: unknown,
  // bibId -> { url: external URL | full entry text } for citation resolution
  bibExternal: Map<string, { url: string | null; entry: string }>,
): { html: string; mathTex: string[] } {
  const mathTex: string[] = [];
  const $el = $(el as never).clone();

  // Strip inline footnote content, keeping only the superscript marker.
  // arXiv HTML embeds the full footnote text inside body paragraphs —
  // we remove that duplicated text and leave a clean sup marker.
  $el.find(".ltx_note").each((_i: number, nEl: unknown) => {
    const num = $(nEl as never).find(".ltx_note_mark").first().text().trim() || "";
    $(nEl as never).replaceWith(`<sup class="footnote-ref">${num}</sup>`);
  });

  $el.find("math").each((_i: number, mathEl: unknown) => {
    const $math = $(mathEl as never);
    const tex =
      $math.find('annotation[encoding="application/x-tex"]').first().text().trim() ||
      $math.attr("alttext") ||
      "";
    const idx = mathTex.length;
    mathTex.push(tex);
    $(mathEl as never).replaceWith(`@@K${idx}@@`);
  });

  $el.find("a").each((_i: number, aEl: unknown) => {
    const href = $(aEl as never).attr("href") || "";
    // Citation links (#bib.*): rewrite to the external source (arXiv/DOI).
    // Goal: reader never has to jump to a bibliography at the end.
    if (href.startsWith("#bib.")) {
      const bibId = href.slice(1); // e.g. "bib.bib18"
      const info = bibExternal.get(bibId);
      if (info?.url) {
        // Resolved citation → external source (new tab, no page jump)
        $(aEl as never).attr("href", info.url);
        $(aEl as never).attr("target", "_blank");
        $(aEl as never).attr("rel", "noopener noreferrer");
        $(aEl as never).attr("title", info.entry);
      } else if (info?.entry) {
        // No external URL: link to Google Scholar search for this source,
        // with the full bibliography entry as a tooltip.
        // Scholar ranks best with a *short* query (first author + title).
        // The entry text is "Author et al., (Year) Full Authors... Title. Venue."
        // We extract a compact query: first author(s) + first N chars + year.
        const scholarQuery = scholarQueryFromEntry(info.entry);
        const scholar = `https://scholar.google.com/scholar?q=${encodeURIComponent(scholarQuery)}`;
        $(aEl as never).attr("href", scholar);
        $(aEl as never).attr("target", "_blank");
        $(aEl as never).attr("rel", "noopener noreferrer");
        $(aEl as never).attr("title", info.entry);
      } else {
        // No bib info at all — keep the citation text as plain text.
        $(aEl as never).replaceWith(normalizeCitation($(aEl as never).text()));
      }
      // Normalize double commas: "Bender et al.,, 2021" → "Bender et al., 2021"
      const rawText = $(aEl as never).text();
      $(aEl as never).text(normalizeCitation(rawText));
    } else if (href.startsWith("http") || href.startsWith("/") || href.startsWith("arxiv.org")) {
      // Absolute links: arxiv.org/html/... should open arXiv directly
      if (href.startsWith("arxiv.org/")) {
        $(aEl as never).attr("href", `https://${href}`);
      }
      $(aEl as never).attr("target", "_blank");
      $(aEl as never).attr("rel", "noopener noreferrer");
    } else if (href.startsWith("#")) {
      // Other internal anchors (figures/sections): remove link, keep text.
      $(aEl as never).replaceWith($(aEl as never).text());
    }
  });

  let html = $el.html() as string;
  html = html.replace(/\s+/g, " ").trim();
  return { html, mathTex };
}
/** Fix common citation punctuation artifacts: double commas, stray spaces. */
function normalizeCitation(text: string): string {
  return text
    .replace(/,\s*,/g, ",")            // ",, " → ", "
    .replace(/\s+([,.;:])/g, "$1")    // remove space before punctuation
    .replace(/([,.;:])\s*([,.;:])/g, "$1 ") // dedupe punctuation clusters
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Build a short Google Scholar query from a full bibliography entry.
 * Entry format: "Author et al., (Year) Full Authors. Title. Venue."
 * Scholar ranks best on "first-author title year" — long author lists
 * dilute the signal and push the desired paper down the results.
 * e.g. "Bender et al., (2021) Bender, E. M., ... On the dangers of stochastic
 * parrots..." → "Bender et al. On the dangers of stochastic parrots 2021"
 */
function scholarQueryFromEntry(entry: string): string {
  // Split off the "Author et al., (Year)" header in one go. `[^(]*?` is lazy
  // so it stops at the first "(YYYY" — handles multi-author forms like
  // "Rudinger et al., (2018) Rudinger, R., ..." correctly.
  const m = entry.match(/^([^(]*?)\((\d{4})[a-z]?\)\s*(.*)$/);
  if (!m) return entry.slice(0, 120).trim();
  const [, header, year, rest] = m;
  // strip "et al.," suffix then take the LAST surname token
  // ("Bender et al.," → "Bender"; "Y. Li, Y. Ma, ..." → header keeps first few)
  const firstSurname =
    header
      .replace(/\s+et al\.?\s*,?\s*$/i, "")
      .replace(/,\s*$/, "")
      .split(/\s+/)
      .pop()
      ?.replace(/[^A-Za-zÀ-ÿ]/g, "") || header.trim();
  // `rest` is "Rudinger, R., Naradowsky, J., ... (2018). Title. Venue." —
  // the author list itself ends with "(YYYY)." then the title begins.
  // Find that boundary directly: title starts after the first "(YYYY)."
  const titleStart = rest.search(/\(\d{4}\)\.\s+/);
  let titleSegment: string;
  if (titleStart !== -1) {
    titleSegment = rest.slice(titleStart).replace(/^\(\d{4}\)\.\s+/, "").split(/\.\s+/)[0] ?? "";
  } else {
    // Fallback: first segment that isn't an author-list fragment.
    const segments = rest.split(/\.\s+/);
    titleSegment =
      segments.find((s) => !/^[A-ZÀ-Ÿ][a-zà-ÿ-]+,\s*[A-Z]\./.test(s.trim()) && s.trim().length > 5) ||
      segments[0] ||
      "";
  }
  const shortTitle = titleSegment.split(/\s+/).slice(0, 8).join(" ");
  return `${firstSurname} ${shortTitle} ${year}`.replace(/\s+/g, " ").trim();
}

export function extractPaper(html: string, arxivId: string): ReaderData {
  const $ = cheerio.load(html);

  const rawTitle = $("title").text().trim();
  const title = (rawTitle.replace(/\s*[-–—]\s*arXiv.*$/i, "") || `arXiv:${arxivId}`).trim();

  // --- Build bibId -> { url, entry } map from the bibliography ---
  // arXiv HTML renders bibliography entries as plain text — arXiv IDs and
  // DOIs appear as *text* (e.g. "arXiv:2012.05672"), not as <a> links.
  // The source page itself has no working external links for citations.
  // Priority: if the source HTML *does* contain a link (some papers do),
  // use it directly. Otherwise resolve from the text: arXiv ID → arxiv.org,
  // DOI → doi.org. Scholar fallback only when neither is present.
  const bibExternal = new Map<string, { url: string | null; entry: string }>();
  $(".ltx_bibliography li").each((_i: number, el: unknown) => {
    const id = $(el as never).attr("id");
    if (!id) return;
    const entry = $(el as never).text().replace(/\s+/g, " ").trim();
    // 1) Direct <a> link in the source (if the paper's HTML has one)
    const directHref = $(el as never).find("a[href^='http']").first().attr("href");
    let url: string | null = directHref ?? null;
    // 2) Text-based resolution: arXiv ID or DOI appearing in the entry
    if (!url) {
      const arxivMatch = entry.match(/arXiv:(\d{4}\.\d{4,5})/i);
      const doiMatch = entry.match(/DOI:\s*([^\s,;]+)/i) || entry.match(/10\.\d{4,}\/[^\s,;]+/i);
      if (arxivMatch) {
        url = `https://arxiv.org/abs/${arxivMatch[1]}`;
      } else if (doiMatch) {
        const doi = doiMatch[1] || doiMatch[0];
        url = `https://doi.org/${doi.replace(/^DOI:\s*/i, "")}`;
      }
    }
    bibExternal.set(id, { url, entry });
  });

  // --- Paragraphs: body <p>, excluding chrome (dialogs, nav, bibliography, sidebars, header/footer) ---
  const chrome = "dialog p, figure p, table p, .ltx_sidebar p, header p, footer p, nav p, .ltx_bibliography p, [id*='modal'] p";
  const paragraphs: Paragraph[] = [];
  $(`p:not(${chrome.replace(/, /g, ", ")})`).each((_i: number, el: unknown) => {
    const text = $(el as never).text().trim().replace(/\s+/g, " ");
    if (text.length < 10) return; // skip nav remnants / labels
    const { html, mathTex } = extractParagraphHtml($, el, bibExternal);
    // text is the plain version; html has @@K@@ placeholders + links
    paragraphs.push({ id: `p${paragraphs.length + 1}`, text, html, mathTex });
  });

  // --- Figures: caption + image (img src or object data for SVG) or table HTML ---
  // arXiv HTML sometimes splits one logical figure/table across multiple
  // <figure> elements (panels share an id prefix like S3.T2.fig1.S...).
  // We merge panels that share the same label AND number into one Figure,
  // preferring the panel with an image; tableHtml is only kept when no
  // image exists.
  const merged = new Map<
    string,
    { caption: string; label: string; number: number | null; kind: "figure" | "table"; imageUrl: string | null; tableHtml: string | null }
  >();

  $("figure").each((_i: number, el: unknown) => {
    const $f = $(el as never);
    const caption = $f
      .find("figcaption")
      .first()
      .text()
      .trim()
      .replace(/\s+/g, " ");
    if (!caption) return;

    const numMatch = caption.match(/^(Figure|Fig\.?|Table)\s*(\d+)/i);
    const kind = numMatch && numMatch[1].toLowerCase().startsWith("table") ? "table" : "figure";
    const labelMatch = caption.match(/^((?:Figure|Table|Fig\.?)\s*\d+)/i);
    const number = numMatch ? parseInt(numMatch[2], 10) : null;
    const rawId = $f.attr("id") || "";
    const panelKey = rawId.replace(/\.sf\d+$/, "").replace(/\.fig\d+$/, "");
    const label = labelMatch ? labelMatch[1] : panelKey || `Figure ${merged.size + 1}`;

    const raw =
      $f.find("object[data]").first().attr("data") ??
      $f.find("img[src]").first().attr("src");

    const $table = $f.find("table").first();
    const tableHtml = !raw && $table.length ? $.html($table.get(0)) : null;

    // Normalize key: container (S3.T2) and its panel (S3.T2.fig1) share a
    // logical figure/table — merge by the shortest id prefix among siblings.
    // kind is part of the key so `Figure 2` and `Table 2` never collide.
    const key = `${kind}|${label.toLowerCase()}|${number ?? ""}|${panelKey}`;
    const existing = merged.get(key);
    if (existing) {
      // Merge: prefer an image over nothing; keep the first tableHtml if
      // the merged figure has none yet. Caption differences for panels are
      // ignored (they describe the same figure/table).
      if (!existing.imageUrl && raw) {
        existing.imageUrl = resolveImageUrl(raw);
        existing.tableHtml = null; // image wins over table
      } else if (!existing.tableHtml && tableHtml) {
        existing.tableHtml = tableHtml;
      }
      // Keep the longest caption (most informative panel)
      if (caption.length > existing.caption.length) existing.caption = caption;
    } else {
      merged.set(key, {
        caption,
        label,
        number,
        kind,
        imageUrl: resolveImageUrl(raw),
        tableHtml,
      });
    }
  });

  const figures: Figure[] = [...merged.values()].map((m, i) => ({
    id: `f${i + 1}`,
    label: m.label,
    number: m.number,
    kind: m.kind,
    caption: m.caption,
    imageUrl: m.imageUrl,
    tableHtml: m.tableHtml,
  }));

  return { arxivId, title, paragraphs, figures, paraFigureMap: {} };
}

type OpenRouterResponse = {
  choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
};

/**
 * Deterministic regex mapping: scan each paragraph for "Figure N" / "Fig. N"
 * / "Table N" citations (including ranges like "Figures 46–50") and link to
 * the matching figures by number. Free, instant, and more accurate than the
 * LLM for explicit citations. See comparison data: regex found 43 mappings
 * vs LLM's 37 on 2203.02155, with only 1 LLM-only catch (ps183 range).
 */
export function buildRegexFigureMap(
  paragraphs: Paragraph[],
  figures: Figure[],
): Record<string, string[]> {
  // Index by (kind, number) so `Figure 2` only links fig f2 and `Table 2`
  // only links table f5 — papers number figures and tables independently.
  const figByKindNumber = new Map<string, string[]>();
  for (const f of figures) {
    if (f.number != null) {
      const key = `${f.kind}:${f.number}`;
      const existing = figByKindNumber.get(key) ?? [];
      existing.push(f.id);
      figByKindNumber.set(key, existing);
    }
  }

  const map: Record<string, string[]> = {};
  // Capture the kind prefix: "Figure 1" → figure, "Table 1" → table, "Fig. 3" → figure.
  const pattern = /(Figures?|Figs?\.?|Tables?)\s*(\d+)(?:\s*[–—-]\s*(\d+))?/gi;

  for (const p of paragraphs) {
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(p.text)) !== null) {
      const kind = m[1].toLowerCase().startsWith("table") ? "table" : "figure";
      const start = parseInt(m[2], 10);
      const end = m[3] ? parseInt(m[3], 10) : start;
      for (let n = start; n <= Math.min(end, start + 9); n++) {
        const ids = figByKindNumber.get(`${kind}:${n}`);
        if (ids) ids.forEach((id) => found.add(id));
      }
    }
    if (found.size > 0) map[p.id] = [...found];
  }
  return map;
}

/**
 * Ask meta/muse-ember (via OpenRouter) for the paragraph->figure map.
 *
 * The model is a reasoning model: with large prompts it spends almost all
 * of its token budget on hidden reasoning and truncates before emitting any
 * content. So we keep prompts small (short prefixes) and split into batches.
 * Each batch is independent; failures are per-batch, not fatal.
 *
 * NOTE: Kept as an alternative to buildRegexFigureMap — the regex is free
 * and usually more accurate for explicit citations. The LLM catches implicit
 * references and figure ranges. See USE_LLM_MAPPING flag in processPaper().
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

/**
 * Generate a 1–2 sentence plain-English explanation for each figure using
 * Muse Ember. Batched (10 figures/call, parallel). Each figure gets its
 * caption + up to 3 citing paragraphs as context. Returns {figId: gloss}.
 * On any failure returns {} — captions still render, reader unaffected.
 */
export async function buildFigureExplanations(
  paragraphs: Paragraph[],
  figures: Figure[],
  paraFigureMap: Record<string, string[]>,
): Promise<Record<string, string>> {
  if (figures.length === 0) return {};

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("OPENROUTER_API_KEY not set; skipping explanations");
    return {};
  }

  // Invert the map: figureId -> [paragraphs that cite it]
  const citing: Record<string, Paragraph[]> = {};
  for (const [paraId, figIds] of Object.entries(paraFigureMap)) {
    const p = paragraphs.find((x) => x.id === paraId);
    if (!p) continue;
    for (const fid of figIds) {
      (citing[fid] ??= []).push(p);
    }
  }

  const system = [
    "You explain scientific figures to non-expert readers.",
    "For each figure, write one or two sentences in plain English explaining what the figure shows and its significance in the paper.",
    'Return ONLY a compact JSON object (no markdown fences): {"f1":"...","f2":"..."}',
    "Use the caption and citing paragraph text provided for each figure.",
    "Do not hallucinate numbers beyond what the caption/text state.",
  ].join("\n");

  // Small batches: 10 figures × (caption + 3 cites) is ~4k prompt tokens,
  // and this reasoning model spends ~2k on hidden reasoning. A 3000 budget
  // truncates mid-JSON ("Unterminated string"). Use 8/batch + 8000 budget.
  const BATCH = 8;
  const combined: Record<string, string> = {};

  const batches: Figure[][] = [];
  for (let i = 0; i < figures.length; i += BATCH) {
    batches.push(figures.slice(i, i + BATCH));
  }

  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const fText = batch
        .map((f) => {
          const cites = (citing[f.id] ?? [])
            .slice(0, 3)
            .map((p) => p.text.slice(0, 400))
            .join(" ");
          return `${f.id} (${f.label}): ${f.caption.slice(0, 400)}${cites ? `\n  Cited: ${cites}` : ""}`;
        })
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
            { role: "user", content: fText },
          ],
          temperature: 0.3,
          max_tokens: 8000,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        console.error(`OpenRouter ${res.status} explanation batch (skipped)`);
        return {} as Record<string, string>;
      }

      const json = (await res.json()) as OpenRouterResponse;
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content) {
        console.error("OpenRouter empty content (explanation batch skipped)");
        return {} as Record<string, string>;
      }

      const cleaned = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned) as Record<string, string>;
        const out: Record<string, string> = {};
        const figIds = new Set(batch.map((f) => f.id));
        for (const [fid, gloss] of Object.entries(parsed)) {
          if (figIds.has(fid) && typeof gloss === "string" && gloss.trim()) {
            out[fid] = gloss.trim();
          }
        }
        return out;
      } catch (err) {
        console.error("Explanation batch JSON parse failed:", err);
        return {} as Record<string, string>;
      }
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") Object.assign(combined, r.value);
    else console.error("Explanation batch failed:", r.reason);
  }
  console.log(`Figure explanations: ${Object.keys(combined).length}/${figures.length}`);
  return combined;
}

/** Full pipeline: extract paper, map via regex (default) or LLM, attach explanations. */
export async function processPaper(arxivId: string, html: string): Promise<ReaderData> {
  const paper = extractPaper(html, arxivId);

  // Regex mapping is the default — free, instant, and more accurate for
  // explicit citations. Set USE_LLM_MAPPING=1 to use the LLM instead.
  const useLlm = process.env.USE_LLM_MAPPING === "1";
  if (useLlm) {
    paper.paraFigureMap = await buildParaFigureMap(paper.paragraphs, paper.figures);
  } else {
    paper.paraFigureMap = buildRegexFigureMap(paper.paragraphs, paper.figures);
  }

  // Figure explanations (Muse Ember) — failure-safe, doesn't block the reader.
  const explanations = await buildFigureExplanations(
    paper.paragraphs,
    paper.figures,
    paper.paraFigureMap,
  );
  for (const f of paper.figures) {
    if (explanations[f.id]) f.explanation = explanations[f.id];
  }

  return paper;
}
