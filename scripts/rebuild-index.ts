import { readFile, writeFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { logger } from "../src/utils/logger.js";
import { computeChecksum } from "../src/utils/hash-utils.js";
import type { Exam } from "../src/types.js";

const DATA_DIR = join(process.cwd(), "data");

interface IndexEntry {
  key: string;
  exam: Exam;
  year: number | null;
  shift: string | null;
  total: number;
  subjects: string[];
  lastUpdated: string;
  checksum: string;
}

async function rebuildIndex(): Promise<void> {
  logger.info("Rebuilding data/index.json...");
  const entries: IndexEntry[] = [];

  async function walk(dir: string, exam?: Exam, year?: number): Promise<void> {
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
        const dirName = item.toLowerCase();

        if (!exam && ["jeemain", "neet", "jeeadv", "ncert-exemplar"].includes(dirName)) {
          await walk(fullPath, dirName as Exam, undefined);
        } else if (exam && year === undefined && /^\d{4}$/.test(dirName)) {
          await walk(fullPath, exam, parseInt(dirName, 10));
        } else if (exam && year !== undefined) {
          await walk(fullPath, exam, year);
        }
      } else if (item === "paper.json") {
        try {
          const raw = await readFile(fullPath, "utf8");
          const data = JSON.parse(raw);
          const checksum = computeChecksum(data);

          entries.push({
            key: `${data.exam}/${data.year}/${data.shift ?? "unknown"}`,
            exam: data.exam,
            year: data.year,
            shift: data.shift,
            total: data.total ?? data.questions?.length ?? 0,
            subjects: data.subjects ?? [],
            lastUpdated: data.scrapedAt ?? new Date().toISOString(),
            checksum,
          });
        } catch (err) {
          logger.warn(`Skipping ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  await walk(DATA_DIR);

  const index = {
    datasets: entries,
    totalDatasets: entries.length,
    totalQuestions: entries.reduce((sum, e) => sum + e.total, 0),
    lastRebuilt: new Date().toISOString(),
  };

  const indexPath = join(DATA_DIR, "index.json");
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");

  logger.info(`Index rebuilt: ${entries.length} datasets, ${index.totalQuestions} total questions`);
}

rebuildIndex().then(() => process.exit(0)).catch(err => {
  logger.error(err.message);
  process.exit(1);
});
