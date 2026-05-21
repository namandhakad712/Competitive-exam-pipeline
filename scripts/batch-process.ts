import { join } from "path";
import { logger } from "../src/utils/logger.js";
import { scrapeNta } from "../src/scrapers/nta-scraper.js";
import { ocrPdf } from "../src/extractors/ocr-stage.js";
import { extractQuestions, distributedExtract } from "../src/extractors/structurer.js";
import { cacheDiagrams } from "../src/extractors/diagram-cacher.js";
import { validateQuestionFile } from "../src/validators/auto-validator.js";
import { exportDataset, writeDataset } from "../src/finalizers/exporter.js";
import type { Exam, Subject, SectionConfig, PartialQuestion, Passage } from "../src/types.js";

interface BatchConfig {
  exam: Exam;
  year: number;
  shift: string;
  subjects: Subject[];
  duration: number;
  marksCorrect: number;
  marksIncorrect: number;
  marksUnanswered: number;
  sections: Record<string, SectionConfig>;
  skipReview?: boolean;
  useClassDir?: boolean;
}

const EXAM_DEFAULTS: Record<Exam, Partial<BatchConfig>> = {
  jeemain: {
    subjects: ["physics", "chemistry", "mathematics"],
    duration: 180,
    marksCorrect: 4,
    marksIncorrect: -1,
    marksUnanswered: 0,
    sections: {
      a: { label: "section a", total: 20, required: 20, mandatory: true },
      b: { label: "section b", total: 10, required: 5, mandatory: false },
    },
  },
  neet: {
    subjects: ["physics", "chemistry", "biology"],
    duration: 200,
    marksCorrect: 4,
    marksIncorrect: -1,
    marksUnanswered: 0,
    sections: {
      a: { label: "section a", total: 100, required: 100, mandatory: true },
      b: { label: "section b", total: 100, required: 100, mandatory: true },
    },
  },
  jeeadv: {
    subjects: ["physics", "chemistry", "mathematics"],
    duration: 180,
    marksCorrect: 4,
    marksIncorrect: -1,
    marksUnanswered: 0,
    sections: {
      a: { label: "section 1 (mcq)", total: 18, required: 18, mandatory: true },
      b: { label: "section 2 (msq)", total: 15, required: 15, mandatory: true },
      c: { label: "section 3 (nat)", total: 12, required: 12, mandatory: true },
    },
  },
  "ncert-exemplar": {
    subjects: ["physics", "chemistry", "mathematics", "biology"],
    duration: 0,
    marksCorrect: 1,
    marksIncorrect: 0,
    marksUnanswered: 0,
    sections: {
      a: { label: "questions", total: 0, required: 0, mandatory: true },
    },
  },
};

export async function batchProcess(config: BatchConfig): Promise<boolean> {
  const startTime = Date.now();
  const { exam, year, shift } = config;

  logger.info(`=== Batch process started: ${exam} ${year} ${shift} ===`);

  try {
    // Step 1: Scrape
    logger.info("Step 1/5: Scraping PDF...");
    const results = await scrapeNta({ exam, year });
    const pdfResult = results.find(r => r.shift === shift || r.shift.includes(shift));
    if (!pdfResult || !pdfResult.success) {
      logger.error(`PDF not found for shift ${shift}`);
      if (pdfResult?.error) logger.error(`Error: ${pdfResult.error}`);
      return false;
    }
    logger.info(`  PDF downloaded: ${pdfResult.filePath}`);

    // Step 2: OCR
    logger.info("Step 2/5: OCR processing...");
    const ocrOutput = await ocrPdf(pdfResult.filePath);
    logger.info(`  ${ocrOutput.pages.length} pages extracted`);

    // Step 3: Structure extraction
    logger.info("Step 3/5: AI extraction...");
    const extraction = ocrOutput.pages.length > 12
      ? await distributedExtract(ocrOutput.pages, exam)
      : await extractQuestions(ocrOutput.pages, exam);
    logger.info(`  ${extraction.questions.length} questions extracted`);

    if (extraction.questions.length === 0) {
      logger.error("No questions extracted. Aborting.");
      return false;
    }

    // Step 4: Cache diagrams
    logger.info("Step 4/5: Caching diagrams...");
    const DATA_DIR = join(process.cwd(), "data");
    const shiftDir = EXAM_DEFAULTS[exam]?.useClassDir ?? false
      ? join(DATA_DIR, exam, `class-${year}`)
      : join(DATA_DIR, exam, String(year ?? "unknown"), shift ?? "unknown");
    await cacheDiagrams({
      questions: extraction.questions,
      images: ocrOutput.images,
      shiftDir,
    });

    // Step 5: Finalize and export
    logger.info("Step 5/5: Finalizing and exporting...");
    const defaults = EXAM_DEFAULTS[exam] ?? {};
    const mergedConfig = { ...defaults, ...config };

    const file = await exportDataset({
      exam,
      year,
      shift,
      paper: null,
      subjects: mergedConfig.subjects ?? [],
      duration: mergedConfig.duration ?? 0,
      marksCorrect: mergedConfig.marksCorrect ?? 4,
      marksIncorrect: mergedConfig.marksIncorrect ?? -1,
      marksUnanswered: mergedConfig.marksUnanswered ?? 0,
      sections: mergedConfig.sections ?? {},
      questions: extraction.questions as PartialQuestion[],
      passages: extraction.passages as Passage[],
      answerKeyFound: extraction.answerKeyFound,
    });

    const { paperPath, subjectPaths } = await writeDataset(file, DATA_DIR);

    // Validate
    const validation = validateQuestionFile(file, DATA_DIR);
    const errors = validation.filter(v => !v.valid);
    if (errors.length > 0) {
      logger.warn(`Validation: ${errors.length} question(s) have errors`);
      errors.forEach(e => {
        logger.warn(`  Q${e.index + 1} (${e.questionId}): ${e.flags.filter(f => f.severity === "error").map(f => f.message).join("; ")}`);
      });
    } else {
      logger.info("Validation: ALL QUESTIONS PASSED");
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.info(`=== Batch complete: ${file.total} questions in ${elapsed}s ===`);
    logger.info(`  Paper: ${paperPath}`);
    logger.info(`  Subjects: ${subjectPaths.join(", ")}`);

    // Prompt for review
    if (!config.skipReview) {
      logger.info("Ready for human review. Run: npm run review");
    }

    return true;
  } catch (err) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.error(`Batch failed after ${elapsed}s: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
