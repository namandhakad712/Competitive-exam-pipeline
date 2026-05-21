import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "../utils/logger.js";
import type { Passage, Question, QuestionFile } from "../types.js";

export interface DiffField {
  field: string;
  modelA: unknown;
  modelB: unknown;
}

export interface QuestionDiff {
  index: number;
  idA: string | null;
  idB: string | null;
  status: "match" | "diff" | "missing-a" | "missing-b";
  diffs: DiffField[];
}

export interface PassageDiff {
  id: string;
  status: "match" | "diff" | "missing-a" | "missing-b";
  textA: string | null;
  textB: string | null;
}

export interface CrossValidationReport {
  exam: string;
  year: number | null;
  shift: string | null;
  date: string;
  modelA: string;
  modelB: string;
  totalQuestionsA: number;
  totalQuestionsB: number;
  matched: number;
  differed: number;
  missingInA: number;
  missingInB: number;
  questionDiffs: QuestionDiff[];
  passageDiffs: PassageDiff[];
  autoAcceptable: boolean;
}

const QUESTION_FIELDS: (keyof Question)[] = [
  "type", "subject", "number", "text", "options", "answer",
  "answers", "marks", "negativeMarks", "topic", "section",
  "passageId", "tags",
];

function normalizeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return JSON.stringify(v.map(normalizeStr));
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).trim();
}

function areFieldsEqual(a: unknown, b: unknown): boolean {
  return normalizeStr(a) === normalizeStr(b);
}

function diffQuestions(qa: Question, qb: Question): DiffField[] {
  const diffs: DiffField[] = [];
  for (const field of QUESTION_FIELDS) {
    if (!areFieldsEqual(qa[field], qb[field])) {
      diffs.push({ field, modelA: qa[field], modelB: qb[field] });
    }
  }
  return diffs;
}

function matchByPosition(questionsA: Question[], questionsB: Question[]): QuestionDiff[] {
  const maxLen = Math.max(questionsA.length, questionsB.length);
  const diffs: QuestionDiff[] = [];

  for (let i = 0; i < maxLen; i++) {
    const qa = questionsA[i];
    const qb = questionsB[i];

    if (!qa && qb) {
      diffs.push({ index: i, idA: null, idB: qb.id, status: "missing-a", diffs: [] });
    } else if (qa && !qb) {
      diffs.push({ index: i, idA: qa.id, idB: null, status: "missing-b", diffs: [] });
    } else if (qa && qb) {
      const fieldDiffs = diffQuestions(qa, qb);
      diffs.push({
        index: i,
        idA: qa.id,
        idB: qb.id,
        status: fieldDiffs.length === 0 ? "match" : "diff",
        diffs: fieldDiffs,
      });
    }
  }

  return diffs;
}

function diffPassages(passagesA: Passage[], passagesB: Passage[]): PassageDiff[] {
  const mapA = new Map(passagesA.map(p => [p.id, p]));
  const mapB = new Map(passagesB.map(p => [p.id, p]));
  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
  const diffs: PassageDiff[] = [];

  for (const id of allIds) {
    const pa = mapA.get(id);
    const pb = mapB.get(id);

    if (!pa && pb) {
      diffs.push({ id, status: "missing-a", textA: null, textB: pb.text });
    } else if (pa && !pb) {
      diffs.push({ id, status: "missing-b", textA: pa.text, textB: null });
    } else if (pa && pb) {
      diffs.push({
        id,
        status: pa.text === pb.text ? "match" : "diff",
        textA: pa.text,
        textB: pb.text,
      });
    }
  }

  return diffs;
}

export function crossValidate(
  fileA: QuestionFile,
  fileB: QuestionFile,
  modelA = "cerebras",
  modelB = "gemini",
): CrossValidationReport {
  const questionDiffs = matchByPosition(fileA.questions, fileB.questions);
  const passageDiffs = diffPassages(fileA.passages ?? [], fileB.passages ?? []);

  const matched = questionDiffs.filter(d => d.status === "match").length;
  const differed = questionDiffs.filter(d => d.status === "diff").length;
  const missingInA = questionDiffs.filter(d => d.status === "missing-a").length;
  const missingInB = questionDiffs.filter(d => d.status === "missing-b").length;

  return {
    exam: fileA.exam,
    year: fileA.year,
    shift: fileA.shift,
    date: new Date().toISOString(),
    modelA,
    modelB,
    totalQuestionsA: fileA.questions.length,
    totalQuestionsB: fileB.questions.length,
    matched,
    differed,
    missingInA,
    missingInB,
    questionDiffs,
    passageDiffs,
    autoAcceptable: differed === 0 && missingInA === 0 && missingInB === 0,
  };
}

export interface CrossValidationResult {
  report: CrossValidationReport;
  consensus: QuestionFile;
}

export function buildConsensus(
  fileA: QuestionFile,
  fileB: QuestionFile,
  resolutions?: Map<string, Partial<Question>>,
): CrossValidationResult {
  const report = crossValidate(fileA, fileB);

  const questions: Question[] = [];
  const maxLen = Math.max(fileA.questions.length, fileB.questions.length);

  for (let i = 0; i < maxLen; i++) {
    const qa = fileA.questions[i];
    const qb = fileB.questions[i];

    if (!qa && qb) {
      questions.push(qb);
    } else if (qa && !qb) {
      questions.push(qa);
    } else     if (qa && qb) {
      const resolution = resolutions?.get(qa.id);
      if (resolution) {
        questions.push({ ...qa, ...resolution });
      } else {
        questions.push(qa);
      }
    }
  }

  const passagesA = fileA.passages ?? [];
  const passagesB = fileB.passages ?? [];
  const passageMap = new Map<string, Passage>();
  for (const p of [...passagesA, ...passagesB]) {
    if (!passageMap.has(p.id)) {
      passageMap.set(p.id, p);
    }
  }

  const consensus: QuestionFile = {
    ...fileA,
    questions,
    passages: [...passageMap.values()],
  };

  return { report, consensus };
}

export async function saveReport(report: CrossValidationReport, outputDir: string): Promise<void> {
  const reportPath = join(outputDir, `cross-validate-${report.exam}-${report.year}-${report.shift}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  logger.info(`Cross-validation report saved: ${reportPath}`);
}

export async function loadReport(
  exam: string,
  year: number | string,
  shift: string,
  outputDir: string,
): Promise<CrossValidationReport | null> {
  const reportPath = join(outputDir, `cross-validate-${exam}-${year}-${shift}.json`);
  try {
    const raw = await readFile(reportPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
