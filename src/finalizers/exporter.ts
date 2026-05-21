import { mkdir, writeFile, readFile } from "fs/promises";
import { join, dirname } from "path";
import { logger } from "../utils/logger.js";
import { computeChecksum } from "../utils/hash-utils.js";
import { assignIds } from "./id-assigner.js";
import { normalizeTexts } from "./normalizer.js";
import { normalizeTopics } from "./topic-normalizer.js";
import type {
  Question,
  QuestionFile,
  PartialQuestion,
  Exam,
  Subject,
  SectionConfig,
  Passage,
} from "../types.js";

const DATA_DIR = join(process.cwd(), "data");

interface ExportInput {
  exam: Exam;
  year: number | null;
  shift: string | null;
  paper: string | null;
  subjects: Subject[];
  duration: number;
  marksCorrect: number;
  marksIncorrect: number;
  marksUnanswered: number;
  sections: Record<string, SectionConfig>;
  answerKeyFound: boolean;
  questions: PartialQuestion[];
  passages: Passage[];
  sourceDir?: string;
}

function buildQuestion(q: PartialQuestion, id: string, revision: number): Question {
  return {
    id,
    number: q.number,
    numberLabel: q.numberLabel,
    subject: q.subject,
    topic: q.topic ?? "unknown",
    section: q.section ?? null,
    type: q.type,
    text: q.text,
    textHi: q.textHi,
    options: q.options,
    answer: q.answer ?? "",
    answers: q.answers,
    answerPrecision: q.answerPrecision,
    marks: q.marks,
    negativeMarks: q.negativeMarks,
    passageId: q.passageId,
    solution: q.solution,
    solutionFormat: q.solutionFormat,
    hasDiagram: q.hasDiagram,
    diagrams: q.diagrams,
    difficulty: q.difficulty,
    tags: q.tags,
    revision,
    source: q.source,
    confidence: q.confidence,
  };
}

function computeDir(exportDir: string): string {
  return dirname(exportDir);
}

export async function exportDataset(input: ExportInput, revision = 1): Promise<QuestionFile> {
  const { exam, year, shift, paper, subjects, duration, marksCorrect, marksIncorrect, marksUnanswered, sections, questions, passages } = input;

  // Step 1: normalize texts
  normalizeTexts(questions as unknown as Array<{ text: string; textHi: string | null; options: string[] | null; solution: string | null }>);

  // Step 2: normalize topics
  normalizeTopics(questions as unknown as Array<{ topic: string; subject: Subject }>);

  // Step 3: assign IDs (subject-relative numbering based on actual question order within each subject)
  const subjectOrder: Partial<Record<Subject, number>> = {};
  const ids = questions.map(q => {
    const count = (subjectOrder[q.subject] ?? 0) + 1;
    subjectOrder[q.subject] = count;
    return assignIds(
      [{ subject: q.subject, number: count }],
      exam,
      year,
      shift,
    )[0];
  });

  // Step 4: build full Question objects
  const fullQuestions: Question[] = questions.map((q, i) =>
    buildQuestion(q, ids[i], revision),
  );

  // Step 5: build file structure
  const now = new Date().toISOString();
  const file: QuestionFile = {
    schema: "v4",
    exam,
    year,
    shift,
    paper,
    subjects,
    total: fullQuestions.length,
    duration,
    marksCorrect,
    marksIncorrect,
    marksUnanswered,
    sections,
    scrapedAt: now,
    answerKeyFound: input.answerKeyFound,
    checksum: "",
    provenance: {
      author: "",
      repo: "",
      license: "GPLv3 OR Commercial",
      pipelineVersion: "1.0.0",
      generatedAt: now,
    },
    questions: fullQuestions,
    passages,
  };

  // Step 6: compute checksum (before adding checksum field)
  file.checksum = computeChecksum(file as unknown as Record<string, unknown>);

  return file;
}

export async function writeDataset(
  file: QuestionFile,
  outputDir?: string,
): Promise<{ paperPath: string; subjectPaths: string[] }> {
  const baseDir = outputDir ?? DATA_DIR;
  const { exam, year, shift } = file;

  let shiftDir: string;
  if (exam === "ncert-exemplar") {
    shiftDir = join(baseDir, exam, `class-${year}`);
  } else if (shift) {
    shiftDir = join(baseDir, exam, String(year ?? "unknown"), shift);
  } else {
    shiftDir = join(baseDir, exam, String(year ?? "unknown"));
  }

  await mkdir(shiftDir, { recursive: true });

  // Group questions by subject
  const subjectGroups: Record<string, Question[]> = {};
  for (const q of file.questions) {
    const subj = q.subject;
    if (!subjectGroups[subj]) subjectGroups[subj] = [];
    subjectGroups[subj].push(q);
  }

  // Write subject files FIRST (primary output)
  const subjectPaths: string[] = [];
  for (const [subj, subjQuestions] of Object.entries(subjectGroups)) {
    const renumbered = subjQuestions.map((q, i) => ({
      ...q,
      number: i + 1,
    }));

    const subjFile: QuestionFile = {
      ...file,
      total: renumbered.length,
      questions: renumbered,
    };
    subjFile.checksum = computeChecksum(subjFile as unknown as Record<string, unknown>);

    const subjPath = join(shiftDir, `${subj}.json`);
    await writeFile(subjPath, JSON.stringify(subjFile, null, 2), "utf8");
    subjectPaths.push(subjPath);
    logger.info(`Exported: ${subjPath}`);
  }

  // Write paper.json SECONDARY (merged from subjects)
  const paperPath = join(shiftDir, "paper.json");
  await writeFile(paperPath, JSON.stringify(file, null, 2), "utf8");
  logger.info(`Exported: ${paperPath}`);

  // Update index.json
  await updateIndex(baseDir, file);

  return { paperPath, subjectPaths };
}

async function updateIndex(baseDir: string, file: QuestionFile): Promise<void> {
  const indexPath = join(baseDir, "index.json");
  let index: Record<string, unknown> = { datasets: [] };

  try {
    const existing = await readFile(indexPath, "utf8");
    index = JSON.parse(existing);
  } catch {
    // no existing index
  }

  const datasets = (index.datasets as Record<string, unknown>[]) ?? [];
  const key = file.shift
    ? `${file.exam}/${file.year}/${file.shift}`
    : `${file.exam}/${file.year}`;

  const existingEntry = datasets.findIndex((d: Record<string, unknown>) => d.key === key);
  const entry = {
    key,
    exam: file.exam,
    year: file.year,
    shift: file.shift,
    total: file.total,
    subjects: file.subjects,
    lastUpdated: new Date().toISOString(),
    checksum: file.checksum,
  };

  if (existingEntry >= 0) {
    datasets[existingEntry] = entry;
  } else {
    datasets.push(entry);
  }

  index.datasets = datasets;
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
  logger.info(`Index updated: ${indexPath}`);
}
