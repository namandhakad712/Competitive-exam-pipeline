import type { PartialQuestion } from "../types.js";

export const LETTER_TO_INDEX: Record<string, string> = { a:"0", b:"1", c:"2", d:"3", e:"4" };

export function normalizeQuestions(questions: PartialQuestion[]): PartialQuestion[] {
  return questions.map(q => {
    const number = typeof q.number === "string" ? parseInt(q.number, 10) : q.number;

    let answer = q.answer ?? "";
    let answers = q.answers ?? null;

    if (Array.isArray(answers) && answers.length > 0 && !answer) {
      answer = String(answers[0]);
      answers = null;
    }

    if (answer && answer !== "") {
      const trimmed = answer.trim().toLowerCase();
      const deparen = trimmed.replace(/[()]/g, "");

      if (LETTER_TO_INDEX[deparen] !== undefined) {
        answer = LETTER_TO_INDEX[deparen];
      } else if (["1", "2", "3", "4"].includes(deparen) && q.options && q.options.length === 4) {
        answer = String(parseInt(deparen, 10) - 1);
      } else if (["0", "1", "2", "3"].includes(deparen)) {
        answer = deparen;
      }
    }

    let options = q.options;
    if (q.type === "assertion-reason") {
      options = null;
    }

    return { ...q, number, answer, answers, options };
  });
}

export function assignSections(questions: PartialQuestion[]): PartialQuestion[] {
  return questions.map(q => {
    if (q.section) return q;
    if (q.number >= 1 && q.number <= 100) return { ...q, section: "a" };
    if (q.number >= 101 && q.number <= 200) return { ...q, section: "b" };
    return q;
  });
}

export function normalizeAndAssignSections(questions: PartialQuestion[]): PartialQuestion[] {
  return assignSections(normalizeQuestions(questions));
}
