"use client";

import React, { useCallback, useState } from "react";
import type { ReaderData } from "@/lib/types";
import UrlBar from "@/components/UrlBar";
import ReaderBody from "@/components/ReaderBody";
import FigureSidebar from "@/components/FigureSidebar";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [data, setData] = useState<ReaderData | null>(null);
  const [activeParaId, setActiveParaId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setCached(null);
    setData(null); // clear the previous paper while the new one loads
    setActiveParaId(null);
    window.scrollTo(0, 0);
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        setData(null);
        return;
      }
      const next: ReaderData = json.data;
      setData(next);
      setCached(json.cached ?? false);
      setActiveParaId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [url]);

  const activeFigureIds = React.useMemo(
    () => new Set<string>(activeParaId ? (data?.paraFigureMap[activeParaId] ?? []) : []),
    [activeParaId, data],
  );

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-[1200px]">
          <UrlBar
            url={url}
            onUrlChange={setUrl}
            onSubmit={load}
            loading={loading}
            error={error}
            cached={cached}
          />
        </div>
      </header>

      {!data && !loading && (
        <div className="mx-auto max-w-[650px] px-4 py-16 text-sm text-zinc-600">
          <p className="text-base font-medium">Paste an arXiv link to read it here.</p>
          <p className="mt-2">
            Example: <code>https://arxiv.org/abs/2401.12345</code> — text column is
            650px wide, figures surface in the sidebar as you scroll.
          </p>
        </div>
      )}

      {loading && (
        <div className="mx-auto max-w-[650px] px-4 py-16 text-sm text-zinc-600">
          Fetching from arXiv and reformatting with meta/muse-ember…
        </div>
      )}

      {data && (
        <main className="mx-auto flex max-w-[1200px] justify-center r-0">
          <ReaderBody
            data={data}
            activeParaId={activeParaId}
            onActiveParaChange={setActiveParaId}
          />
          <FigureSidebar
            data={data}
            activeParaId={activeParaId}
            activeFigureIds={activeFigureIds}
          />
        </main>
      )}
    </div>
  );
}
