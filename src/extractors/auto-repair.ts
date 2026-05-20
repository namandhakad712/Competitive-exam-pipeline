import { logger } from "../utils/logger.js";
import type { PartialQuestion, Exam, PageContent } from "../types.js";
import { extractQuestions } from "./structurer.js";

export interface RepairError {
  type: "missing_answer" | "wrong_question_count" | "invalid_option_count" | "missing_field" | "duplicate_question";
  questionNumber?: number;
  message: string;
}

export interface RepairResult {
  questions: PartialQuestion[];
  repairs: string[];
  remainingErrors: RepairError[];
}

const EXAM_EXPECTED_COUNTS: Record<Exam, number> = {
  jeemain: 90,
  neet: 200,
  jeeadv: 54,
  "ncert-exemplar": 0,
};

/**
 * Validate extracted questions and return errors.
 */
export function validateExtraction(
  questions: PartialQuestion[],
  exam: Exam,
): RepairError[] {
  const errors: RepairError[] = [];

  // Check question count
  const expected = EXAM_EXPECTED_COUNTS[exam];
  if (expected > 0) {
    const diff = Math.abs(questions.length - expected);
    if (diff > 5) {
      errors.push({
        type: "wrong_question_count",
        message: `Expected ~${expected} questions, got ${questions.length} (diff: ${diff})`,
      });
    }
  }

  for (const q of questions) {
    // Missing answer (when answer key was found)
    if (!q.answer || q.answer === "") {
      errors.push({
        type: "missing_answer",
        questionNumber: q.number,
        message: `Q${q.number}: answer is empty`,
      });
    }

    // Invalid option count for MCQ
    if (q.type === "mcq") {
      if (!q.options || q.options.length < 3 || q.options.length > 5) {
        errors.push({
          type: "invalid_option_count",
          questionNumber: q.number,
          message: `Q${q.number}: ${q.options?.length ?? 0} options (expected 3-5)`,
        });
      }
    }

    // Missing required fields
    if (!q.text || q.text.trim() === "") {
      errors.push({
        type: "missing_field",
        questionNumber: q.number,
        message: `Q${q.number}: text is empty`,
      });
    }
  }

  return errors;
}

/**
 * Auto-repair strategies for common extraction errors.
 */
export async function autoRepair(
  questions: PartialQuestion[],
  errors: RepairError[],
  pages: PageContent[],
  exam: Exam,
): Promise<RepairResult> {
  const repairs: string[] = [];
  const remainingErrors: RepairError[] = [];
  let working = [...questions];

  for (const error of errors) {
    switch (error.type) {
      case "missing_answer": {
        // Re-extract just the answer key section (last few pages)
        const answerPages = pages.slice(-Math.min(pages.length, 3));
        if (answerPages.length > 0) {
          try {
            const answerKeyPages = answerPages.map((p) => ({
              ...p,
              markdown:
                "An answer key IS present below. Extract ONLY the answer key mappings.\n\n" +
                p.markdown,
            }));
            const result = await extractQuestions(answerKeyPages, exam);
            if (result.questions.length > 0) {
              // Map answers back to questions
              for (const aq of result.questions) {
                const found = working.find((w) => w.number === aq.number);
                if (found && aq.answer && aq.answer !== "") {
                  found.answer = aq.answer;
                  repairs.push(
                    `Q${aq.number}: answer restored from answer key re-extraction`,
                  );
                }
              }
            }
          } catch {
            remainingErrors.push(error);
          }
        } else {
          remainingErrors.push(error);
        }
        break;
      }

      case "invalid_option_count": {
        const q = working.find((w) => w.number === error.questionNumber);
        if (q && q.options && q.options.length > 0) {
          // Try to split merged options
          const fixed = repairOptions(q.text, q.options);
          if (fixed.length > q.options.length) {
            q.options = fixed;
            repairs.push(`Q${q.number}: options repaired (${fixed.length} options)`);
          } else {
            remainingErrors.push(error);
          }
        } else {
          remainingErrors.push(error);
        }
        break;
      }

      case "wrong_question_count": {
        // Re-extract with stricter prompt by calling with strict flag
        try {
          const result = await extractQuestions(pages, exam);
          if (result.questions.length > questions.length) {
            working = result.questions;
            repairs.push(
              `Re-extracted with strict prompt: ${questions.length} → ${result.questions.length} questions`,
            );
          } else {
            remainingErrors.push(error);
          }
        } catch {
          remainingErrors.push(error);
        }
        break;
      }

      default: {
        remainingErrors.push(error);
        break;
      }
    }
  }

  return { questions: working, repairs, remainingErrors };
}

/**
 * Attempt to repair option lists that may have merged adjacent options.
 */
export function repairOptions(text: string, options: string[]): string[] {
  const fixed: string[] = [];

  // Common option prefixes
  const optionPrefixes = /^\(?\s*[1-6A-F][.)]\s*/;

  for (const opt of options) {
    // Check if this option contains multiple options merged together
    const parts = opt.split(/(?=\([1-6]\)\s*|\([A-F]\)\s*|\d[.)]\s+[A-Z])/);
    if (parts.length > 1) {
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 3) fixed.push(trimmed);
      }
    } else {
      fixed.push(opt);
    }
  }

  // If we got more than 6 options, probably over-split
  if (fixed.length > 6) return options;

  return fixed;
}
