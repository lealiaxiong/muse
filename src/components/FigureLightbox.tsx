"use client";

import { useCallback, useEffect } from "react";
import type { Figure } from "@/lib/types";

type Props = {
  figure: Figure | null;
  onClose: () => void;
};

/**
 * Full-screen lightbox: click backdrop or press Escape to close.
 * Renders the same image (or table HTML) as the sidebar card, but at natural size.
 *
 * Rendered via createPortal to document.body at z-100 so it always sits
 * above the sticky header (z-10) — a modal must cover the whole page,
 * including the URL bar. This is the standard pattern (shadcn/Radix use
 * portals for the same reason: stacking contexts can otherwise trap the
 * overlay under ancestors).
 */
import { createPortal } from "react-dom";
export default function FigureLightbox({ figure, onClose }: Props) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (figure) {
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }
  }, [figure, handleKey]);

  if (!figure) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={figure.label}
    >
      <div
        className="relative max-h-full max-w-full overflow-auto rounded-lg bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-zinc-900 px-2 py-1 text-xs text-white"
          aria-label="Close"
        >
          ✕
        </button>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-600">
          {figure.label}
        </h3>
        {figure.imageUrl ? (
          // <img> for both PNG and SVG (object swallows clicks / rendering differs)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={figure.imageUrl}
            alt={figure.caption || figure.label}
            className="mx-auto max-h-[70vh] w-auto max-w-[min(900px,85vw)]"
          />
        ) : figure.tableHtml ? (
          <div
            className="max-w-full overflow-auto text-sm [&_table]:border-collapse [&_th]:border-b [&_th]:border-zinc-200 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:align-top [&_td]:px-2 [&_td]:py-1 [&_td]:align-top"
            dangerouslySetInnerHTML={{ __html: figure.tableHtml }}
          />
        ) : (
          <p className="text-sm text-zinc-500">No image available</p>
        )}
        {figure.caption && (
          <p className="mx-auto mt-4 w-full max-w-[min(900px,85vw)] text-sm leading-6 text-zinc-700">
            {figure.caption}
          </p>
        )}
        {figure.explanation && (
          <p className="mx-auto mt-3 w-full max-w-[min(900px,85vw)] border-l-2 border-blue-400 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-900">
            <span className="font-semibold">In short:</span> {figure.explanation}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
