import { useDropTarget } from "./dropTarget";

type Props = {
  url: string;
  onUrlChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  cached: boolean | null;
};

/**
 * URL bar with drag-drop of a pasted link.
 * Paste is captured at document level so a stray paste anywhere on the page works.
 */
export default function UrlBar({ url, onUrlChange, onSubmit, loading, error, cached }: Props) {
  const { hovering, bind } = useDropTarget((text) => {
    const first = text.trim().split(/\s+/)[0];
    if (first) onUrlChange(first);
  });

  return (
    <div {...bind} className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex gap-2"
      >
        <input
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://arxiv.org/abs/2401.12345"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500"
          aria-label="arXiv URL"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Loading…" : "Open"}
        </button>
      </form>
      {hovering && (
        <p className="mt-1 text-xs text-zinc-500">Drop to use this link</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {cached && (
        <p className="mt-2 text-xs text-zinc-500">Served from cache (no re-fetch)</p>
      )}
    </div>
  );
}
