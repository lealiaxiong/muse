import type { Figure } from "@/lib/types";

type Props = {
  figure: Figure;
  /** True when this figure is linked from the currently visible paragraph */
  active: boolean;
};

export default function FigureCard({ figure, active }: Props) {
  return (
    <figure
      id={`fig-${figure.id}`}
      className={`rounded-lg border bg-white p-3 shadow-sm transition ${
        active ? "border-zinc-900" : "border-zinc-200"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <figcaption className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {figure.label}
        </figcaption>
      </div>
      {figure.imageUrl ? (
        figure.imageUrl.endsWith(".svg") ? (
          // <img> can't render SVG <object> reliably at any size; use <object> which preserves detail
          <object
            data={figure.imageUrl}
            type="image/svg+xml"
            className="h-auto max-h-64 w-full"
            aria-label={figure.caption || figure.label}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={figure.imageUrl}
            alt={figure.caption || figure.label}
            className="max-h-64 w-full object-contain"
            loading="lazy"
          />
        )
      ) : (
        <div className="flex h-24 items-center justify-center rounded bg-zinc-100 text-xs text-zinc-500">
          No image URL from source
        </div>
      )}
      {figure.caption && (
        <p className="mt-2 text-xs leading-5 text-zinc-600">{figure.caption}</p>
      )}
    </figure>
  );
}
