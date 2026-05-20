import type { Question, QuestionType, ValidationRule } from "../types.js";

type RuleSet = ValidationRule[];

const MCQ_RULES: RuleSet = [
  { field: "options", check: (q) => q.options !== null && q.options.length >= 3 && q.options.length <= 5, message: "MCQ must have 3-5 options" },
  { field: "answers", check: (q) => q.answers === null, message: "MCQ must not have answers array" },
  { field: "answer", check: (q) => typeof q.answer === "string" && q.answer !== "", message: "MCQ answer must be a non-empty string" },
  { field: "answer", check: (q) => q.options !== null && parseInt(q.answer) >= 0 && parseInt(q.answer) < q.options.length, message: "MCQ answer index must be within options range", severity: "error" },
  { field: "negativeMarks", check: (q) => q.negativeMarks < 0, message: "MCQ negativeMarks should be negative" },
];

const MSQ_RULES: RuleSet = [
  { field: "options", check: (q) => q.options !== null && q.options.length >= 4 && q.options.length <= 6, message: "MSQ must have 4-6 options" },
  { field: "answers", check: (q) => q.answers !== null && q.answers.length >= 1, message: "MSQ must have at least 1 correct answer" },
  { field: "answer", check: (q) => q.answer === "", message: "MSQ answer field should be empty string" },
  { field: "answers", check: (q) => {
    if (!q.answers) return true;
    const sorted = [...q.answers].sort();
    return JSON.stringify(q.answers) === JSON.stringify(sorted);
  }, message: "MSQ answers must be sorted ascending" },
];

const NAT_RULES: RuleSet = [
  { field: "options", check: (q) => q.options === null, message: "NAT must have null options", severity: "error" },
  { field: "answer", check: (q) => !isNaN(parseFloat(q.answer)) && q.answer !== "", message: "NAT answer must be a numeric string" },
  { field: "negativeMarks", check: (q) => q.negativeMarks === 0, message: "NAT negativeMarks MUST be 0", severity: "error" },
  { field: "answerPrecision", check: (q) => {
    if (!q.answerPrecision) return true;
    return ["exact", "integer-range", "decimal-range"].includes(q.answerPrecision.type);
  }, message: "NAT answerPrecision type must be valid" },
];

const ASSERTION_REASON_RULES: RuleSet = [
  { field: "options", check: (q) => q.options === null, message: "Assertion-reason must have null options", severity: "error" },
  { field: "answer", check: (q) => ["0", "1", "2", "3"].includes(q.answer), message: "Assertion-reason answer must be 0-3", severity: "error" },
  { field: "answers", check: (q) => q.answers === null, message: "Assertion-reason must not have answers array" },
];

const RULES_MAP: Record<QuestionType, RuleSet> = {
  "mcq": MCQ_RULES,
  "msq": MSQ_RULES,
  "nat": NAT_RULES,
  "assertion-reason": ASSERTION_REASON_RULES,
};

export function getRulesForType(type: QuestionType): RuleSet {
  return RULES_MAP[type] ?? [];
}

export function validateByType(question: Question): ValidationRule[] {
  const rules = getRulesForType(question.type);
  const failed: ValidationRule[] = [];

  for (const rule of rules) {
    try {
      const passes = rule.check(question);
      if (!passes) {
        failed.push(rule);
      }
    } catch {
      failed.push(rule);
    }
  }

  return failed;
}
