import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { logger } from "../src/utils/logger.js";
import type { Exam, VerificationStatus } from "../src/types.js";

interface DatasetEntry {
  key: string;
  exam: Exam;
  year: number;
  shift: string;
  total: number;
  verificationStatus: VerificationStatus;
  paperPath: string;
}

async function scanDatasets(): Promise<DatasetEntry[]> {
  const DATA_DIR = join(process.cwd(), "data");
  const entries: DatasetEntry[] = [];

  async function walk(dir: string): Promise<void> {
    const { readdir } = await import("fs/promises");
    const { stat } = await import("fs/promises");

    let items: string[];
    try {
      items = await readdir(dir);
    } catch {
      return;
    }

    for (const item of items) {
      const fullPath = join(dir, item);

      let stats;
      try {
        stats = await stat(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        await walk(fullPath);
      } else if (item === "paper.json") {
        try {
          const raw = await readFile(fullPath, "utf8");
          const data = JSON.parse(raw);
          const exam = data.exam as Exam;
          const year = data.year;
          const shift = data.shift ?? "unknown";

          const metadataPath = join(dir, "..", "metadata.json");
          let verificationStatus: VerificationStatus = "unverified";
          try {
            const metaRaw = await readFile(metadataPath, "utf8");
            const meta = JSON.parse(metaRaw);
            const shiftKey = `${year}-${shift}`;
            verificationStatus = meta.verificationStatus?.[shiftKey] ?? "unverified";
          } catch { /* no metadata */ }

          entries.push({
            key: `${exam}/${year}/${shift}`,
            exam,
            year,
            shift,
            total: data.total ?? data.questions?.length ?? 0,
            verificationStatus,
            paperPath: fullPath,
          });
        } catch (err) {
          logger.warn(`Failed to read ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  await walk(DATA_DIR);
  return entries;
}

export async function verifyAll(): Promise<void> {
  logger.info("Scanning for unverified datasets...");
  const datasets = await scanDatasets();

  const unverified = datasets.filter(
    d => d.verificationStatus === "unverified" || d.verificationStatus === "needs-review",
  );

  if (unverified.length === 0) {
    logger.info("All datasets are verified! Nothing to review.");
    return;
  }

  logger.info(`Found ${unverified.length} unverified dataset(s):`);
  for (const d of unverified) {
    logger.info(`  ${d.key} (${d.total} questions, ${d.verificationStatus})`);
  }

  for (const d of unverified) {
    logger.info(`\nLaunching review for: ${d.key}`);
    const { startReview } = await import("../src/review/review-cli.js");
    const { readFile } = await import("fs/promises");

    try {
      const raw = await readFile(d.paperPath, "utf8");
      const data = JSON.parse(raw);

      await startReview({
        exam: d.exam,
        year: d.year,
        shift: d.shift,
        paperPath: d.paperPath,
        markdownDir: join(require("path").dirname(d.paperPath), "markdown"),
        questions: data.questions ?? [],
      });
    } catch (err) {
      logger.error(`Review failed for ${d.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

verifyAll().then(() => process.exit(0)).catch(err => {
  logger.error(err.message);
  process.exit(1);
});
