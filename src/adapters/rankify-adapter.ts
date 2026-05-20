import type { Question } from "../types.js";

const AR_OPTIONS = [
  "Both A and R are true and R is the correct explanation of A",
  "Both A and R are true but R is NOT the correct explanation of A",
  "A is true but R is false",
  "A is false but R is true",
];

interface RankifyQuestionData {
  testQuestionId: string;
  testSessionId: string;
  testQuestionType: string;
  testQuestionNumber: number;
  testQuestionText: string;
  testQuestionOptions: string[];
  testQuestionSubject: string;
  testQuestionTopic: string;
  testQuestionMarks: number;
  testQuestionNegativeMarks: number;
  testQuestionDifficulty: string | null;
  testSection: string | null;
  testQuestionAnswer: string;
  testQuestionAnswers: string[];
}

interface RankifyPaperData {
  testSessionId: string;
  testQuestionsData: RankifyQuestionData[];
}

const passageCache = new Map<string, string>();

export function setPassageCache(passages: Array<{ id: string; text: string }>): void {
  for (const p of passages) {
    passageCache.set(p.id, p.text);
  }
}

export function adaptQuestion(q: Question): RankifyQuestionData {
  const options = q.type === "assertion-reason"
    ? AR_OPTIONS
    : q.options ?? [];

  let text = q.text;
  if (q.passageId) {
    const passageText = passageCache.get(q.passageId);
    if (passageText) {
      text = `${passageText}\n\n${text}`;
    }
  }

  return {
    testQuestionId: q.id,
    testSessionId: "",
    testQuestionType: q.type,
    testQuestionNumber: q.number,
    testQuestionText: text,
    testQuestionOptions: options,
    testQuestionSubject: q.subject,
    testQuestionTopic: q.topic,
    testQuestionMarks: q.marks,
    testQuestionNegativeMarks: q.negativeMarks,
    testQuestionDifficulty: q.difficulty,
    testSection: q.section,
    testQuestionAnswer: q.answer,
    testQuestionAnswers: q.answers ?? [],
  };
}

export function adaptPaper(
  questions: Question[],
  passages: Array<{ id: string; text: string }>,
  sessionId?: string,
): RankifyPaperData {
  setPassageCache(passages);

  return {
    testSessionId: sessionId ?? "",
    testQuestionsData: questions.map(adaptQuestion),
  };
}
