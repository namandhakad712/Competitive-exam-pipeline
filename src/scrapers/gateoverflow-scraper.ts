import { mkdir } from "fs/promises";
import { join } from "path";
import { logger } from "../utils/logger.js";
import { downloadPdf } from "../utils/pdf-downloader.js";
import type { ExamConfig, ScraperResult } from "../types.js";

const PDF_DIR = process.env.PDF_TEMP_DIR ?? join(process.cwd(), "temp");

const JEEADV_PAPERS: Record<number, { paper1: string; paper2: string }> = {
  2024: {
    paper1: "https://gateoverflow.in/storage/jeeadv/2024/JEE-Advanced-2024-Paper-1.pdf",
    paper2: "https://gateoverflow.in/storage/jeeadv/2024/JEE-Advanced-2024-Paper-2.pdf",
  },
  2023: {
    paper1: "https://gateoverflow.in/storage/jeeadv/2023/JEE-Advanced-2023-Paper-1.pdf",
    paper2: "https://gateoverflow.in/storage/jeeadv/2023/JEE-Advanced-2023-Paper-2.pdf",
  },
  2022: {
    paper1: "https://gateoverflow.in/storage/jeeadv/2022/JEE-Advanced-2022-Paper-1.pdf",
    paper2: "https://gateoverflow.in/storage/jeeadv/2022/JEE-Advanced-2022-Paper-2.pdf",
  },
  2021: {
    paper1: "https://gateoverflow.in/storage/jeeadv/2021/JEE-Advanced-2021-Paper-1.pdf",
    paper2: "https://gateoverflow.in/storage/jeeadv/2021/JEE-Advanced-2021-Paper-2.pdf",
  },
  2020: {
    paper1: "https://gateoverflow.in/storage/jeeadv/2020/JEE-Advanced-2020-Paper-1.pdf",
    paper2: "https://gateoverflow.in/storage/jeeadv/2020/JEE-Advanced-2020-Paper-2.pdf",
  },
  2019: {
    paper1: "https://gateoverflow.in/storage/jeeadv/2019/JEE-Advanced-2019-Paper-1.pdf",
    paper2: "https://gateoverflow.in/storage/jeeadv/2019/JEE-Advanced-2019-Paper-2.pdf",
  },
};

const JEEMAIN_OLD_YEARS: Record<number, string[]> = {
  2023: [
    "https://gateoverflow.in/storage/jeemain/2023/january/24-jan-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/january/24-jan-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/january/25-jan-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/january/25-jan-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/january/29-jan-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/january/29-jan-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/january/30-jan-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/january/30-jan-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/january/31-jan-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/january/31-jan-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/06-apr-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/06-apr-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/08-apr-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/08-apr-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/10-apr-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/10-apr-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/11-apr-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/11-apr-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/12-apr-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/12-apr-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/13-apr-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/13-apr-shift-2.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/15-apr-shift-1.pdf",
    "https://gateoverflow.in/storage/jeemain/2023/april/15-apr-shift-2.pdf",
  ],
};

function extractShiftName(url: string): string {
  const match = url.match(/(\d{2}-[a-z]{3}-\d{4})/i);
  if (match) return match[1].toLowerCase();
  const parts = url.split("/").filter(Boolean);
  const file = parts[parts.length - 1]?.replace(".pdf", "") ?? "unknown";
  return file.toLowerCase();
}

export async function scrapeGateoverflow(config: ExamConfig): Promise<ScraperResult[]> {
  const { exam, year } = config;
  const results: ScraperResult[] = [];

  const outputDir = join(PDF_DIR, `${exam}-gateoverflow`, String(year));
  await mkdir(outputDir, { recursive: true });

  let urls: { shift: string; url: string }[] = [];

  if (exam === "jeeadv") {
    const papers = JEEADV_PAPERS[year];
    if (papers) {
      urls.push({ shift: `p1`, url: papers.paper1 });
      urls.push({ shift: `p2`, url: papers.paper2 });
    } else {
      logger.warn(`No gateoverflow URLs for JEE Advanced ${year}`);
      return results;
    }
  } else if (exam === "jeemain") {
    const shifts = JEEMAIN_OLD_YEARS[year];
    if (shifts) {
      urls = shifts.map(url => ({ shift: extractShiftName(url), url }));
    } else {
      logger.warn(`No gateoverflow URLs for JEE Main ${year}`);
      return results;
    }
  } else {
    logger.warn(`Gateoverflow scraper: unsupported exam ${exam}`);
    return results;
  }

  logger.info(`Gateoverflow: checking ${urls.length} URLs for ${exam} ${year}`);

  for (const entry of urls) {
    const fileName = `${entry.shift}.pdf`;
    const filePath = join(outputDir, fileName);

    try {
      await downloadPdf(entry.url, filePath);
      results.push({
        shift: entry.shift,
        filePath,
        url: entry.url,
        success: true,
      });
      logger.info(`  OK: ${entry.shift}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`  FAIL: ${entry.shift} — ${msg}`);
      results.push({
        shift: entry.shift,
        filePath,
        url: entry.url,
        success: false,
        error: msg,
      });
    }
  }

  logger.info(`Gateoverflow: ${results.filter(r => r.success).length}/${results.length} succeeded`);
  return results;
}
