"use client";

import { useEffect, useRef, useState } from "react";
import type { ReaderData } from "@/lib/types";
import FigureCard from "./FigureCard";

type Props = {
  data: ReaderData;
  activeParaId: string | null;
  activeFigureIds: Set<string>;
};

/**
 * Margin figures: sticky sidebar with its own scroll. The list is in natural
 * figure order, and on window scroll the inner list is scrolled so the active
 * figure appears at the same viewport Y as the active paragraph.
 *
 * Multi-figure paragraphs get a carousel: the active slot shows one figure
 * at a time with prev/next nav and dots. When the paragraph changes, the
 * carousel resets to index 0. While scrolling within the same paragraph,
 * the chosen index is preserved (no auto-advance).
 */
export default function FigureSidebar({ data, activeParaId, activeFigureIds }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Carousel state: index within the active paragraph's figure list.
  // Reset to 0 whenever the active paragraph changes.
  const [carouselIndex, setCarouselIndex] = useState(0);

  useEffect(() => {
    setCarouselIndex(0);
  }, [activeParaId]);

  // Ordered list of figures cited by the active paragraph (in reading order,
  // as returned by the regex map). Empty when the paragraph cites nothing.
  const activeFigures = [...activeFigureIds]
    .map((id) => data.figures.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => !!f);
  const carouselTotal = activeFigures.length;
  const clampedIndex = carouselIndex >= carouselTotal ? carouselTotal - 1 : carouselIndex;
  const currentCarouselFigure = carouselTotal > 0 ? activeFigures[clampedIndex] : null;

  const onPrev = () => setCarouselIndex((i) => Math.max(0, i - 1));
  const onNext = () => setCarouselIndex((i) => Math.min(carouselTotal - 1, i + 1));

  useEffect(() => {
    const sync = () => {
      const container = scrollRef.current;
      if (!container) return;

      const activePara = document.querySelector<HTMLElement>(
        "[data-para-id][data-active='true']",
      );
      if (!activePara) return;

      // Align the currently shown carousel figure (or first active figure).
      const targetId = currentCarouselFigure?.id ?? [...activeFigureIds][0];
      if (!targetId) return;
      const figEl = document.getElementById(`fig-${targetId}`);
      if (!figEl) return;

      const paraTop = activePara.getBoundingClientRect().top;
      const figTop = figEl.getBoundingClientRect().top;
      container.scrollTop += figTop - paraTop;
      container.scrollTop = Math.max(
        0,
        Math.min(container.scrollTop, container.scrollHeight - container.clientHeight),
      );
    };

    let raf = 0;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(() => {
        sync();
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    sync();

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [activeParaId, activeFigureIds, currentCarouselFigure]);

  if (data.figures.length === 0) {
    return (
      <aside className="w-80 shrink-0 p-4 text-sm text-zinc-500">
        No figures detected in this paper.
      </aside>
    );
  }

  return (
    <aside className="w-80 shrink-0 p-4">
      <div className="sticky top-[4.5rem] flex max-h-[calc(100vh-5.5rem)] flex-col">
        <h2 className="pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Figures
        </h2>
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 pr-1"
        >
          {/* Natural order — no reordering. The scroll-sync above places the
              active figure next to its paragraph. The carousel figure carries
              the prev/next nav; other linked figures keep natural position. */}
          {data.figures.map((f) => (
            <FigureCard
              key={f.id}
              figure={f}
              active={activeFigureIds.has(f.id)}
              carousel={
                currentCarouselFigure?.id === f.id && carouselTotal > 1
                  ? {
                      index: clampedIndex,
                      total: carouselTotal,
                      onPrev,
                      onNext,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
