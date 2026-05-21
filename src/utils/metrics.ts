import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { logger } from "./logger.js";
import type { QuestionFile, Question } from "../types.js";

const METRICS_FILE = join(process.cwd(), "data", ".metrics.json");

export interface MetricSummary {
  date: string;
  exam: string;
  year: number | null;
  shift: string | null;
  totalQuestions: number;
  questionExtractionAccuracy: number;
  answerAccuracy: number;
  topicAccuracy: number;
  overallAccuracy: number;
  extractionErrors: number;
  answerErrors: number;
  topicErrors: number;
  providerResultsCount: number;
}

interface MetricsHistory {
  [key: string]: MetricSummary[];
}

/**
 * Compare extracted questions against a golden dataset.
 * Returns per-field accuracy metrics.
 */
export function computeMetrics(
  extracted: QuestionFile,
  golden: QuestionFile,
  label?: string,
): MetricSummary {
  const extractMap = new Map(
    extracted.questions.map((q) => [q.number, q]),
  );
  const goldenMap = new Map(
    golden.questions.map((q) => [q.number, q]),
  );

  let textMatch = 0;
  let answerMatch = 0;
  let topicMatch = 0;
  let optionMatch = 0;
  let totalChecked = 0;

  for (const [num, gq] of goldenMap) {
    const eq = extractMap.get(num);
    if (!eq) continue;

    totalChecked++;

    // Question text accuracy (first 100 chars)
    const gText = gq.text.slice(0, 100).trim().toLowerCase();
    const eText = eq.text.slice(0, 100).trim().toLowerCase();
    if (gText === eText) textMatch++;

    // Answer accuracy
    if (gq.answer && gq.answer === eq.answer) answerMatch++;

    // Topic accuracy
    if (
      gq.topic &&
      eq.topic &&
      gq.topic.toLowerCase() === eq.topic.toLowerCase()
    ) {
      topicMatch++;
    }

    // Options accuracy
    const gOptStr = JSON.stringify(gq.options);
    const eOptStr = JSON.stringify(eq.options);
    if (gOptStr === eOptStr) optionMatch++;
  }

  const overallFields = textMatch + answerMatch + topicMatch + optionMatch;
  const overallTotal = totalChecked * 4;

  const summary: MetricSummary = {
    date: new Date().toISOString(),
    exam: extracted.exam,
    year: extracted.year,
    shift: extracted.shift,
    totalQuestions: extracted.total,
    questionExtractionAccuracy:
      totalChecked > 0 ? (textMatch / totalChecked) * 100 : 0,
    answerAccuracy:
      totalChecked > 0 ? (answerMatch / totalChecked) * 100 : 0,
    topicAccuracy:
      totalChecked > 0 ? (topicMatch / totalChecked) * 100 : 0,
    overallAccuracy:
      overallTotal > 0 ? (overallFields / overallTotal) * 100 : 0,
    extractionErrors: totalChecked - textMatch,
    answerErrors: totalChecked - answerMatch,
    topicErrors: totalChecked - topicMatch,
    providerResultsCount: 0,
  };

  if (label) {
    logger.info(
      `${label}: text=${summary.questionExtractionAccuracy.toFixed(1)}% answer=${summary.answerAccuracy.toFixed(1)}% topic=${summary.topicAccuracy.toFixed(1)}% overall=${summary.overallAccuracy.toFixed(1)}%`,
    );
  }

  return summary;
}

/**
 * Compare two sets of extracted questions (e.g., from different providers).
 * Useful for measuring inter-provider agreement.
 */
