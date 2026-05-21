#!/usr/bin/env node

import { existsSync } from "fs";
import { join } from "path";
import { enhancedOcrPdf } from "../src/extractors/ocr-stage.js";
import { extractWithConsensus } from "../src/extractors/consensus-extractor.js";
import { extractQuestions } from "../src/extractors/structurer.js";
import { cacheDiagrams } from "../src/extractors/diagram-cacher.js";
import { validateQuestionFile } from "../src/validators/auto-validator.js";
import { exportDataset } from "../src/finalizers/exporter.js";
import { logger } from "../src/utils/logger.js";
import type { ProviderName, Subject } from "../src/types.js";

async function testFullPipeline() {
  const pdfPath = process.argv[2];
  const examArg = process.argv[3] || "default-exam";
  if (!pdfPath || !existsSync(pdfPath)) {
    console.error("Usage: npx tsx scripts/test-full-pipeline.ts <path-to-pdf>");
    process.exit(1);
  }

  logger.info("=== FULL PIPELINE TEST ===");

  // Stage 1: Enhanced OCR
  logger.info("Stage 1: Enhanced OCR");
  const ocrResult = await enhancedOcrPdf(pdfPath);
  logger.info(`  ${ocrResult.pages.length} pages`);

  const hasStructured = "structuredAnnotation" in ocrResult && !!ocrResult.structuredAnnotation;
  const hasBbox = "bboxAnnotation" in ocrResult && !!ocrResult.bboxAnnotation;
  logger.info(`  Structured annotation: ${hasStructured ? "YES" : "NO"}`);
  logger.info(`  Bbox annotation: ${hasBbox ? "YES" : "NO"}`);

  // Stage 2: Try structured annotation first
  logger.info("Stage 2: Extraction");
  let questions: any[] | undefined;
  let passages: any[] = [];
  let answerKeyFound = false;

  if (hasStructured) {
    const enhanced = ocrResult as any;
    const annotation = enhanced.structuredAnnotation as any;
    if (annotation?.questions?.length > 0) {
      logger.info(`  Using structured annotation: ${annotation.questions.length} questions`);
      questions = annotation.questions.map((q: any, i: number) => ({
        number: q.number || i + 1,
        numberLabel: null,
        subject: q.subject || "physics",
        topic: null,
        section: null,
        type: "mcq",
        text: q.text || "",
        textHi: null,
        options: q.options || null,
        answer: q.answer || "",
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
      }));
      passages = [];
      answerKeyFound = questions!.some((q: any) => q.answer && q.answer !== "");
    }
  }

  if (!questions) {
    const availableProviders: ProviderName[] = ["poolside", "longcat-lite", "nvidia-qwen"];
    const providerKeys: Record<string, string | undefined> = {
      poolside: process.env.POOLSIDE_API_KEY,
      "longcat-lite": process.env.LONGCAT_API_KEY,
      "nvidia-qwen": process.env.NVIDIA_API_KEY,
    };
    const activeProviders = availableProviders.filter((p) => providerKeys[p]);

    if (activeProviders.length >= 2) {
      logger.info(`  Using consensus extraction (${activeProviders.length} providers)`);
      const consensus = await extractWithConsensus(
        ocrResult.pages,
        examArg,
        activeProviders,
      );
      questions = consensus.questions;
      passages = consensus.passages;
      answerKeyFound = consensus.answerKeyFound;
      logger.info(`  ${consensus.conflicts.length} conflicts`);
    } else {
      logger.info("  Using single-provider extraction");
      const extraction = await extractQuestions(ocrResult.pages, examArg);
      questions = extraction.questions;
      passages = extraction.passages;
      answerKeyFound = extraction.answerKeyFound;
    }
  }

  logger.info(`  ${questions.length} questions`);
  logger.info(`  Answer key found: ${answerKeyFound}`);

  // Stage 3: Diagram Caching
  logger.info("Stage 3: Diagram Caching");
  const tempDir = join(process.cwd(), "data", "pipeline-test", String(Date.now()));
  await cacheDiagrams({
    questions,
    images: ocrResult.images,
    shiftDir: tempDir,
    ocrResult: "mistralPages" in ocrResult ? (ocrResult as any) : undefined,
  });
  const withDiagrams = questions.filter((q: any) => q.diagrams?.length);
  logger.info(`  ${withDiagrams.length} questions with diagrams`);

  // Stage 4: Validation
  logger.info("Stage 4: Validation");
  const file = await exportDataset({
    exam: examArg,
    year: 2025,
    shift: "test",
    paper: null,
    subjects: ["physics", "chemistry", "biology"] as Subject[],
    duration: 200,
    marksCorrect: 4,
    marksIncorrect: -1,
    marksUnanswered: 0,
    sections: {
      a: { label: "section a", total: questions.length, required: questions.length, mandatory: true },
    },
    questions: questions || [],
    passages: passages || [],
    answerKeyFound,
  });

  const validation = validateQuestionFile(file, "data");
  const errors = validation.filter((v) => !v.valid);
  logger.info(`  ${validation.length - errors.length}/${validation.length} questions valid`);

  if (errors.length > 0) {
    logger.warn(`  ${errors.length} validation errors`);
    for (const err of errors.slice(0, 5)) {
      logger.warn(`    Q${err.index + 1}: ${err.flags[0]?.message || "unknown"}`);
    }
  }

  const accuracy = ((validation.length - errors.length) / validation.length) * 100;
  logger.info("=== TEST COMPLETE ===");
  logger.info(`Accuracy: ${accuracy.toFixed(1)}%`);
}

testFullPipeline().catch((err) => {
  logger.error(`Pipeline test failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
