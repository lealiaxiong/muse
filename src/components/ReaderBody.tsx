"use client";

import { useEffect, useRef } from "react";
import type { ReaderData } from "@/lib/types";

type Props = {
  data: ReaderData;
  activeParaId: string | null;
  onActiveParaChange: (id: string | null) => void;
};

/**
 * Main reading column, fixed 650px width, centered.
 * An IntersectionObserver reports which paragraph is centered in the
 * viewport — that drives the sidebar highlight.
 */
export default function ReaderBody({ data, activeParaId, onActiveParaChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onActiveParaChange(entry.target.id.replace(/^para-/, ""));
          }
        }
      },
      { root: null, rootMargin: "-40% 0px -40% 0px", threshold: 0 },
    );

    root.querySelectorAll("[data-para-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [data, onActiveParaChange]);

  const linkedParaIds = new Set(Object.keys(data.paraFigureMap));

  return (
    <article
      ref={containerRef}
      className="w-full max-w-[650px] shrink-0 px-4 py-6"
      aria-label="Paper"
    >
      <h1 className="mb-6 text-2xl font-semibold leading-snug">{data.title}</h1>
      <p className="mb-8 text-xs text-zinc-500">arXiv:{data.arxivId}</p>

      {data.paragraphs.map((p) => {
        const isActive = p.id === activeParaId;
        const isLinked = linkedParaIds.has(p.id);
        return (
          <p
            key={p.id}
            id={`para-${p.id}`}
            data-para-id={p.id}
            data-active={isActive ? "true" : "false"}
            className={`mb-5 rounded-md px-3 py-1 text-[17px] leading-[1.7] transition-colors ${
              isActive && isLinked
                ? "bg-violet-100 text-violet-950 ring-1 ring-violet-400"
                : isLinked
                  ? "border-l-4 border-violet-400 bg-violet-50"
                  : "text-zinc-800"
            }`}
          >
            {p.text}
          </p>
        );
      })}
    </article>
  );
}
