import { normalizeTopic as normalizeFromVocab, physicsTags, chemistryTags, mathematicsTags, biologyTags } from "../vocabulary.js";
import type { Subject } from "../types.js";

const SUBJECT_DEFAULT_TOPICS: Record<Subject, string> = {
  physics: "general-physics",
  chemistry: "general-chemistry",
  mathematics: "general-mathematics",
  biology: "general-biology",
};

const SUBJECT_TAGS: Record<Subject, string[]> = {
  physics: physicsTags,
  chemistry: chemistryTags,
  mathematics: mathematicsTags,
  biology: biologyTags,
};

/**
 * Levenshtein distance for fuzzy matching against known topics
 */
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= an; i++) matrix[i] = [i];
  for (let j = 0; j <= bn; j++) matrix[0][j] = j;

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[an][bn];
}

/**
 * Normalize a topic using:
 * 1. Vocabulary alias lookup (with fuzzy matching)
 * 2. Fuzzy matching against known subject-specific topics
 * 3. Subject-appropriate default
 */
export function normalizeQuestionTopic(
  rawTopic: string | null | undefined,
  subject: Subject,
): string {
  if (!rawTopic || rawTopic.trim().length === 0) {
    return SUBJECT_DEFAULT_TOPICS[subject];
  }

  // 1. Use vocabulary normalization (exact + fuzzy)
  const normalized = normalizeFromVocab(rawTopic);

  if (normalized !== rawTopic.trim().toLowerCase()) {
    return normalized;
  }

  // 2. Check against known topics
  const knownTopics = SUBJECT_TAGS[subject];
  if (knownTopics.includes(normalized)) {
    return normalized;
  }

  // 3. Fuzzy match against known topics
  const key = normalized;
  for (const known of knownTopics) {
    if (levenshtein(key, known) <= 2) {
      return known;
    }
  }

  // 4. Fallback to subject default
  return SUBJECT_DEFAULT_TOPICS[subject];
}

export function normalizeTopics(
  questions: Array<{ topic: string; subject: Subject }>,
): void {
  for (const q of questions) {
    q.topic = normalizeQuestionTopic(q.topic, q.subject);
  }
}
