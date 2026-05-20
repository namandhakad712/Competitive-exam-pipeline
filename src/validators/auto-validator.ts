import { existsSync } from "fs";
import { join } from "path";
import { logger } from "../utils/logger.js";
import { validateByType } from "./field-checker.js";
import { isValidTag, normalizeTopic } from "../vocabulary.js";
import type {
  Question,
  QuestionFile,
  ValidationResult,
  ValidationFlag,
  QuestionType,
  Subject,
} from "../types.js";

const VALID_TYPES: QuestionType[] = ["mcq", "msq", "nat", "assertion-reason"];
const VALID_SUBJECTS: Subject[] = ["physics", "chemistry", "mathematics", "biology"];
const VALID_SOURCES = ["official-pdf", "reconstructed", "imported-kaggle", "imported-dataset"] as const;
const VALID_DIFFICULTIES = ["easy", "medium", "hard"] as const;
const VALID_SOLUTION_FORMATS = ["plain", "html", "markdown", "latex"] as const;
const VALID_CONFIDENCE = ["high", "medium", "low"] as const;

interface ValidatorContext {
  dataDir: string;
}

function flag(field: string, message: string, severity: ValidationFlag["severity"] = "warning"): ValidationFlag {
  return { field, severity, message };
}

function validateQuestion(q: Question, index: number, ctx: ValidatorContext): ValidationResult {
  const flags: ValidationFlag[] = [];
  const id = q.id || `index-${index}`;

  // 1. ID present
  if (!q.id) flags.push(flag("id", "Question has no ID", "error"));

  // 2. ID format
  const idPattern = /^[a-z0-9-]+$/;
  if (q.id && !idPattern.test(q.id)) {
    flags.push(flag("id", `ID "${q.id}" contains invalid characters`, "error"));
  }

  // 3. Number valid
  if (typeof q.number !== "number" || q.number < 1) {
    flags.push(flag("number", "Question number must be positive integer", "error"));
  }

  // 4. Subject valid
  if (!VALID_SUBJECTS.includes(q.subject as Subject)) {
    flags.push(flag("subject", `Invalid subject: ${q.subject}`, "error"));
  }

  // 5. Type valid
  if (!VALID_TYPES.includes(q.type)) {
    flags.push(flag("type", `Invalid question type: ${q.type}`, "error"));
  }

  // 6. Text not empty
  if (!q.text || q.text.trim().length === 0) {
    flags.push(flag("text", "Question text is empty", "error"));
  }

  // 7. Text has no placeholder
  const placeholders = ["[image]", "[figure]", "[diagram]", "[table]", "figure not found"];
  for (const ph of placeholders) {
    if (q.text?.toLowerCase().includes(ph)) {
      flags.push(flag("text", `Text may contain placeholder: "${ph}"`, "warning"));
    }
  }

  // 8. MCQ: options check
  if (q.type === "mcq") {
    if (!q.options || q.options.length < 3 || q.options.length > 5) {
      flags.push(flag("options", `MCQ has ${q.options?.length ?? 0} options (need 3-5)`, "error"));
    } else {
      const unique = new Set(q.options);
      if (unique.size !== q.options.length) {
        flags.push(flag("options", "MCQ has duplicate options", "error"));
      }
    }
  }

  // 9. MSQ: options + answers
  if (q.type === "msq") {
    if (!q.options || q.options.length < 4 || q.options.length > 6) {
      flags.push(flag("options", `MSQ has ${q.options?.length ?? 0} options (need 4-6)`, "error"));
    }
    if (!q.answers || q.answers.length < 1) {
      flags.push(flag("answers", "MSQ must have at least 1 correct answer", "error"));
    }
  }

  // 10. NAT: options null + negativeMarks 0
  if (q.type === "nat") {
    if (q.options !== null) {
      flags.push(flag("options", "NAT options must be null", "error"));
    }
    if (q.negativeMarks !== 0) {
      flags.push(flag("negativeMarks", `NAT negativeMarks must be 0, got ${q.negativeMarks}`, "error"));
    }
    if (q.answer && isNaN(parseFloat(q.answer))) {
      flags.push(flag("answer", "NAT answer must be numeric", "error"));
    }
    if (q.answerPrecision) {
      if (!["exact", "integer-range", "decimal-range"].includes(q.answerPrecision.type)) {
        flags.push(flag("answerPrecision.type", "Invalid precision type", "error"));
      }
    }
  }

  // 11. Assertion-reason: options null + answer 0-3
  if (q.type === "assertion-reason") {
    if (q.options !== null) {
      flags.push(flag("options", "Assertion-reason options must be null", "error"));
    }
    if (!["0", "1", "2", "3"].includes(q.answer)) {
      flags.push(flag("answer", "Assertion-reason answer must be 0-3", "error"));
    }
  }

  // 12. Marks positive
  if (typeof q.marks !== "number" || q.marks <= 0) {
    flags.push(flag("marks", "Marks must be positive", "error"));
  }

  // 13. hasDiagram matches diagrams
  if (q.hasDiagram && (!q.diagrams || q.diagrams.length === 0)) {
    flags.push(flag("hasDiagram", "hasDiagram=true but diagrams array is empty/null", "warning"));
  }
  if (!q.hasDiagram && q.diagrams && q.diagrams.length > 0) {
    flags.push(flag("hasDiagram", "hasDiagram=false but diagrams array is populated", "warning"));
  }

  // 14. Diagram files exist
  if (q.diagrams) {
    for (const d of q.diagrams) {
      const fullPath = join(ctx.dataDir, d.file);
      if (!existsSync(fullPath)) {
        flags.push(flag("diagrams.file", `Diagram file not found: ${d.file}`, "warning"));
      }
    }
  }

  // 15. passageId references
  if (q.passageId && typeof q.passageId !== "string") {
    flags.push(flag("passageId", "passageId must be a string or null", "error"));
  }

  // 16. textHi check
  if (q.textHi !== null && typeof q.textHi !== "string") {
    flags.push(flag("textHi", "textHi must be string or null", "error"));
  }

  // 17. Difficulty valid
  if (q.difficulty !== null && !VALID_DIFFICULTIES.includes(q.difficulty as typeof VALID_DIFFICULTIES[number])) {
    flags.push(flag("difficulty", `Invalid difficulty: ${q.difficulty}`, "warning"));
  }

  // 18. Source valid
  if (!VALID_SOURCES.includes(q.source as typeof VALID_SOURCES[number])) {
    flags.push(flag("source", `Invalid source: ${q.source}`, "error"));
  }

  // 19. Source + confidence consistency
  if (q.source === "official-pdf" && q.confidence !== null) {
    flags.push(flag("confidence", "official-pdf questions should have confidence=null", "info"));
  }
  if (q.source === "imported-kaggle" && q.confidence === null) {
    flags.push(flag("confidence", "imported-kaggle should have a confidence level", "info"));
  }

  // 20. Revision positive
  if (typeof q.revision !== "number" || q.revision < 1) {
    flags.push(flag("revision", "Revision must be >= 1", "error"));
  }

  // 21. SolutionFormat matches solution content
  if (q.solution && !q.solutionFormat) {
    flags.push(flag("solutionFormat", "Solution present but solutionFormat is null", "info"));
  }
  if (q.solutionFormat && !VALID_SOLUTION_FORMATS.includes(q.solutionFormat as typeof VALID_SOLUTION_FORMATS[number])) {
    flags.push(flag("solutionFormat", `Invalid solutionFormat: ${q.solutionFormat}`, "warning"));
  }

  // 22. Tags from vocabulary
  if (q.tags && q.tags.length > 0) {
    for (const tag of q.tags) {
      if (!isValidTag(q.subject as Subject, tag)) {
        flags.push(flag("tags", `Tag "${tag}" not in controlled vocabulary for ${q.subject}`, "warning"));
      }
    }
  }

  // 23. Topic normalized
  const normalizedTopic = normalizeTopic(q.topic);
  if (normalizedTopic !== q.topic) {
    flags.push(flag("topic", `Topic "${q.topic}" should be normalized to "${normalizedTopic}"`, "warning"));
  }

  // 24. No HTML injection
  const htmlPattern = /<script|<\/?[a-z][\s\S]*>/i;
  if (htmlPattern.test(q.text || "")) {
    flags.push(flag("text", "Text may contain HTML tags", "warning"));
  }
  if (q.options) {
    for (const opt of q.options) {
      if (htmlPattern.test(opt)) {
        flags.push(flag("options", "Option may contain HTML tags", "warning"));
        break;
      }
    }
  }

  // 25. No encoding issues
  if (q.text && /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(q.text)) {
    flags.push(flag("text", "Text contains broken Unicode or control characters", "error"));
  }

  // 26. Type-specific validation via field-checker
  const fieldErrors = validateByType(q);
  for (const fe of fieldErrors) {
    flags.push({
      field: fe.field,
      severity: fe.severity ?? "error",
      message: fe.message ?? `Field check failed: ${fe.field}`,
    });
  }

  // 27. numberLabel format
  if (q.numberLabel && !/^\d+[a-z]?$/i.test(q.numberLabel)) {
    flags.push(flag("numberLabel", `numberLabel "${q.numberLabel}" has unexpected format`, "info"));
  }

  return {
    questionId: id,
    index,
    valid: flags.filter(f => f.severity === "error").length === 0,
    flags,
  };
}

