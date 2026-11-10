"use client";

import { useEffect, useRef } from "react";
import type { ReaderData } from "@/lib/types";
import FigureCard from "./FigureCard";

type Props = {
  data: ReaderData;
  activeParaId: string | null;
  activeFigureIds: Set<string>;
};

/**
 * Margin figures: sticky sidebar with its own scroll. The list is in natural
 * figure order (NOT reordered), and on window scroll the inner list is
 * scrolled so the active figure appears at the same viewport Y as the
 * active paragraph — the figure floats next to its paragraph.
 */
export default function FigureSidebar({ data, activeParaId, activeFigureIds }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const container = scrollRef.current;
      if (!container) return;

      const activePara = document.querySelector<HTMLElement>(
        "[data-para-id][data-active='true']",
      );
      if (!activePara) return;

      const firstActiveId = [...activeFigureIds][0];
      if (!firstActiveId) return;
      const figEl = document.getElementById(`fig-${firstActiveId}`);
      if (!figEl) return;

      const paraTop = activePara.getBoundingClientRect().top;
      const figTop = figEl.getBoundingClientRect().top;
      // FIX: sign was inverted. scrollTop increase moves content up, so to
      // bring figTop to paraTop we need delta = figTop - paraTop.
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
  }, [activeParaId, activeFigureIds]);

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
              active figure next to its paragraph. */}
          {data.figures.map((f) => (
            <FigureCard key={f.id} figure={f} active={activeFigureIds.has(f.id)} />
          ))}
        </div>
      </div>
    </aside>
  );
}
