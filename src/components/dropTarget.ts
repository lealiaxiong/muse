import { useEffect, useState } from "react";

/**
 * Detects drag-over on the document and exposes the dropped text.
 * Used for drag-drop of arXiv links anywhere on the page.
 */
export function useDropTarget(onDrop: (text: string) => void) {
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setHovering(true);
    };
    const onDragLeave = () => setHovering(false);
    const onDropHandler = (e: DragEvent) => {
      e.preventDefault();
      setHovering(false);
      const text = e.dataTransfer?.getData("text/plain") ?? "";
      if (text) onDrop(text);
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDropHandler);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDropHandler);
    };
  }, [onDrop]);

  return { hovering, bind: {} };
}
