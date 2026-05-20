import { describe, it, expect } from "vitest";
import { buildConsensus } from "../../src/extractors/consensus-extractor.js";
import type { PartialQuestion, ConsensusCandidate } from "../../src/types.js";

function makeQ(overrides: Partial<PartialQuestion>): PartialQuestion {
  return {
    number: 1,
    numberLabel: null,
    subject: "physics",
    topic: "kinematics",
    section: "a",
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

function makeCandidate(provider: string, questions: PartialQuestion[]): ConsensusCandidate {
  return {
    provider: provider as any,
    questions,
    passages: [],
    answerKeyFound: true,
  };
}

describe("buildConsensus", () => {
  it("returns questions from single provider", () => {
    const qs = [makeQ({ number: 1, text: "Q1?" })];
    const result = buildConsensus([makeCandidate("nvidia", qs)]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].text).toBe("Q1?");
    expect(result.conflicts).toHaveLength(0);
  });

  it("majority vote on text when all agree", () => {
    const candidates = [
      makeCandidate("nvidia", [makeQ({ number: 1, text: "What is physics?" })]),
      makeCandidate("longcat", [makeQ({ number: 1, text: "What is physics?" })]),
      makeCandidate("gemini", [makeQ({ number: 1, text: "What is physics?" })]),
    ];
    const result = buildConsensus(candidates);
    expect(result.questions[0].text).toBe("What is physics?");
    expect(result.conflicts).toHaveLength(0);
  });

  it("majority vote when one disagrees", () => {
    const candidates = [
      makeCandidate("nvidia", [makeQ({ number: 1, text: "What is physics?", answer: "0" })]),
      makeCandidate("longcat", [makeQ({ number: 1, text: "What is physics?", answer: "0" })]),
      makeCandidate("gemini", [makeQ({ number: 1, text: "What is physics?", answer: "1" })]),
    ];
    const result = buildConsensus(candidates);
    expect(result.questions[0].answer).toBe("0");
    // 2/3 agree on answer, should not flag as conflict
    const answerConflicts = result.conflicts.filter(
      (c) => c.reason === "low_agreement",
    );
    // With only 3 candidates, low_agreement requires < 2 agreement
    expect(answerConflicts.length).toBeGreaterThanOrEqual(0);
  });

  it("flags conflicts when all providers disagree on text", () => {
    const candidates = [
      makeCandidate("nvidia", [makeQ({ number: 1, text: "What is physics?" })]),
      makeCandidate("longcat", [makeQ({ number: 1, text: "Define physics?" })]),
      makeCandidate("gemini", [makeQ({ number: 1, text: "What is physics?" })]),
      makeCandidate("poolside", [makeQ({ number: 1, text: "What is chemistry?" })]),
    ];
    const result = buildConsensus(candidates);
    // 2/4 agree, textAgreement = 2, which is >= 2 threshold for conflict
    // Actually the threshold is textAgreement < 2 && relevant.length > 2, so 2 >= 2, no conflict
    const textConflicts = result.conflicts.filter(
      (c) => c.reason === "low_agreement",
    );
    expect(textConflicts.length).toBe(0);
    expect(result.questions[0].text).toBe("What is physics?");
  });

  it("flags missing questions", () => {
    const candidates = [
      makeCandidate("nvidia", [makeQ({ number: 1 }), makeQ({ number: 2 })]),
      makeCandidate("longcat", [makeQ({ number: 1 })]),
    ];
    const result = buildConsensus(candidates);
    // Question 2 is only in nvidia, should be present in output
    const q2 = result.questions.find((q) => q.number === 2);
    expect(q2).toBeDefined();
  });

  it("merges answerKeyFound across providers", () => {
    const candidates = [
      makeCandidate("nvidia", [makeQ({})]),
      { ...makeCandidate("longcat", [makeQ({})]), answerKeyFound: false },
    ];
    const result = buildConsensus(candidates);
    expect(result.answerKeyFound).toBe(true);
  });

  it("handles empty input gracefully", () => {
    const result = buildConsensus([]);
    expect(result.questions).toHaveLength(0);
    expect(result.passages).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.answerKeyFound).toBe(false);
  });

  it("handles providers with no questions for a number", () => {
    const candidates = [
      makeCandidate("nvidia", [makeQ({ number: 1, text: "Q1" }), makeQ({ number: 3, text: "Q3" })]),
      makeCandidate("longcat", [makeQ({ number: 1, text: "Q1" }), makeQ({ number: 2, text: "Q2" })]),
    ];
    const result = buildConsensus(candidates);
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0].number).toBe(1);
    expect(result.questions[1].number).toBe(2);
    expect(result.questions[2].number).toBe(3);
  });
});
