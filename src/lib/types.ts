export interface Figure {
  /** Stable internal id, e.g. "f1" */
  id: string;
  /** Display label, e.g. "Figure 1" */
  label: string;
  /** Figure number parsed from caption (1-based), if available */
  number: number | null;
  caption: string;
  imageUrl: string | null;
}

export interface Paragraph {
  /** Stable internal id, e.g. "p12" */
  id: string;
  text: string;
}

export interface ReaderData {
  arxivId: string;
  title: string;
  paragraphs: Paragraph[];
  figures: Figure[];
  /** paraId -> [figureId, ...] */
  paraFigureMap: Record<string, string[]>;
}
