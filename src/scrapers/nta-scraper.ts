import { mkdir } from "fs/promises";
import { join } from "path";
import { logger } from "../utils/logger.js";
import { downloadPdf, validatePdf } from "../utils/pdf-downloader.js";
import type { Exam, ScraperResult, ExamConfig } from "../types.js";

const PDF_DIR = process.env.PDF_TEMP_DIR ?? join(process.cwd(), "temp");
const BASE_URLS: Record<Exam, string> = {
  jeemain: "https://jeemain.nta.ac.in",
  neet: "https://neet.nta.nic.in",
  jeeadv: "https://jeeadv.ac.in",
  "ncert-exemplar": "https://ncert.nic.in",
};

const SHIFT_LABELS = ["shift1", "shift2"];

export function generateJeemainDates(year: number): string[] {
  const dates: string[] = [];

  const janSessions = year >= 2024
    ? ["22jan", "23jan", "24jan", "25jan", "27jan", "28jan", "29jan", "30jan", "31jan"]
    : ["01jan", "02jan", "03jan", "04jan", "05jan", "06jan", "07jan", "08jan",
       "09jan", "10jan", "11jan", "12jan"];

  const aprSessions = year >= 2024
    ? ["01apr", "02apr", "03apr", "04apr", "05apr", "06apr", "08apr", "09apr", "10apr", "11apr", "12apr"]
    : ["01apr", "02apr", "03apr", "04apr", "05apr", "06apr", "07apr", "08apr",
       "09apr", "10apr", "11apr", "12apr"];

  dates.push(...janSessions);
  if (year >= 2021) {
    dates.push(...aprSessions);
  }

  return dates;
}

export function generateNeetDates(year: number): string[] {
  if (year === 2025) return ["04may", "05may"];
  if (year === 2024) return ["05may", "07may"];
  return ["07may"];
}

function buildJeemainUrls(year: number, dates: string[]): { date: string; shift: string; url: string }[] {
  const urls: { date: string; shift: string; url: string }[] = [];
  for (const date of dates) {
    for (const shift of SHIFT_LABELS) {
      const shiftNum = shift === "shift1" ? "1" : "2";
      urls.push({
        date,
        shift,
        url: `${BASE_URLS.jeemain}/paper/${year}/${date}${shiftNum}paper.pdf`,
      });
    }
  }
  return urls;
}

function buildNeetUrls(year: number, dates: string[]): { date: string; shift: string; url: string }[] {
  return dates.map(d => ({
    date: d,
    shift: d,
    url: `${BASE_URLS.neet}/questionpaper/${year}/${d}paper.pdf`,
  }));
}

export async function scrapeNta(config: ExamConfig): Promise<ScraperResult[]> {
  const { exam, year } = config;
  const results: ScraperResult[] = [];

  const outputDir = join(PDF_DIR, exam, String(year));
  await mkdir(outputDir, { recursive: true });

  let entries: { date: string; shift: string; url: string }[] = [];

  if (exam === "jeemain") {
    const dates = generateJeemainDates(year);
    entries = buildJeemainUrls(year, dates);
  } else if (exam === "neet") {
    const dates = generateNeetDates(year);
    entries = buildNeetUrls(year, dates);
  } else {
    logger.warn(`NTA scraper: unsupported exam ${exam}`);
    return results;
  }

  logger.info(`NTA scraper: checking ${entries.length} URLs for ${exam} ${year}`);

  for (const entry of entries) {
    const fileName = `${entry.date}-${entry.shift}.pdf`;
    const filePath = join(outputDir, fileName);

    try {
      await downloadPdf(entry.url, filePath);
      results.push({
        shift: `${entry.date}-${entry.shift}`,
        filePath,
        url: entry.url,
        success: true,
      });
      logger.info(`  OK: ${entry.date}-${entry.shift}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`  FAIL: ${entry.date}-${entry.shift} — ${msg}`);
      results.push({
        shift: `${entry.date}-${entry.shift}`,
        filePath,
        url: entry.url,
        success: false,
        error: msg,
      });
    }
  }

  logger.info(`NTA scraper: ${results.filter(r => r.success).length}/${results.length} succeeded`);
  return results;
}
