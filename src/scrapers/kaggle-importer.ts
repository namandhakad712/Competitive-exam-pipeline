import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "../utils/logger.js";
import { computeChecksum } from "../utils/hash-utils.js";
import type { Question, QuestionFile, Exam, Subject } from "../types.js";

const DATA_DIR = join(process.cwd(), "data");

interface RawQuestion {
  [key: string]: unknown;
}

interface KaggleMapping {
  textField: string;
  subjectField: string;
  topicField: string;
  optionsField: string;
  answerField: string;
  marksField: string;
  typeField: string;
  difficultyField: string;
  tagsField: string;
  subjectDefault: Subject;
  optionsDelimiter: string;
}

const COMMON_MAPPINGS: Record<string, KaggleMapping> = {
  default_mcq: {
    textField: "question",
    subjectField: "subject",
    topicField: "topic",
    optionsField: "options",
    answerField: "answer",
    marksField: "marks",
    typeField: "type",
    difficultyField: "difficulty",
    tagsField: "tags",
    subjectDefault: "physics",
    optionsDelimiter: "|",
  },
};

function inferSubject(raw: string | undefined, mapping: KaggleMapping): Subject {
  if (raw) {
    const s = raw.toLowerCase().trim();
    const valid: Subject[] = ["physics", "chemistry", "mathematics", "biology"];
    if (valid.includes(s as Subject)) return s as Subject;
  }
  return mapping.subjectDefault;
}

function inferType(raw: string | undefined): "mcq" | "msq" | "nat" | "assertion-reason" {
  const t = raw?.toLowerCase().trim() ?? "";
  if (t === "msq" || t === "multiple") return "msq";
  if (t === "nat" || t === "numerical") return "nat";
  if (t === "assertion-reason" || t === "ar") return "assertion-reason";
  return "mcq";
}

function parseOptions(raw: string | undefined, delimiter: string): string[] | null {
  if (!raw) return null;
  return raw.split(delimiter).map(s => s.trim()).filter(Boolean);
}

export async function importKaggleDataset(
  filePath: string,
  exam: Exam,
  year: number,
  mappingKey?: string,
): Promise<QuestionFile | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const rows: RawQuestion[] = JSON.parse(raw);

    if (!Array.isArray(rows) || rows.length === 0) {
      logger.warn(`Kaggle import: empty or invalid JSON at ${filePath}`);
      return null;
    }

    const mapping = COMMON_MAPPINGS[mappingKey ?? "default_mcq"];
    const questions: Question[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      const getStr = (key: string): string | undefined =>
        typeof row[key] === "string" ? (row[key] as string) : undefined;
      const getNum = (key: string): number | undefined =>
        typeof row[key] === "number" ? (row[key] as number) : undefined;

      const subject = inferSubject(getStr(mapping.subjectField), mapping);
      const type = inferType(getStr(mapping.typeField));
      const options = type === "nat" || type === "assertion-reason"
        ? null
        : parseOptions(getStr(mapping.optionsField), mapping.optionsDelimiter);

      questions.push({
        id: `${exam}-${year}-imported-${subject.substring(0, 2)}-${String(i + 1).padStart(3, "0")}`,
        number: i + 1,
        numberLabel: null,
        subject,
        topic: getStr(mapping.topicField) ?? "unknown",
        section: null,
        type,
        text: getStr(mapping.textField) ?? "",
        textHi: null,
        options,
        answer: getStr(mapping.answerField) ?? "",
        answers: null,
        answerPrecision: null,
        marks: getNum(mapping.marksField) ?? 4,
        negativeMarks: type === "nat" ? 0 : -1,
        passageId: null,
        solution: null,
        solutionFormat: null,
        hasDiagram: false,
        diagrams: null,
        difficulty: null,
        tags: [],
        revision: 1,
        source: "imported-kaggle",
        confidence: "low",
      });
    }
    const now = new Date().toISOString();
    const file: QuestionFile = {
      schema: "v4",
      exam,
      year,
      shift: null,
      paper: null,
      subjects: [...new Set(questions.map(q => q.subject))],
      total: questions.length,
      duration: 180,
      marksCorrect: 4,
      marksIncorrect: -1,
      marksUnanswered: 0,
      sections: { a: { label: "section a", total: questions.length, required: questions.length, mandatory: true } },
      scrapedAt: now,
      answerKeyFound: true,
      checksum: "",
      provenance: {
        author: "Naman Dhakad",
        repo: "https://github.com/namandhakad712/Jee-Neet-PYQ",
        license: "PolyForm-Noncommercial-1.0.0",
        pipelineVersion: "1.0.0",
        generatedAt: now,
      },
      questions,
      passages: [],
    };
    file.checksum = computeChecksum(file as unknown as Record<string, unknown>);

    const outputDir = join(DATA_DIR, exam, String(year), "imported");
    await mkdir(outputDir, { recursive: true });
    const outputPath = join(outputDir, "kaggle-import.json");
    await writeFile(outputPath, JSON.stringify(file, null, 2), "utf8");

    logger.info(`Kaggle import: ${questions.length} questions written to ${outputPath}`);
    return file;
  } catch (err) {
    logger.error(`Kaggle import failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
