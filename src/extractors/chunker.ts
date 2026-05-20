import type { PageContent } from "../types.js";

export interface Chunk {
  chunkIndex: number;
  pages: PageContent[];
  pageRange: [number, number];
}

/**
 * Splits pages into overlapping chunks for distributed processing.
 *
 * Each chunk is sized to fit comfortably within any provider's context.
 * Overlap ensures questions that span page boundaries are never split.
 */
export function splitIntoChunks(
  pages: PageContent[],
  chunkSize: number = 15,
  overlap: number = 5,
): Chunk[] {
  if (pages.length <= chunkSize) {
    const first = pages[0]?.page ?? 1;
    const last = pages[pages.length - 1]?.page ?? 1;
    return [{ chunkIndex: 0, pages, pageRange: [first, last] }];
  }

  const chunks: Chunk[] = [];
  const stride = chunkSize - overlap;
  if (stride < 1) throw new Error("overlap must be less than chunkSize");

  let start = 0;
  let index = 0;

  while (start < pages.length) {
    const end = Math.min(start + chunkSize, pages.length);
    const slice = pages.slice(start, end);
    const firstPage = slice[0]?.page ?? 1;
    const lastPage = slice[slice.length - 1]?.page ?? 1;

    chunks.push({
      chunkIndex: index,
      pages: slice,
      pageRange: [firstPage, lastPage],
    });

    if (end === pages.length) break;
    start += stride;
    index++;
  }

  return chunks;
}

/**
 * Converts a Chunk's pages into a single markdown string suitable for AI extraction.
 */
export function chunkToMarkdown(chunk: Chunk): string {
  let text = `--- Exam Paper (pages ${chunk.pageRange[0]}-${chunk.pageRange[1]}) ---\n\n`;
  for (const page of chunk.pages) {
    text += `--- Page ${page.page} ---\n`;
    text += page.markdown;
    text += "\n\n";
  }
  text += "--- END OF SECTION ---\n";
  text += "Extract all questions from this section as JSON now.";
  return text;
}
