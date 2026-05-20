import { readFile, writeFile, mkdir, readdir, stat } from "fs/promises";
import { join } from "path";
import { logger } from "../src/utils/logger.js";
import type { QuestionFile, Question, Exam } from "../src/types.js";

const DATA_DIR = join(process.cwd(), "data");
const EXPORT_DIR = join(process.cwd(), "export");

interface ExportConfig {
  license: string;
  attribution?: string;
  output?: string;
}

const INTERNAL_FIELDS = ["revision", "source", "scrapedAt", "checksum", "passages", "passageId"] as const;

function stripInternalFields(q: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...q };
  for (const field of INTERNAL_FIELDS) {
    delete cleaned[field];
  }
  return cleaned;
}

async function collectVerifiedDatasets(): Promise<QuestionFile[]> {
  const files: QuestionFile[] = [];

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
      } else if (item.endsWith(".json") && item !== "index.json" && item !== "metadata.json") {
        try {
          const raw = await readFile(fullPath, "utf8");
          const data = JSON.parse(raw) as QuestionFile;
          files.push(data);
        } catch { /* skip */ }
      }
    }
  }

  await walk(DATA_DIR);
  return files;
}

export async function exportForOpensource(config: ExportConfig): Promise<void> {
  const outputDir = config.output ?? EXPORT_DIR;
  logger.info(`Exporting datasets to ${outputDir}...`);

  const datasets = await collectVerifiedDatasets();
  logger.info(`Found ${datasets.length} dataset file(s)`);

  const byExamAndSubject: Record<string, Question[]> = {};

  for (const ds of datasets) {
    for (const q of ds.questions) {
      const key = `${ds.exam}/${q.subject}`;
      if (!byExamAndSubject[key]) byExamAndSubject[key] = [];
      byExamAndSubject[key].push(q);
    }
  }

  await mkdir(outputDir, { recursive: true });

  let totalExported = 0;

  for (const [key, questions] of Object.entries(byExamAndSubject)) {
    const safeKey = key.replace(/\//g, "-");
    const cleanedQuestions = questions.map(q => stripInternalFields(q as unknown as Record<string, unknown>));

    const exportFile = {
      schema: "v4",
      license: config.license,
      attribution: config.attribution ?? "question-pipeline",
      exportedAt: new Date().toISOString(),
      total: cleanedQuestions.length,
      questions: cleanedQuestions,
    };

    const filePath = join(outputDir, `${safeKey}.json`);
    await writeFile(filePath, JSON.stringify(exportFile, null, 2), "utf8");
    logger.info(`  ${filePath}: ${cleanedQuestions.length} questions`);
    totalExported += cleanedQuestions.length;
  }

  logger.info(`Export complete: ${totalExported} questions, ${Object.keys(byExamAndSubject).length} files`);
}

const [,,licenseArg,outputArg] = process.argv;
const license = process.argv[3] ?? "cc-by-4.0";
const output = process.argv[5];

exportForOpensource({
  license,
  attribution: "question-pipeline",
  output: output || undefined,
}).then(() => process.exit(0)).catch(err => {
  logger.error(err.message);
  process.exit(1);
});