export function compareProviders(
  fileA: QuestionFile,
  fileB: QuestionFile,
  labelA = "provider-a",
  labelB = "provider-b",
): MetricSummary {
  const mapA = new Map(fileA.questions.map((q) => [q.number, q]));
  const mapB = new Map(fileB.questions.map((q) => [q.number, q]));

  let textMatch = 0;
  let answerMatch = 0;
  let totalChecked = 0;

  for (const [num, qa] of mapA) {
    const qb = mapB.get(num);
    if (!qb) continue;
    totalChecked++;

    const aText = qa.text.slice(0, 100).trim().toLowerCase();
    const bText = qb.text.slice(0, 100).trim().toLowerCase();
    if (aText === bText) textMatch++;

    if (qa.answer && qa.answer === qb.answer) answerMatch++;
  }

  return {
    date: new Date().toISOString(),
    exam: fileA.exam,
    year: fileA.year,
    shift: fileA.shift,
    totalQuestions: Math.max(fileA.total, fileB.total),
    questionExtractionAccuracy:
      totalChecked > 0 ? (textMatch / totalChecked) * 100 : 0,
    answerAccuracy:
      totalChecked > 0 ? (answerMatch / totalChecked) * 100 : 0,
    topicAccuracy: 0,
    overallAccuracy: 0,
    extractionErrors: totalChecked - textMatch,
    answerErrors: totalChecked - answerMatch,
    topicErrors: 0,
    providerResultsCount: 2,
  };
}

/**
 * Print a formatted metrics report to console.
 */
export function printMetricsReport(summary: MetricSummary): void {
  console.log(`\n╔═════════════════════════════════════╗`);
  console.log(`║  ACCURACY REPORT`);
  console.log(`║  ${summary.exam} ${summary.year} ${summary.shift}`);
  console.log(`╚═════════════════════════════════════╝`);
  console.log(`  Total questions:   ${summary.totalQuestions}`);
  console.log(`  Extraction:        ${summary.questionExtractionAccuracy.toFixed(1)}% (${summary.extractionErrors} errors)`);
  console.log(`  Answer accuracy:   ${summary.answerAccuracy.toFixed(1)}% (${summary.answerErrors} errors)`);
  console.log(`  Topic accuracy:    ${summary.topicAccuracy.toFixed(1)}% (${summary.topicErrors} errors)`);
  console.log(`  Overall accuracy:  ${summary.overallAccuracy.toFixed(1)}%`);
  console.log(`  Date:              ${summary.date.slice(0, 10)}`);
  console.log();
}

/**
 * Save a metric entry for historical tracking, with per-exam grouping.
 */
export async function saveMetric(summary: MetricSummary): Promise<void> {
  const key = `${summary.exam}/${summary.year}/${summary.shift}`;
  let history: MetricsHistory = {};

  if (existsSync(METRICS_FILE)) {
    try {
      const raw = await readFile(METRICS_FILE, "utf-8");
      history = JSON.parse(raw);
    } catch {
      history = {};
    }
  }

  if (!history[key]) history[key] = [];
  history[key].push(summary);

  await writeFile(METRICS_FILE, JSON.stringify(history, null, 2), "utf-8");
  logger.info(`Metrics saved: ${key}`);
}

/**
 * Load metric history for a specific exam/year/shift.
 */
export async function loadMetrics(
  exam: string,
  year: number | string,
  shift: string,
): Promise<MetricSummary[]> {
  const key = `${exam}/${year}/${shift}`;
  if (!existsSync(METRICS_FILE)) return [];

  try {
    const raw = await readFile(METRICS_FILE, "utf-8");
    const history: MetricsHistory = JSON.parse(raw);
    return history[key] || [];
  } catch {
    return [];
  }
}

/**
 * Export a summary of all accuracy trends across the entire dataset.
 */
export async function getAccuracyTrends(): Promise<
  Record<string, { totalRuns: number; latestAccuracy: number; avgAccuracy: number }>
> {
  if (!existsSync(METRICS_FILE)) return {};

  try {
    const raw = await readFile(METRICS_FILE, "utf-8");
    const history: MetricsHistory = JSON.parse(raw);
    const trends: Record<
      string,
      { totalRuns: number; latestAccuracy: number; avgAccuracy: number }
    > = {};

    for (const [key, entries] of Object.entries(history)) {
      const accuracies = entries.map((e) => e.overallAccuracy);
      trends[key] = {
        totalRuns: entries.length,
        latestAccuracy: accuracies[accuracies.length - 1],
        avgAccuracy:
          accuracies.reduce((a, b) => a + b, 0) / accuracies.length,
      };
    }

    return trends;
  } catch {
    return {};
  }
}
