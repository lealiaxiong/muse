"use client";

import { useState } from "react";
import type { Figure } from "@/lib/types";
import FigureLightbox from "./FigureLightbox";

type Props = {
  figure: Figure;
  /** True when this figure is linked from the currently visible paragraph */
  active: boolean;
  /** Carousel position info — only set on the carousel's active card */
  carousel?: {
    index: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
  };
};

export default function FigureCard({ figure, active, carousel }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const clickable = !!figure.imageUrl || !!figure.tableHtml;

  const body = figure.imageUrl ? (
    // Use <img> for both PNG and SVG — <object> swallows click events so it
    // breaks the lightbox. Browsers render SVG in <img> fine.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={figure.imageUrl}
      alt={figure.caption || figure.label}
      className={`max-h-64 w-full object-contain ${clickable ? "pointer-events-none" : ""}`}
      loading="lazy"
    />
  ) : figure.tableHtml ? (
    <div
      className="max-h-64 overflow-auto text-xs text-zinc-800 [&_table]:border-collapse [&_th]:border-b [&_th]:border-zinc-300 [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_th]:align-top [&_td]:px-1.5 [&_td]:py-0.5 [&_td]:align-top [&_td]:break-words"
      dangerouslySetInnerHTML={{ __html: figure.tableHtml }}
    />
  ) : (
    <div className="flex h-24 items-center justify-center rounded bg-zinc-100 text-xs text-zinc-500">
      No image available
    </div>
  );

  return (
    <>
      <figure
        id={`fig-${figure.id}`}
        className={`rounded-lg border bg-white p-3 shadow-sm transition ${
          active
            ? "border-violet-500 bg-violet-100 ring-1 ring-violet-400"
            : "border-zinc-200"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <figcaption className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            {figure.label}
          </figcaption>
          {clickable && (
            <span className="text-xs text-zinc-400" title="Click to expand">
              ⤢
            </span>
          )}
        </div>
        {clickable ? (
          <div
            onClick={() => setLightboxOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") setLightboxOpen(true);
            }}
            className="cursor-zoom-in transition hover:scale-[1.02] hover:shadow-lg"
          >
            {body}
          </div>
        ) : (
          body
        )}
        {carousel && carousel.total > 1 && (
          <div className="mt-2 flex items-center justify-center gap-3 border-t border-violet-200 pt-2">
            <button
              onClick={carousel.onPrev}
              className="rounded border border-violet-300 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-40"
              disabled={carousel.index === 0}
              aria-label="Previous figure"
            >
              ‹
            </button>
            <span className="text-xs font-medium text-violet-800">
              {carousel.index + 1} / {carousel.total}
            </span>
            <span className="flex gap-1" aria-hidden>
              {Array.from({ length: carousel.total }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === carousel.index ? "bg-violet-600" : "bg-violet-200"
                  }`}
                />
              ))}
            </span>
            <button
              onClick={carousel.onNext}
              className="rounded border border-violet-300 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-40"
              disabled={carousel.index === carousel.total - 1}
              aria-label="Next figure"
            >
              ›
            </button>
          </div>
        )}
        {figure.caption && (
          <p className="mt-2 text-xs leading-5 text-zinc-600">{figure.caption}</p>
        )}
        {figure.explanation && (
          <p className="mt-2 border-l-2 border-blue-400 bg-blue-50 px-2 py-1 text-xs leading-5 text-blue-900">
            <span className="font-semibold">In short:</span> {figure.explanation}
          </p>
        )}
      </figure>
      {lightboxOpen && (
        <FigureLightbox
          figure={figure}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
