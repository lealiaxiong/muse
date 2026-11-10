import type { ReaderData } from "./types";

/**
 * In-memory cache keyed by arXiv ID (not URL) so that
 * /abs/..., /html/..., and /pdf/... for the same paper share one entry.
 * Clears on server restart; fine for a local demo.
 */
const cache = new Map<string, ReaderData>();

export function getCached(arxivId: string): ReaderData | undefined {
  return cache.get(arxivId);
}

export function setCached(arxivId: string, data: ReaderData): void {
  cache.set(arxivId, data);
}
