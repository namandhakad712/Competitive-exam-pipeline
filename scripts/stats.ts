import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { logger } from "../src/utils/logger.js";
import { verifyAllDatasets } from "../src/utils/integrity.js";
import type { QuestionFile, Exam, Subject, QuestionType } from "../src/types.js";

const DATA_DIR = join(process.cwd(), "data");

interface ExamStats {
  total: number;
  bySubject: Record<string, number>;
  byType: Record<string, number>;
  verified: number;
  unverified: number;
}

async function collectStats(): Promise<{
  totalQuestions: number;
  totalDiagrams: number;
  totalFiles: number;
  totalSizeBytes: number;
  byExam: Record<string, ExamStats>;
  bySubject: Record<string, number>;
  byType: Record<string, number>;
}> {
  const byExam: Record<string, ExamStats> = {};
  const bySubject: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let totalQuestions = 0;
  let totalDiagrams = 0;
  let totalFiles = 0;
  let totalSizeBytes = 0;

  async function walk(dir: string): Promise<void> {
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
      } else if (item.endsWith(".png") || item.endsWith(".jpg")) {
        totalDiagrams++;
        totalSizeBytes += stats.size;
      } else if (item === "paper.json") {
        totalFiles++;
        totalSizeBytes += stats.size;

        try {
          const raw = await readFile(fullPath, "utf8");
          const data = JSON.parse(raw) as QuestionFile;
          const exam = data.exam;

          if (!byExam[exam]) {
            byExam[exam] = {
              total: 0,
              bySubject: {},
              byType: {},
              verified: 0,
              unverified: 0,
            };
          }

          for (const q of data.questions ?? []) {
            totalQuestions++;
            byExam[exam].total++;
            byExam[exam].bySubject[q.subject] = (byExam[exam].bySubject[q.subject] ?? 0) + 1;
            byExam[exam].byType[q.type] = (byExam[exam].byType[q.type] ?? 0) + 1;
            bySubject[q.subject] = (bySubject[q.subject] ?? 0) + 1;
            byType[q.type] = (byType[q.type] ?? 0) + 1;
          }
        } catch { /* skip */ }
      }
    }
  }

  await walk(DATA_DIR);

  return {
    totalQuestions,
    totalDiagrams,
    totalFiles,
    totalSizeBytes,
    byExam,
    bySubject,
    byType,
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  logger.info("Collecting dataset statistics...\n");

  const stats = await collectStats();
  const integrity = await verifyAllDatasets(DATA_DIR);

  console.log("\n=== Dataset Statistics ===\n");
  console.log(`Total questions:     ${stats.totalQuestions.toLocaleString()}`);
  console.log(`Total diagrams:      ${stats.totalDiagrams}`);
  console.log(`Total JSON files:    ${stats.totalFiles}`);
  console.log(`Total size:          ${formatSize(stats.totalSizeBytes)}`);
  console.log(`Integrity:           ${integrity.passed}/${integrity.totalFiles} passed`);
  if (integrity.failed > 0) console.log(`                     ${integrity.failed} failed`);
  if (integrity.missing > 0) console.log(`                     ${integrity.missing} missing checksums`);

  console.log("\n--- By Exam ---");
  for (const [exam, examStats] of Object.entries(stats.byExam)) {
    console.log(`  ${exam}: ${examStats.total} questions`);
    for (const [subj, count] of Object.entries(examStats.bySubject)) {
      console.log(`    ${subj}: ${count}`);
    }
  }

  console.log("\n--- By Subject ---");
  for (const [subj, count] of Object.entries(stats.bySubject).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${subj}: ${count}`);
  }

  console.log("\n--- By Type ---");
  for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  console.log("");
}

main().then(() => process.exit(0)).catch(err => {
  logger.error(err.message);
  process.exit(1);
});
