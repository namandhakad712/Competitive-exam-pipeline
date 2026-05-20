#!/usr/bin/env node

import { join, basename, extname, dirname } from "path";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { parseArgs } from "util";
import { logger } from "../src/utils/logger.js";
import { ocrPdf, enhancedOcrPdf } from "../src/extractors/ocr-stage.js";
import {
  extractQuestions,
  distributedExtract,
} from "../src/extractors/structurer.js";
import {
  extractWithConsensus,
  distributedConsensusExtract,
} from "../src/extractors/consensus-extractor.js";
import { cacheDiagrams } from "../src/extractors/diagram-cacher.js";
import { validateQuestionFile } from "../src/validators/auto-validator.js";
import { exportDataset, writeDataset } from "../src/finalizers/exporter.js";
import {
  isProcessed,
  markProcessed,
  updateStage,
  getStageStatus,
  getResumePoint,
  saveStageCache,
  loadStageCache,
} from "../src/utils/checkpoints.js";
import type {
  Exam,
  Subject,
  SectionConfig,
  PartialQuestion,
  Passage,
  EnhancedOcrResult,
  OcrResult,
  ProviderName,
} from "../src/types.js";

const EXAM_DEFAULTS: Record<
  string,
  Partial<{
    subjects: Subject[];
    duration: number;
    marksCorrect: number;
    marksIncorrect: number;
    marksUnanswered: number;
    sections: Record<string, SectionConfig>;
  }>
> = {
  jeemain: {
    subjects: ["physics", "chemistry", "mathematics"],
    duration: 180,
    marksCorrect: 4,
    marksIncorrect: -1,
    marksUnanswered: 0,
    sections: {
      a: {
        label: "section a",
        total: 20,
        required: 20,
        mandatory: true,
      },
      b: {
        label: "section b",
        total: 10,
        required: 5,
        mandatory: false,
      },
    },
  },
  neet: {
    subjects: ["physics", "chemistry", "biology"],
    duration: 200,
    marksCorrect: 4,
    marksIncorrect: -1,
    marksUnanswered: 0,
    sections: {
      a: {
        label: "section a",
        total: 100,
        required: 100,
        mandatory: true,
      },
      b: {
        label: "section b",
        total: 100,
        required: 100,
        mandatory: true,
      },
    },
  },
  jeeadv: {
    subjects: ["physics", "chemistry", "mathematics"],
    duration: 180,
    marksCorrect: 4,
    marksIncorrect: -1,
    marksUnanswered: 0,
    sections: {
      a: {
        label: "section 1 (mcq)",
        total: 18,
        required: 18,
        mandatory: true,
      },
      b: {
        label: "section 2 (msq)",
        total: 15,
        required: 15,
        mandatory: true,
      },
      c: {
        label: "section 3 (nat)",
        total: 12,
        required: 12,
        mandatory: true,
      },
    },
  },
  "ncert-exemplar": {
    subjects: ["physics", "chemistry", "mathematics", "biology"],
    duration: 0,
    marksCorrect: 1,
    marksIncorrect: 0,
    marksUnanswered: 0,
    sections: {
      a: {
        label: "questions",
        total: 0,
        required: 0,
        mandatory: true,
      },
    },
  },
};

// ─────────────────────────────────────────────────────────
// Filename parser (unchanged)
// ─────────────────────────────────────────────────────────

interface ParsedMeta {
  exam: Exam;
  year: number;
  shift: string;
  subjects: Subject[];
}

