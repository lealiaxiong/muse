import { NextRequest, NextResponse } from "next/server";
import { getCached, setCached } from "@/lib/cache";
import { extractArxivId, fetchArxivHtml, processPaper } from "@/lib/paper";

// Allow up to 60s for OpenRouter explanation batches (Vercel Hobby caps at
// 10s by default; this export extends it — see vercel.json maxDuration).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = body.url?.trim() ?? "";
  const arxivId = extractArxivId(url);
  if (!arxivId) {
    return NextResponse.json(
      { error: "Provide an arXiv URL (e.g. https://arxiv.org/abs/2401.12345)" },
      { status: 400 },
    );
  }

  const cached = getCached(arxivId);
  if (cached) return NextResponse.json({ data: cached, cached: true });

  try {
    const html = await fetchArxivHtml(arxivId);
    const data = await processPaper(arxivId, html);
    setCached(arxivId, data);
    return NextResponse.json({ data, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