export function validateQuestionFile(file: QuestionFile, dataDir?: string): ValidationResult[] {
  const ctx: ValidatorContext = { dataDir: dataDir ?? process.cwd() };
  const results: ValidationResult[] = [];

  // Cross-question checks
  const ids = new Set<string>();
  const seenTexts = new Set<string>();

  for (let i = 0; i < file.questions.length; i++) {
    const q = file.questions[i];
    const result = validateQuestion(q, i, ctx);
    results.push(result);

    // 28. Duplicate IDs
    if (q.id) {
      if (ids.has(q.id)) {
        result.flags.push(flag("id", `Duplicate ID: ${q.id}`, "error"));
        result.valid = false;
      }
      ids.add(q.id);
    }

    // 29. Duplicate texts across questions
    const textKey = (q.text?.slice(0, 100) ?? "").toLowerCase();
    if (textKey.length > 20) {
      if (seenTexts.has(textKey)) {
        result.flags.push(flag("text", "Similar text appears in another question (possible duplicate)", "info"));
      }
      seenTexts.add(textKey);
    }
  }

  // 30. Passage reference integrity
  const passageIds = new Set(file.passages?.map(p => p.id) ?? []);
  for (const result of results) {
    const q = file.questions[result.index];
    if (q.passageId && !passageIds.has(q.passageId)) {
      result.flags.push(flag("passageId", `References unknown passage "${q.passageId}"`, "error"));
      result.valid = false;
    }
  }

  // 31. Total matches
  if (file.total !== file.questions.length) {
    logger.warn(`File total (${file.total}) != question count (${file.questions.length})`);
  }

  // 32. Subject count validation
  const subjectCounts: Record<string, number> = {};
  for (const q of file.questions) {
    subjectCounts[q.subject] = (subjectCounts[q.subject] ?? 0) + 1;
  }
  for (const [subj, count] of Object.entries(subjectCounts)) {
    logger.debug(`Subject ${subj}: ${count} questions`);
  }

  return results;
}
