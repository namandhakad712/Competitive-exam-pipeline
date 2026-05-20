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

export function normalizeQuestionTopic(
  rawTopic: string | null | undefined,
  subject: Subject,
): string {
  if (!rawTopic || rawTopic.trim().length === 0) {
    return SUBJECT_DEFAULT_TOPICS[subject];
  }

  const normalized = normalizeFromVocab(rawTopic);

  if (normalized !== rawTopic.trim().toLowerCase()) {
    return normalized;
  }

  const knownTopics = SUBJECT_TAGS[subject];
  if (knownTopics.includes(normalized)) {
    return normalized;
  }

  return SUBJECT_DEFAULT_TOPICS[subject];
}

export function normalizeTopics(
  questions: Array<{ topic: string; subject: Subject }>,
): void {
  for (const q of questions) {
    q.topic = normalizeQuestionTopic(q.topic, q.subject);
  }
}
