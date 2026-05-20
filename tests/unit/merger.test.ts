import { describe, it, expect } from "vitest";
import { mergeChunks, textSimilarity, findDuplicates } from "../../src/extractors/merger.js";
import type { PartialQuestion, Passage } from "../../src/types.js";

function makeQ(overrides: Partial<PartialQuestion>): PartialQuestion {
  return {
    number: 1,
    numberLabel: null,
    subject: "physics",
    topic: null,
    section: null,
    type: "mcq",
    text: "Test question?",
    textHi: null,
    options: ["A", "B", "C", "D"],
    answer: "0",
    answers: null,
    answerPrecision: null,
    marks: 4,
    negativeMarks: -1,
    passageId: null,
    solution: null,
    solutionFormat: null,
    hasDiagram: false,
    diagrams: null,
    difficulty: null,
    tags: [],
    source: "official-pdf",
    confidence: null,
    ...overrides,
  };
}

describe("mergeChunks", () => {
  it("returns empty for no results", () => {
    const result = mergeChunks([]);
    expect(result.questions).toEqual([]);
    expect(result.passages).toEqual([]);
    expect(result.answerKeyFound).toBe(false);
  });

  it("returns single result as-is", () => {
    const qs = [makeQ({ number: 1 })];
    const result = mergeChunks([
      { chunkIndex: 0, questions: qs, passages: [], answerKeyFound: true },
    ]);
    expect(result.questions).toHaveLength(1);
    expect(result.answerKeyFound).toBe(true);
  });

  it("prefers non-empty answer over empty", () => {
    const hasAnswer = makeQ({ number: 1, answer: "0" });
    const noAnswer = makeQ({ number: 1, answer: "" });

    const result = mergeChunks([
      { chunkIndex: 1, questions: [noAnswer], passages: [], answerKeyFound: true },
      { chunkIndex: 0, questions: [hasAnswer], passages: [], answerKeyFound: true },
    ]);

    expect(result.questions[0].answer).toBe("0");
  });

  it("prefers more complete questions", () => {
    const complete = makeQ({ number: 1, answer: "0", topic: "kinematics", marks: 4 });
    const partial = makeQ({ number: 1, answer: "", topic: "", marks: 0 });

    const result = mergeChunks([
      { chunkIndex: 0, questions: [partial], passages: [], answerKeyFound: true },
      { chunkIndex: 1, questions: [complete], passages: [], answerKeyFound: true },
    ]);

    expect(result.questions[0].topic).toBe("kinematics");
  });

  it("prefers earlier chunk on tie", () => {
    const a = makeQ({ number: 1, answer: "0", options: ["X", "Y"] });
    const b = makeQ({ number: 1, answer: "0", options: ["X", "Y"] });

    const result = mergeChunks([
      { chunkIndex: 1, questions: [b], passages: [], answerKeyFound: true },
      { chunkIndex: 0, questions: [a], passages: [], answerKeyFound: true },
    ]);

    // Both equal on all metrics, earlier chunk wins
    expect(result.questions[0].options).toEqual(["X", "Y"]);
  });

  it("deduplicates passages across chunks", () => {
    const p1: Passage = { id: "passage-1", text: "Text", textHi: null, diagrams: null, questions: [] };
    const p2: Passage = { id: "passage-2", text: "Other", textHi: null, diagrams: null, questions: [] };

    const result = mergeChunks([
      { chunkIndex: 0, questions: [makeQ({ number: 1 })], passages: [p1], answerKeyFound: true },
      { chunkIndex: 1, questions: [makeQ({ number: 2 })], passages: [p1, p2], answerKeyFound: true },
    ]);

    expect(result.passages).toHaveLength(2);
    expect(result.passages.map((p) => p.id).sort()).toEqual(["passage-1", "passage-2"]);
  });
});

describe("textSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(textSimilarity("A particle moves in a circle", "A particle moves in a circle")).toBeCloseTo(1, 2);
  });

  it("returns medium for somewhat similar strings", () => {
    const sim = textSimilarity(
      "A particle moves in a circle of radius R",
      "A particle moves in a circular path of radius R",
    );
    // Shared words: a, particle, moves, in, a, circle/circular, of, radius, R
    expect(sim).toBeGreaterThan(0.4);
  });

  it("returns low for different strings", () => {
    const sim = textSimilarity(
      "What is the atomic number of carbon?",
      "A particle moves in a straight line",
    );
    expect(sim).toBeLessThan(0.3);
  });

  it("returns 0 for empty strings", () => {
    expect(textSimilarity("", "hello")).toBe(0);
    expect(textSimilarity("", "")).toBe(0);
  });
});

describe("findDuplicates", () => {
  it("detects duplicate questions across chunks", () => {
    const commonText = "The value of escape velocity from the surface of a planet depends upon";
    const q1 = makeQ({ number: 1, text: commonText });
    const q2 = makeQ({ number: 7, text: commonText + " the mass and radius of the planet" });

    const result = findDuplicates([
      { chunkIndex: 0, questions: [q1], passages: [], answerKeyFound: true },
      { chunkIndex: 1, questions: [q2], passages: [], answerKeyFound: true },
    ], 0.7);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].similarity).toBeGreaterThan(0.7);
  });

  it("does not flag same-number questions (handled by merge)", () => {
    const q1 = makeQ({ number: 1, text: "A particle moves in a circle" });
    const q2 = makeQ({ number: 1, text: "A particle moves in a circle" });

    const result = findDuplicates([
      { chunkIndex: 0, questions: [q1], passages: [], answerKeyFound: true },
      { chunkIndex: 1, questions: [q2], passages: [], answerKeyFound: true },
    ]);

    expect(result).toHaveLength(0);
  });
});