function parseFilename(name: string): ParsedMeta | null {
  const clean = name
    .replace(/\.pdf$/i, "")
    .replace(/[-_\s]+/g, "-")
    .toLowerCase();

  let m = clean.match(
    /jee-?main[-.]?(20\d{2})[-.]?(\d{1,2})[-.]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-.]?(?:shift)?[-.]?(\d)/,
  );
  if (m) return parseShift(m[1], m[2], m[3], m[4], "jeemain");

  m = clean.match(
    /neet[-.]?(20\d{2})[-.]?(\d{1,2})[-.]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/,
  );
  if (m) return parseShift(m[1], m[2], m[3], "1", "neet");

  m = clean.match(
    /jee-?adv(?:anced)?[-.]?(20\d{2})[-.]?(?:paper)?[-.]?(\d)/,
  );
  if (m)
    return {
      exam: "jeeadv",
      year: parseInt(m[1]),
      shift: "p" + m[2],
      subjects: ["physics", "chemistry", "mathematics"],
    };

  m = clean.match(/ncert[-.]?exemplar?[-.]?(\d{2})/);
  if (m) {
    const cls = parseInt(m[1]);
    const subj = guessSubjects(clean);
    return { exam: "ncert-exemplar", year: cls, shift: "", subjects: subj };
  }

  m = clean.match(/neet[-_.\s]?(20\d{2})/);
  if (m) {
    const isReExam =
      clean.includes("re-exam") || clean.includes("reexam");
    const codeM = clean.match(/code[-_.\s]?([a-z]\d)/i);
    const shift = isReExam
      ? codeM
        ? `reexam-${codeM[1].toLowerCase()}`
        : "reexam"
      : codeM
        ? codeM[1].toLowerCase()
        : "1";
    return {
      exam: "neet",
      year: parseInt(m[1]),
      shift,
      subjects: ["physics", "chemistry", "biology"],
    };
  }

  const yearM = clean.match(/(20\d{2})/);
  if (!yearM) return null;

  const monthMap: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const monthM = clean.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/,
  );
  if (!monthM) return null;

  const dayM = clean.match(
    /(\d{1,2})[-.]?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  );
  const shiftM = clean.match(/shift[-.]?(\d)/i);

  return parseShift(
    yearM[1],
    dayM?.[1] || "01",
    monthM[1],
    shiftM?.[1] || "1",
    "jeemain",
  );
}

function parseShift(
  yearStr: string,
  dayStr: string,
  monthStr: string,
  shiftStr: string,
  exam: Exam,
): ParsedMeta {
  const monthMap: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const dd = dayStr.padStart(2, "0");
  const shift = `${dd}${monthStr.toLowerCase().slice(0, 3)}-s${shiftStr}`;

  const subjects: Record<Exam, Subject[]> = {
    jeemain: ["physics", "chemistry", "mathematics"],
    neet: ["physics", "chemistry", "biology"],
    jeeadv: ["physics", "chemistry", "mathematics"],
    "ncert-exemplar": ["physics", "chemistry", "mathematics", "biology"],
  };

  return {
    exam,
    year: parseInt(yearStr),
    shift,
    subjects: subjects[exam],
  };
}

function guessSubjects(name: string): Subject[] {
  if (name.includes("phy") || name.includes("phys")) return ["physics"];
  if (name.includes("chem")) return ["chemistry"];
  if (name.includes("math")) return ["mathematics"];
  if (name.includes("bio")) return ["biology"];
  return ["physics", "chemistry", "mathematics"];
}

async function mergeAnswerKey(
  text: string,
  answerKeyPath: string,
): Promise<{ text: string; keyFound: boolean }> {
  if (!answerKeyPath || !existsSync(answerKeyPath))
    return { text, keyFound: false };

  logger.info(`  Answer key PDF: ${answerKeyPath}`);
  const ocrResult = await ocrPdf(answerKeyPath);
  const keyText = ocrResult.pages.map((p) => p.markdown).join("\n\n").trim();

  if (!keyText) {
    logger.warn("  Answer key OCR returned empty — proceeding without it");
    return { text, keyFound: false };
  }

  logger.info(
    `  Answer key OCR: ${ocrResult.pages.length} pages, ${keyText.length} chars`,
  );
  return {
    text: text + "\n\n--- ANSWER KEY ---\n\n" + keyText,
    keyFound: true,
  };
}

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────

