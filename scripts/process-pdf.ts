#!/usr/bin/env node

/**
 * process-pdf.ts — Manual PDF ingestion for the pipeline.
 *
 * Takes a PDF file (with optional separate answer-key PDF),
 * parses exam/year/shift from the filename, runs the full
 * pipeline (OCR → Structurer → Validate → Finalize).
 *
 * Usage:
 *   npx tsx scripts/process-pdf.ts --input <path> [--answer-key <path>]
 *     [--exam <name>] [--year <Y>] [--shift <S>]
 *
 * If --exam/--year/--shift are omitted, they are inferred from the filename.
 */

import { join, basename, extname, dirname } from "path";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { parseArgs } from "util";
import { logger } from "../src/utils/logger.js";
import { ocrPdf } from "../src/extractors/ocr-stage.js";
import { extractQuestions } from "../src/extractors/structurer.js";
import { cacheDiagrams } from "../src/extractors/diagram-cacher.js";
import { validateQuestionFile } from "../src/validators/auto-validator.js";
import { exportDataset, writeDataset } from "../src/finalizers/exporter.js";
import { isProcessed, markProcessed } from "../src/utils/checkpoints.js";
import type { Exam, Subject, SectionConfig, PartialQuestion, Passage } from "../src/types.js";

// ─────────────────────────────────────────────────────────
// Filename parser
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

  // Patterns tried in order

  // 1) "jeemain-2025-22jan-shift1" or "jee-main-2025-22-jan-shift-1"
  let m = clean.match(/jee-?main[-.]?(20\d{2})[-.]?(\d{1,2})[-.]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-.]?(?:shift)?[-.]?(\d)/);
  if (m) return parseShift(m[1], m[2], m[3], m[4], "jeemain");

  // 2) "neet-2024-04may" or "neet-2024-4-may"
  m = clean.match(/neet[-.]?(20\d{2})[-.]?(\d{1,2})[-.]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  if (m) return parseShift(m[1], m[2], m[3], "1", "neet");

  // 3) "jee-adv-2024-paper-1" or "jeeadv-2024-p1"
  m = clean.match(/jee-?adv(?:anced)?[-.]?(20\d{2})[-.]?(?:paper)?[-.]?(\d)/);
  if (m) return { exam: "jeeadv", year: parseInt(m[1]), shift: "p" + m[2], subjects: ["physics", "chemistry", "mathematics"] };

  // 4) "ncert-exemplar-11-physics" or "ncert-11-ph"
  m = clean.match(/ncert[-.]?exemplar?[-.]?(\d{2})/);
  if (m) {
    const cls = parseInt(m[1]);
    const subj = guessSubjects(clean);
    return { exam: "ncert-exemplar", year: cls, shift: "", subjects: subj };
  }

  // 5) Generic: try to extract year + month-day
  const yearM = clean.match(/(20\d{2})/);
  if (!yearM) return null;

  const monthMap: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
  const monthM = clean.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  if (!monthM) return null;

  const dayM = clean.match(/(\d{1,2})[-.]?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
  const shiftM = clean.match(/shift[-.]?(\d)/i);

  // Default to jeemain
  return parseShift(yearM[1], dayM?.[1] || "01", monthM[1], shiftM?.[1] || "1", "jeemain");
}

function parseShift(yearStr: string, dayStr: string, monthStr: string, shiftStr: string, exam: Exam): ParsedMeta {
  const monthMap: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
  const mm = monthMap[monthStr.toLowerCase().slice(0, 3)] || "01";
  const dd = dayStr.padStart(2, "0");
  const shift = `${dd}${monthMap[monthStr.toLowerCase().slice(0, 3)] ? monthStr.toLowerCase().slice(0, 3) : "jan"}-s${shiftStr}`;

  const subjects: Record<Exam, Subject[]> = {
    jeemain: ["physics", "chemistry", "mathematics"],
    neet: ["physics", "chemistry", "biology"],
    jeeadv: ["physics", "chemistry", "mathematics"],
    "ncert-exemplar": ["physics", "chemistry", "mathematics", "biology"],
  };

  return { exam, year: parseInt(yearStr), shift, subjects: subjects[exam] };
}

function guessSubjects(name: string): Subject[] {
  if (name.includes("phy") || name.includes("phys")) return ["physics"];
  if (name.includes("chem")) return ["chemistry"];
  if (name.includes("math")) return ["mathematics"];
  if (name.includes("bio")) return ["biology"];
  return ["physics", "chemistry", "mathematics"];
}

// ─────────────────────────────────────────────────────────
// Answer key merger
// ─────────────────────────────────────────────────────────

async function mergeAnswerKey(text: string, answerKeyPath: string): Promise<{ text: string; keyFound: boolean }> {
  if (!answerKeyPath || !existsSync(answerKeyPath)) return { text, keyFound: false };

  logger.info(`  Answer key PDF: ${answerKeyPath}`);
  const ocrResult = await ocrPdf(answerKeyPath);
  const keyText = ocrResult.pages.map(p => p.markdown).join("\n\n").trim();

  if (!keyText) {
    logger.warn("  Answer key OCR returned empty — proceeding without it");
    return { text, keyFound: false };
  }

  logger.info(`  Answer key OCR: ${ocrResult.pages.length} pages, ${keyText.length} chars`);
  // Append answer key to the question text so structurer finds it
  return { text: text + "\n\n--- ANSWER KEY ---\n\n" + keyText, keyFound: true };
}

// ─────────────────────────────────────────────────────────
// EXAM DEFAULTS
// ─────────────────────────────────────────────────────────

const EXAM_DEFAULTS: Record<string, Partial<{ subjects: Subject[]; duration: number; marksCorrect: number; marksIncorrect: number; marksUnanswered: number; sections: Record<string, SectionConfig> }>> = {
  jeemain: {
    subjects: ["physics", "chemistry", "mathematics"],
    duration: 180, marksCorrect: 4, marksIncorrect: -1, marksUnanswered: 0,
    sections: { a: { label: "section a", total: 20, required: 20, mandatory: true }, b: { label: "section b", total: 10, required: 5, mandatory: false } },
  },
  neet: {
    subjects: ["physics", "chemistry", "biology"],
    duration: 200, marksCorrect: 4, marksIncorrect: -1, marksUnanswered: 0,
    sections: { a: { label: "section a", total: 100, required: 100, mandatory: true }, b: { label: "section b", total: 100, required: 100, mandatory: true } },
  },
  jeeadv: {
    subjects: ["physics", "chemistry", "mathematics"],
    duration: 180, marksCorrect: 4, marksIncorrect: -1, marksUnanswered: 0,
    sections: { a: { label: "section 1 (mcq)", total: 18, required: 18, mandatory: true }, b: { label: "section 2 (msq)", total: 15, required: 15, mandatory: true }, c: { label: "section 3 (nat)", total: 12, required: 12, mandatory: true } },
  },
  "ncert-exemplar": {
    subjects: ["physics", "chemistry", "mathematics", "biology"],
    duration: 0, marksCorrect: 1, marksIncorrect: 0, marksUnanswered: 0,
    sections: { a: { label: "questions", total: 0, required: 0, mandatory: true } },
  },
};

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs({
    args,
    options: {
      input: { type: "string", short: "i" },
      "answer-key": { type: "string", short: "k" },
      exam: { type: "string" },
      year: { type: "string" },
      shift: { type: "string" },
      force: { type: "boolean", short: "f" },
      help: { type: "boolean", short: "h" },
    },
  });

  const values = parsed.values;

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
  --help, -h               Show this help

If --exam/--year/--shift are omitted, they are inferred from the filename.
Checkpoints prevent re-processing the same shift. Use --force to override.
Examples:
  npx tsx scripts/process-pdf.ts --input "C:/Downloads/JEE-Main-2025-22Jan-Shift-1.pdf"
  npx tsx scripts/process-pdf.ts --input paper.pdf --answer-key answers.pdf --exam jeemain --year 2025 --shift "22jan-s1"
`);
    process.exit(0);
  }

  const pdfPath = values.input;
  if (!existsSync(pdfPath)) {
    logger.error(`PDF not found: ${pdfPath}`);
    process.exit(1);
  }

  // Parse metadata
  const filename = basename(pdfPath);
  let meta = parseFilename(filename);

  // Override with explicit flags
  if (values.exam) meta = { ...(meta || { exam: "jeemain" as Exam, year: 2025, shift: "1", subjects: ["physics", "chemistry", "mathematics"] as Subject[] }), exam: values.exam as Exam };
  if (values.year) meta = { ...(meta || { exam: "jeemain" as Exam, year: 2025, shift: "1", subjects: ["physics", "chemistry", "mathematics"] as Subject[] }), year: parseInt(values.year) };
  if (values.shift) meta = { ...(meta || { exam: "jeemain" as Exam, year: 2025, shift: "1", subjects: ["physics", "chemistry", "mathematics"] as Subject[] }), shift: values.shift };

  if (!meta) {
    logger.error(`Cannot determine exam/year/shift from filename: ${filename}`);
    logger.error("Use --exam, --year, --shift flags to specify manually.");
    process.exit(1);
  }

  const { exam, year, shift, subjects } = meta;

  // Check checkpoint — skip if already processed (unless --force)
  if (!values.force) {
    const existing = await isProcessed(exam, year, shift);
    if (existing) {
      logger.info(`Already processed: ${exam}/${year}/${shift} (${existing.totalQuestions} questions, ${existing.timestamp.slice(0, 10)})`);
      logger.info("Use --force to reprocess.");
      logger.info(`Existing file: ${existing.sourceFile}`);
      return;
    }
  }
  const dataDir = join(process.cwd(), "data");

  logger.info(`╔══════════════════════════════════════════╗`);
  logger.info(`║  Manual PDF Processing                   ║`);
  logger.info(`╚══════════════════════════════════════════╝`);
  logger.info(`  PDF:   ${pdfPath}`);
  logger.info(`  Exam:  ${exam}`);
  logger.info(`  Year:  ${year}`);
  logger.info(`  Shift: ${shift}`);
  logger.info(`  Answer key: ${values["answer-key"] || "(embedded in PDF — checking automatically)"}`);

  const startTime = Date.now();

  try {
    // Step 1: OCR
    logger.info("Step 1/4: OCR processing...");
    const ocrOutput = await ocrPdf(pdfPath);
    logger.info(`  ${ocrOutput.pages.length} pages, ${ocrOutput.pages.reduce((s, p) => s + p.markdown.length, 0)} chars`);

    // Step 1b: Merge answer key if provided as separate PDF
    let mergedText: string | null = null;
    let answerKeyFound = false;
    if (values["answer-key"]) {
      const result = await mergeAnswerKey(
        ocrOutput.pages.map(p => p.markdown).join("\n\n"),
        values["answer-key"]
      );
      mergedText = result.text;
      answerKeyFound = result.keyFound;
      logger.info(`  Answer key merged: ${answerKeyFound ? "yes" : "not found or empty"}`);
    }

    // Step 2: Structure extraction
    logger.info("Step 2/4: AI extraction...");
    const extraction = await extractQuestions(
      mergedText
        ? [{ page: 0, markdown: mergedText, isBilingual: false }]
        : ocrOutput.pages,
      exam
    );
    logger.info(`  ${extraction.questions.length} questions extracted`);
    logger.info(`  Answer key ${extraction.answerKeyFound ? "found" : "NOT found — answers set to empty"}`);

    if (extraction.questions.length === 0) {
      logger.error("No questions extracted. Aborting.");
      process.exit(1);
    }

    // Step 3: Cache diagrams
    logger.info("Step 3/4: Caching diagrams...");
    await cacheDiagrams({
      questions: extraction.questions,
      images: ocrOutput.images,
      outputDir: dataDir,
    });
    logger.info(`  Diagrams cached`);

    // Step 4: Finalize and export
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
      questions: extraction.questions as PartialQuestion[],
      passages: extraction.passages as Passage[],
      answerKeyFound: extraction.answerKeyFound,
    });

    const { paperPath, subjectPaths } = await writeDataset(file, dataDir);

    // Validate
    const validation = validateQuestionFile(file, dataDir);
    const errors = validation.filter(v => !v.valid);
    if (errors.length > 0) {
      logger.warn(`Validation: ${errors.length} question(s) have errors`);
      errors.forEach(e => {
        logger.warn(`  Q${e.index + 1} (${e.questionId}): ${e.flags.filter((f: any) => f.severity === "error").map((f: any) => f.message).join("; ")}`);
      });
    } else {
      logger.info("Validation: ALL QUESTIONS PASSED");
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.info(`=== Complete: ${file.total} questions in ${elapsed}s ===`);
    logger.info(`  Paper: ${paperPath}`);
    logger.info(`  Subjects: ${subjectPaths.join(", ")}`);
    logger.info(`  Review: npm run review -- --exam ${exam} --year ${year} --shift ${shift}`);

    // Record checkpoint
    await markProcessed({
      exam, year, shift,
      subjects: file.subjects ?? subjects ?? [],
      sourceFile: paperPath,
      timestamp: new Date().toISOString(),
      totalQuestions: file.total,
    });
  } catch (err) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.error(`Failed after ${elapsed}s: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Allow direct execution
if (process.argv[1]?.includes("process-pdf")) {
  await main();
}
