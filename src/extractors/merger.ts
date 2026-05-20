import { logger } from "../utils/logger.js";
import type { PartialQuestion, Passage, ProviderName } from "../types.js";

export interface ChunkResult {
  chunkIndex: number;
  questions: PartialQuestion[];
  passages: Passage[];
  answerKeyFound: boolean;
}

// Provider reliability ranking (higher = more trustworthy)
const PROVIDER_RANK: Record<string, number> = {
  nvidia: 5,
  longcat: 4,
  gemini: 3,
  poolside: 2,
  vanchin: 1,
  cerebras: 0,
};

// Required fields for a question to be considered "complete"
const REQUIRED_FIELDS: (keyof PartialQuestion)[] = [
  "text",
  "subject",
  "type",
];

/**
 * Merges extraction results from multiple overlapping chunks.
 *
 * Dedup strategy (in order of preference):
 * 1. Completeness score (more filled fields = better)
 * 2. Non-empty answer beats empty answer
 * 3. More complete options beats shorter
 * 4. Provider reliability ranking
 * 5. Earlier chunk index beats later
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
    return {
      questions: r.questions,
      passages: r.passages,
      answerKeyFound: r.answerKeyFound,
    };
  }

  // ---- Merge questions ----
  const bestByNumber = new Map<
    number,
    { question: PartialQuestion; chunkIndex: number }
  >();

  for (const result of results) {
    for (const q of result.questions) {
      const existing = bestByNumber.get(q.number);

      if (!existing) {
        bestByNumber.set(q.number, {
          question: q,
          chunkIndex: result.chunkIndex,
        });
        continue;
      }

      const keep = pickBetter(
        q,
        result.chunkIndex,
        existing.question,
        existing.chunkIndex,
      );
      if (keep === "new") {
        bestByNumber.set(q.number, {
          question: q,
          chunkIndex: result.chunkIndex,
        });
      }
    }
  }

  const questions = [...bestByNumber.values()]
    .sort((a, b) => a.question.number - b.question.number)
    .map((v) => v.question);

  // ---- Merge passages ----
  const seenPassages = new Set<string>();
  const passages: Passage[] = [];

  const sortedResults = [...results].sort(
    (a, b) => a.chunkIndex - b.chunkIndex,
  );
  for (const result of sortedResults) {
    for (const p of result.passages) {
      if (!seenPassages.has(p.id)) {
        seenPassages.add(p.id);
        passages.push(p);
      }
    }
  }

  const answerKeyFound = results.some((r) => r.answerKeyFound);

  logger.info(
    `Merge: ${results.length} chunks → ${questions.length} unique questions (${results.reduce((s, r) => s + r.questions.length, 0)} raw), ${passages.length} passages`,
  );

  return { questions, passages, answerKeyFound };
}

function computeCompleteness(q: PartialQuestion): number {
  let score = 0;

  // Required fields present
  for (const field of REQUIRED_FIELDS) {
    const val = q[field];
    if (val !== null && val !== undefined && val !== "") {
      score += 2;
    }
  }

  // Answer present
  if (q.answer && q.answer !== "") {
    score += 3;
  }

  // Options present (for MCQ/MSQ types)
  if (q.options && q.options.length >= 3) {
    score += 2;
  }

  // Topic present
  if (q.topic && q.topic !== "") {
    score += 1;
  }

  // Section present
  if (q.section && q.section !== "") {
    score += 1;
  }

  // Marks valid
  if (typeof q.marks === "number" && q.marks > 0) {
    score += 1;
  }

  return score;
}

function pickBetter(
  a: PartialQuestion,
  aChunk: number,
  b: PartialQuestion,
  bChunk: number,
): "new" | "existing" {
  // Rule 1: Completeness score
  const aComplete = computeCompleteness(a);
  const bComplete = computeCompleteness(b);

  if (aComplete > bComplete + 1) return "new";
  if (bComplete > aComplete + 1) return "existing";

  // Rule 2: Non-empty answer beats empty
  const aHasAnswer = a.answer && a.answer !== "";
  const bHasAnswer = b.answer && b.answer !== "";
  if (aHasAnswer && !bHasAnswer) return "new";
  if (!aHasAnswer && bHasAnswer) return "existing";

  // Rule 3: More complete options (longer JSON) beats shorter
  const aOptLen = a.options ? JSON.stringify(a.options).length : 0;
  const bOptLen = b.options ? JSON.stringify(b.options).length : 0;
  if (aOptLen > bOptLen + 5) return "new";
  if (bOptLen > aOptLen + 5) return "existing";

  // Rule 4: Prefer non-null topic
  const aHasTopic = a.topic != null && a.topic !== "";
  const bHasTopic = b.topic != null && b.topic !== "";
  if (aHasTopic && !bHasTopic) return "new";
  if (!aHasTopic && bHasTopic) return "existing";

  // Rule 5: Earlier chunk index beats later (tiebreaker)
  return aChunk <= bChunk ? "new" : "existing";
}

/**
 * Text similarity check for deduplication.
 * Uses simple Jaccard similarity on word sets.
 * When real embedding API is available, replace with cosine similarity.
 */
export function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a.toLowerCase().split(/\W+/).filter((w) => w.length > 2),
  );
  const wordsB = new Set(
    b.toLowerCase().split(/\W+/).filter((w) => w.length > 2),
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]);
  return intersection / union.size;
}

/**
 * Detect duplicate questions across chunks using text similarity.
 * Returns question numbers that are likely duplicates.
 */
export function findDuplicates(
  results: ChunkResult[],
  threshold = 0.8,
): Array<{ numberA: number; numberB: number; similarity: number }> {
  const duplicates: Array<{
    numberA: number;
    numberB: number;
    similarity: number;
  }> = [];
  const allQuestions = results.flatMap((r) => r.questions);

  for (let i = 0; i < allQuestions.length; i++) {
    for (let j = i + 1; j < allQuestions.length; j++) {
      const a = allQuestions[i];
      const b = allQuestions[j];
      if (a.number === b.number) continue; // already handled by merge

      const sim = textSimilarity(a.text, b.text);
      if (sim >= threshold) {
        duplicates.push({
          numberA: a.number,
          numberB: b.number,
          similarity: sim,
        });
      }
    }
  }

  return duplicates;
}
