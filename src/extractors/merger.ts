import { logger } from "../utils/logger.js";
import type { PartialQuestion, Passage } from "../types.js";

export interface ChunkResult {
  chunkIndex: number;
  questions: PartialQuestion[];
  passages: Passage[];
  answerKeyFound: boolean;
}

/**
 * Merges extraction results from multiple overlapping chunks.
 *
 * Dedup strategy (in order of preference):
 * 1. Non-empty answer beats empty answer
 * 2. More complete options (longer options JSON) beats shorter
 * 3. Earlier chunk index beats later
 */
export function mergeChunks(results: ChunkResult[]): {
  questions: PartialQuestion[];
  passages: Passage[];
  answerKeyFound: boolean;
} {
  if (results.length === 0) {
    return { questions: [], passages: [], answerKeyFound: false };
  }

  if (results.length === 1) {
    const r = results[0];
    return { questions: r.questions, passages: r.passages, answerKeyFound: r.answerKeyFound };
  }

  // ---- Merge questions ----
  const bestByNumber = new Map<number, { question: PartialQuestion; chunkIndex: number }>();

  for (const result of results) {
    for (const q of result.questions) {
      const existing = bestByNumber.get(q.number);

      if (!existing) {
        bestByNumber.set(q.number, { question: q, chunkIndex: result.chunkIndex });
        continue;
      }

      const keep = pickBetter(q, result.chunkIndex, existing.question, existing.chunkIndex);
      if (keep === "new") {
        bestByNumber.set(q.number, { question: q, chunkIndex: result.chunkIndex });
      }
      // else keep existing
    }
  }

  const questions = [...bestByNumber.values()]
    .sort((a, b) => a.question.number - b.question.number)
    .map(v => v.question);

  // ---- Merge passages ----
  const seenPassages = new Set<string>();
  const passages: Passage[] = [];

  // Sort results by chunk index so earlier chunks' passages take priority
  const sortedResults = [...results].sort((a, b) => a.chunkIndex - b.chunkIndex);
  for (const result of sortedResults) {
    for (const p of result.passages) {
      if (!seenPassages.has(p.id)) {
        seenPassages.add(p.id);
        passages.push(p);
      }
    }
  }

  const answerKeyFound = results.some(r => r.answerKeyFound);

  logger.info(
    `Merge: ${results.length} chunks → ${questions.length} unique questions (${results.reduce((s, r) => s + r.questions.length, 0)} raw), ${passages.length} passages`
  );

  return { questions, passages, answerKeyFound };
}

function pickBetter(
  a: PartialQuestion,
  aChunk: number,
  b: PartialQuestion,
  bChunk: number,
): "new" | "existing" {
  // Rule 1: Non-empty answer beats empty
  const aHasAnswer = a.answer && a.answer !== "";
  const bHasAnswer = b.answer && b.answer !== "";
  if (aHasAnswer && !bHasAnswer) return "new";
  if (!aHasAnswer && bHasAnswer) return "existing";

  // Rule 2: More complete options (longer JSON) beats shorter
  const aOptLen = a.options ? JSON.stringify(a.options).length : 0;
  const bOptLen = b.options ? JSON.stringify(b.options).length : 0;
  if (aOptLen > bOptLen) return "new";
  if (bOptLen > aOptLen) return "existing";

  // Rule 3: Prefer non-null topic
  const aHasTopic = a.topic != null && a.topic !== "";
  const bHasTopic = b.topic != null && b.topic !== "";
  if (aHasTopic && !bHasTopic) return "new";
  if (!aHasTopic && bHasTopic) return "existing";

  // Rule 4: Earlier chunk index beats later
  return aChunk <= bChunk ? "new" : "existing";
}
