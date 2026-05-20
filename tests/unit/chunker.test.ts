import { describe, it, expect } from "vitest";
import { splitIntoChunks, chunkToMarkdown } from "../../src/extractors/chunker.js";
import type { PageContent } from "../../src/types.js";

function makePage(page: number, text?: string): PageContent {
  return { page, markdown: text ?? `Content of page ${page}`, isBilingual: false };
}

describe("splitIntoChunks", () => {
  it("returns single chunk for small page count", () => {
    const pages = [makePage(1), makePage(2), makePage(3)];
    const chunks = splitIntoChunks(pages, 15, 5);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].pageRange).toEqual([1, 3]);
  });

  it("creates overlapping chunks for large page count", () => {
    const pages = Array.from({ length: 30 }, (_, i) => makePage(i + 1));
    const chunks = splitIntoChunks(pages, 10, 3);
    expect(chunks.length).toBeGreaterThan(1);
    // Verify overlap
    expect(chunks[0].pageRange[1]).toBeGreaterThanOrEqual(chunks[1].pageRange[0]);
  });

  it("all chunks cover all pages", () => {
    const pages = Array.from({ length: 25 }, (_, i) => makePage(i + 1));
    const chunks = splitIntoChunks(pages, 10, 3);
    const covered = new Set<number>();
    for (const c of chunks) {
      for (const p of c.pages) {
        covered.add(p.page);
      }
    }
    for (let i = 1; i <= 25; i++) {
      expect(covered.has(i)).toBe(true);
    }
  });

  it("throws if overlap >= chunkSize", () => {
    const pages = Array.from({ length: 20 }, (_, i) => makePage(i + 1));
    expect(() => splitIntoChunks(pages, 5, 5)).toThrow();
    expect(() => splitIntoChunks(pages, 5, 6)).toThrow();
  });

  it("works with edge case of 0 pages", () => {
    const chunks = splitIntoChunks([], 10, 3);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pages).toHaveLength(0);
  });
});

describe("chunkToMarkdown", () => {
  it("produces correct format", () => {
    const chunk = { chunkIndex: 0, pages: [makePage(1, "Hello"), makePage(2, "World")], pageRange: [1, 2] as [number, number] };
    const md = chunkToMarkdown(chunk);
    expect(md).toContain("--- Exam Paper (pages 1-2) ---");
    expect(md).toContain("--- Page 1 ---");
    expect(md).toContain("Hello");
    expect(md).toContain("--- Page 2 ---");
    expect(md).toContain("World");
    expect(md).toContain("--- END OF SECTION ---");
  });
});
