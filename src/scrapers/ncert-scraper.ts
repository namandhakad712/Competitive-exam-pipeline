import { mkdir } from "fs/promises";
import { join } from "path";
import { logger } from "../utils/logger.js";
import { downloadPdf } from "../utils/pdf-downloader.js";
import type { ScraperResult, Subject } from "../types.js";

const PDF_DIR = process.env.PDF_TEMP_DIR ?? join(process.cwd(), "temp");

interface NcertBook {
  subject: Subject;
  code: string;
  label: string;
}

const NCERT_EXEMPLAR_BOOKS: Record<number, NcertBook[]> = {
  11: [
    { subject: "physics", code: "keph2", label: "physics-part-1" },
    { subject: "physics", code: "keph3", label: "physics-part-2" },
    { subject: "chemistry", code: "kech2", label: "chemistry-part-1" },
    { subject: "chemistry", code: "kech3", label: "chemistry-part-2" },
    { subject: "mathematics", code: "kemh2", label: "mathematics" },
    { subject: "biology", code: "kebo2", label: "biology" },
  ],
  12: [
    { subject: "physics", code: "leph2", label: "physics-part-1" },
    { subject: "physics", code: "leph3", label: "physics-part-2" },
    { subject: "chemistry", code: "lech2", label: "chemistry-part-1" },
    { subject: "chemistry", code: "lech3", label: "chemistry-part-2" },
    { subject: "mathematics", code: "lemh2", label: "mathematics" },
    { subject: "biology", code: "lebo2", label: "biology" },
  ],
};

function buildNcertUrl(subject: Subject, code: string): string {
  const subjectDir: Record<Subject, string> = {
    physics: "phy",
    chemistry: "che",
    mathematics: "math",
    biology: "bio",
  };
  return `https://ncert.nic.in/textbook/pdf/${code}${subjectDir[subject]}1.pdf`;
}

export async function scrapeNcertExemplar(classNum: 11 | 12): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];
  const outputDir = join(PDF_DIR, "ncert-exemplar", `class-${classNum}`);
  await mkdir(outputDir, { recursive: true });

  const books = NCERT_EXEMPLAR_BOOKS[classNum] ?? [];

  logger.info(`NCERT scraper: downloading ${books.length} books for class ${classNum}`);

  for (const book of books) {
    const url = buildNcertUrl(book.subject, book.code);
    const fileName = `${book.label}.pdf`;
    const filePath = join(outputDir, fileName);

    try {
      await downloadPdf(url, filePath);
      results.push({
        shift: `class-${classNum}-${book.label}`,
        filePath,
        url,
        success: true,
      });
      logger.info(`  OK: class-${classNum} ${book.label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`  FAIL: class-${classNum} ${book.label} — ${msg}`);
      results.push({
        shift: `class-${classNum}-${book.label}`,
        filePath,
        url,
        success: false,
        error: msg,
      });
    }
  }

  logger.info(`NCERT scraper: ${results.filter(r => r.success).length}/${results.length} succeeded`);
  return results;
}

export async function scrapeNcert(config: { classNum: 11 | 12 }): Promise<ScraperResult[]> {
  return scrapeNcertExemplar(config.classNum);
}
