import { describe, it, expect } from "vitest";
import { validateExtraction, repairOptions } from "../../src/extractors/auto-repair.js";
import type { PartialQuestion } from "../../src/types.js";

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

describe("validateExtraction", () => {
  it("returns no errors for valid questions", () => {
    const qs = [makeQ({})];
    const errors = validateExtraction(qs, "jeemain");
    // Just one question vs expected 90 — should flag wrong count
    const countErrors = errors.filter((e) => e.type === "wrong_question_count");
    expect(countErrors).toHaveLength(1);
  });

  it("flags missing answers", () => {
    const qs = [makeQ({ answer: "" }), makeQ({ number: 2, answer: "" })];
    const errors = validateExtraction(qs, "neet");
    const missing = errors.filter((e) => e.type === "missing_answer");
    expect(missing).toHaveLength(2);
  });

  it("flags invalid option counts", () => {
    const qs = [makeQ({ options: ["A", "B"] })];
    const errors = validateExtraction(qs, "jeemain");
    const invalid = errors.filter((e) => e.type === "invalid_option_count");
    expect(invalid).toHaveLength(1);
  });

  it("flags empty question text", () => {
    const qs = [makeQ({ text: "  " })];
    const errors = validateExtraction(qs, "jeemain");
    const missing = errors.filter((e) => e.type === "missing_field");
    expect(missing).toHaveLength(1);
  });

  it("flags wrong question count for JEE Main", () => {
    const qs = Array.from({ length: 5 }, (_, i) => makeQ({ number: i + 1 }));
    const errors = validateExtraction(qs, "jeemain");
    const countErrors = errors.filter((e) => e.type === "wrong_question_count");
    expect(countErrors).toHaveLength(1);
  });
});

describe("repairOptions", () => {
  it("returns options as-is if already correct", () => {
    const result = repairOptions("Test?", ["A", "B", "C", "D"]);
    expect(result).toEqual(["A", "B", "C", "D"]);
  });

  it("splits merged options on common patterns", () => {
    const merged = ["(1) 2 m/s  (2) 4 m/s  (3) 6 m/s  (4) 8 m/s"];
    const result = repairOptions("A particle moves...", merged);
    expect(result.length).toBeGreaterThan(merged.length);
  });

  it("does not over-split short strings", () => {
    const result = repairOptions("Test?", ["A", "B", "C", "D"]);
    expect(result.length).toBe(4);
  });
});