export async function main(
  args: string[] = process.argv.slice(2),
): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      input: { type: "string", short: "i" },
      "answer-key": { type: "string", short: "k" },
      exam: { type: "string" },
      year: { type: "string" },
      shift: { type: "string" },
      force: { type: "boolean", short: "f" },
      "use-consensus": { type: "boolean", short: "c" },
      "use-enhanced-ocr": { type: "boolean", short: "e" },
      help: { type: "boolean", short: "h" },
    },
  });

  const values = parsed.values;

  if (values.help || !values.input) {
    if (!values.input && parsed.positionals && parsed.positionals.length > 0) {
      values.input = parsed.positionals[0];
    }
  }

  if (values.help || !values.input) {
    console.log(`
Usage: npx tsx scripts/process-pdf.ts --input <pdf> [options]

Required:
  --input, -i <path>       Path to question paper PDF

Options:
  --answer-key, -k <path>  Path to separate answer key PDF (optional)
  --exam <name>            Override exam detection (jeemain/neet/jeeadv/ncert-exemplar)
  --year <year>            Override year detection
  --shift <shift>          Override shift detection
  --force, -f              Reprocess even if checkpoint exists
  --use-consensus, -c      Use multi-provider consensus extraction (3 providers in parallel)
  --use-enhanced-ocr, -e   Use Mistral structured annotations (single-call extraction)
  --help, -h               Show this help

If --exam/--year/--shift are omitted, they are inferred from the filename.
`);
    process.exit(0);
  }

  const pdfPath = values.input;
  if (!existsSync(pdfPath)) {
    logger.error(`PDF not found: ${pdfPath}`);
    process.exit(1);
  }

  const filename = basename(pdfPath);
  let meta = parseFilename(filename);
  if (values.exam)
    meta = {
      ...(meta || {
        exam: "jeemain" as Exam,
        year: 2025,
        shift: "1",
        subjects: ["physics", "chemistry", "mathematics"] as Subject[],
      }),
      exam: values.exam as Exam,
    };
  if (values.year)
    meta = {
      ...(meta || {
        exam: "jeemain" as Exam,
        year: 2025,
        shift: "1",
        subjects: ["physics", "chemistry", "mathematics"] as Subject[],
      }),
      year: parseInt(values.year),
    };
  if (values.shift)
    meta = {
      ...(meta || {
        exam: "jeemain" as Exam,
        year: 2025,
        shift: "1",
        subjects: ["physics", "chemistry", "mathematics"] as Subject[],
      }),
      shift: values.shift,
    };

  if (!meta) {
    logger.error(`Cannot determine exam/year/shift from filename: ${filename}`);
    logger.error("Use --exam, --year, --shift flags to specify manually.");
    process.exit(1);
  }

  const { exam, year, shift, subjects } = meta;
  const cacheKey = `${exam}/${year}/${shift}`;
  const useConsensus = values["use-consensus"] ?? false;
  const useEnhancedOcr = values["use-enhanced-ocr"] ?? false;

  // Check checkpoint — skip if already processed (unless --force)
  if (!values.force) {
    const existing = await isProcessed(exam, year, shift);
    if (existing && existing.stages?.export?.status === "completed") {
      logger.info(
        `Already processed: ${exam}/${year}/${shift} (${existing.totalQuestions} questions, ${existing.timestamp.slice(0, 10)})`,
      );
      logger.info("Use --force to reprocess.");
      logger.info(`Existing file: ${existing.sourceFile}`);
      return;
    }

    // Check for resume point
    const resumePoint = await getResumePoint(exam, year, shift);
    if (resumePoint) {
      logger.info(
        `Found resume point: ${resumePoint.stage} stage. Resuming...`,
      );
    }
  }

  const dataDir = join(process.cwd(), "data");
  const shiftDir =
    exam === "ncert-exemplar"
      ? join(dataDir, exam, `class-${year}`)
      : join(dataDir, exam, String(year ?? "unknown"), shift ?? "unknown");

  const startTime = Date.now();

  try {
    // ── STEP 1: OCR ──
    let ocrOutput: OcrResult | EnhancedOcrResult;
    const ocrStatus = await getStageStatus(exam, year, shift, "ocr");

    if (!values.force && ocrStatus?.status === "completed" && ocrStatus.output) {
      logger.info("Step 1/4: OCR already completed. Loading from cache...");
      const cached = await loadStageCache<OcrResult | EnhancedOcrResult>(
        cacheKey,
        "ocr",
      );
      if (cached) {
        ocrOutput = cached;
        logger.info(
          `  Loaded ${ocrOutput.pages.length} pages from cache`,
        );
      } else {
        logger.warn("  Cache miss, re-running OCR");
        ocrOutput = useEnhancedOcr
          ? await enhancedOcrPdf(pdfPath)
          : await ocrPdf(pdfPath);
        await saveStageCache(cacheKey, "ocr", ocrOutput);
        await updateStage(exam, year, shift, "ocr", "completed");
      }
    } else {
      logger.info(
        `Step 1/4: OCR processing (${useEnhancedOcr ? "enhanced" : "standard"})...`,
      );
      ocrOutput = useEnhancedOcr
        ? await enhancedOcrPdf(pdfPath)
        : await ocrPdf(pdfPath);
      logger.info(
        `  ${ocrOutput.pages.length} pages, ${ocrOutput.pages.reduce((s, p) => s + p.markdown.length, 0)} chars`,
      );

      // Post-OCR validation
      if (ocrOutput.pages.length === 0) {
        throw new Error("OCR returned 0 pages");
      }

      await saveStageCache(cacheKey, "ocr", ocrOutput);
      await updateStage(exam, year, shift, "ocr", "completed");
    }

    // Step 1b: Merge answer key if provided
    let mergedText: string | null = null;
    let answerKeyFound = false;
    if (values["answer-key"]) {
      const result = await mergeAnswerKey(
        ocrOutput.pages.map((p) => p.markdown).join("\n\n"),
        values["answer-key"],
      );
      mergedText = result.text;
      answerKeyFound = result.keyFound;
      logger.info(`  Answer key merged: ${answerKeyFound ? "yes" : "not found or empty"}`);
    }

    // ── STEP 2: Extraction ──
    let extraction: {
      questions: PartialQuestion[];
      passages: Passage[];
      answerKeyFound: boolean;
    };
    const extractStatus = await getStageStatus(
      exam,
      year,
      shift,
      "extract",
    );

    if (!values.force && extractStatus?.status === "completed" && extractStatus.output) {
      logger.info("Step 2/4: Extraction already completed. Loading from cache...");
      const cached = await loadStageCache<{
        questions: PartialQuestion[];
        passages: Passage[];
        answerKeyFound: boolean;
      }>(cacheKey, "extract");
      if (cached) {
        extraction = cached;
        logger.info(
          `  Loaded ${extraction.questions.length} questions from cache`,
        );
      } else {
        logger.warn("  Cache miss, re-running extraction");
        extraction = await runExtraction(
          ocrOutput,
          exam,
          mergedText,
          useConsensus,
        );
        await saveStageCache(cacheKey, "extract", extraction);
        await updateStage(exam, year, shift, "extract", "completed");
      }
    } else {
      logger.info(
        `Step 2/4: AI extraction (${useConsensus ? "consensus" : "single-provider"})...`,
      );
      extraction = await runExtraction(
        ocrOutput,
        exam,
        mergedText,
        useConsensus,
      );
      logger.info(`  ${extraction.questions.length} questions extracted`);
      logger.info(
        `  Answer key ${extraction.answerKeyFound ? "found" : "NOT found — answers set to empty"}`,
      );

      if (extraction.questions.length === 0) {
        logger.error("No questions extracted. Aborting.");
        process.exit(1);
      }

      // Post-extraction validation
      const expectedCounts: Record<Exam, number> = {
        jeemain: 90,
        neet: 200,
        jeeadv: 54,
        "ncert-exemplar": 0,
      };
      const expected = expectedCounts[exam];
      if (
        expected > 0 &&
        Math.abs(extraction.questions.length - expected) > 10
      ) {
        logger.warn(
          `Extraction count (${extraction.questions.length}) differs significantly from expected (${expected})`,
        );
      }

      await saveStageCache(cacheKey, "extract", extraction);
      await updateStage(
        exam,
        year,
        shift,
        "extract",
        "completed",
        undefined,
        undefined,
      );
    }

    // ── STEP 3: Cache diagrams ──
    const diagramStatus = await getStageStatus(
      exam,
      year,
      shift,
      "diagrams",
    );

    if (!values.force && diagramStatus?.status === "completed") {
      logger.info("Step 3/4: Diagrams already cached. Skipping...");
    } else {
      logger.info("Step 3/4: Caching diagrams...");
      await cacheDiagrams({
        questions: extraction.questions,
        images: ocrOutput.images,
        shiftDir,
        ocrResult:
          "mistralPages" in ocrOutput
            ? (ocrOutput as EnhancedOcrResult)
            : undefined,
      });

      // Post-diagram validation
      const questionsWithDiagrams = extraction.questions.filter(
        (q) => q.diagrams && q.diagrams.length > 0,
      );
      logger.info(
        `  Diagrams cached for ${questionsWithDiagrams.length} question(s)`,
      );

      await updateStage(exam, year, shift, "diagrams", "completed");
    }

    // ── STEP 4: Finalize and export ──
    const validateStatus = await getStageStatus(
      exam,
      year,
      shift,
      "validate",
    );

    if (!values.force && validateStatus?.status === "completed") {
      logger.info("Step 4/4: Already validated and exported. Skipping...");
    } else {
      logger.info("Step 4/4: Finalizing and exporting...");

      const defaults = EXAM_DEFAULTS[exam] || EXAM_DEFAULTS["jeemain"];
      const file = await exportDataset({
        exam,
        year,
        shift,
        paper: null,
        subjects: subjects ?? defaults.subjects ?? [],
        duration: defaults.duration ?? 0,
        marksCorrect: defaults.marksCorrect ?? 4,
        marksIncorrect: defaults.marksIncorrect ?? -1,
        marksUnanswered: defaults.marksUnanswered ?? 0,
        sections: defaults.sections ?? {},
        questions: extraction.questions,
        passages: extraction.passages,
        answerKeyFound: extraction.answerKeyFound,
      });

      const { paperPath, subjectPaths } = await writeDataset(file, dataDir);

      // Validate
      const validation = validateQuestionFile(file, dataDir);
      const errors = validation.filter((v) => !v.valid);
      if (errors.length > 0) {
        logger.warn(
          `Validation: ${errors.length} question(s) have errors`,
        );
        errors.forEach((e) => {
          logger.warn(
            `  Q${e.index + 1} (${e.questionId}): ${e.flags.filter((f: any) => f.severity === "error").map((f: any) => f.message).join("; ")}`,
          );
        });
      } else {
        logger.info("Validation: ALL QUESTIONS PASSED");
      }

      await updateStage(exam, year, shift, "validate", "completed");

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logger.info(`=== Complete: ${file.total} questions in ${elapsed}s ===`);
      logger.info(`  Paper: ${paperPath}`);
      logger.info(`  Subjects: ${subjectPaths.join(", ")}`);

      // Record final checkpoint
      await markProcessed({
        exam,
        year,
        shift,
        subjects: file.subjects ?? subjects ?? [],
        sourceFile: paperPath,
        timestamp: new Date().toISOString(),
        totalQuestions: file.total,
        stages: {
          ocr: { status: "completed", timestamp: new Date().toISOString() },
          extract: {
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          diagrams: {
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          validate: {
            status: "completed",
            timestamp: new Date().toISOString(),
          },
          export: {
            status: "completed",
            timestamp: new Date().toISOString(),
          },
        },
      });
    }
  } catch (err) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.error(
      `Failed after ${elapsed}s: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

async function runExtraction(
  ocrOutput: OcrResult | EnhancedOcrResult,
  exam: Exam,
  mergedText: string | null,
  useConsensus: boolean,
): Promise<{
  questions: PartialQuestion[];
  passages: Passage[];
  answerKeyFound: boolean;
}> {
  const sourcePages = mergedText
    ? [{ page: 0, markdown: mergedText, isBilingual: false }]
    : ocrOutput.pages;

  if (useConsensus) {
    // Try to use structured annotation from enhanced OCR first
    if ("structuredAnnotation" in ocrOutput && ocrOutput.structuredAnnotation) {
      const enhanced = ocrOutput as EnhancedOcrResult;
      const annotation = enhanced.structuredAnnotation as {
        questions?: Array<Record<string, unknown>>;
      };
      if (annotation?.questions && annotation.questions.length > 0) {
        logger.info(
          `Using Mistral structured annotation: ${annotation.questions.length} questions`,
        );
        const questions: PartialQuestion[] = annotation.questions.map(
          (q: Record<string, unknown>, i: number) => ({
            number: (q.number as number) || i + 1,
            numberLabel: null,
            subject: (q.subject as Subject) || "physics",
            topic: null,
            section: null,
            type: "mcq",
            text: (q.text as string) || "",
            textHi: null,
            options: (q.options as string[]) || null,
            answer: (q.answer as string) || "",
            answers: null,
            answerPrecision: null,
            marks: 4,
            negativeMarks: -1,
            passageId: null,
            solution: null,
            solutionFormat: null,
            hasDiagram: Array.isArray(q.diagrams) && q.diagrams.length > 0,
            diagrams: null,
            difficulty: null,
            tags: [],
            source: "official-pdf",
            confidence: null,
          }),
        );
        return {
          questions,
          passages: [],
          answerKeyFound: questions.some(
            (q) => q.answer && q.answer !== "",
          ),
        };
      }
    }

    // Fall back to consensus extraction
    const availableProviders: ProviderName[] = ["nvidia", "longcat", "gemini"];
    const providerKeys: Record<string, string | undefined> = {
      nvidia: process.env.NVIDIA_API_KEY,
      longcat: process.env.LONGCAT_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
    };
    const activeProviders = availableProviders.filter(
      (p) => providerKeys[p],
    );

    if (activeProviders.length >= 2) {
      logger.info(
        `Using consensus extraction with ${activeProviders.length} providers`,
      );
      if (sourcePages.length > 12) {
        const result = await distributedConsensusExtract(
          sourcePages,
          exam,
          activeProviders,
        );
        return {
          questions: result.questions,
          passages: result.passages,
          answerKeyFound: result.answerKeyFound,
        };
      }
      const result = await extractWithConsensus(
        sourcePages,
        exam,
        activeProviders,
      );
      return {
        questions: result.questions,
        passages: result.passages,
        answerKeyFound: result.answerKeyFound,
      };
    }
  }

  // Single-provider extraction (original behavior)
  if (sourcePages.length > 12 && !mergedText) {
    return distributedExtract(sourcePages, exam);
  }
  return extractQuestions(sourcePages, exam);
}

if (process.argv[1]?.includes("process-pdf")) {
  await main();
}
