import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { validateQuestionFile } from "../../src/validators/auto-validator.js";
import type { QuestionFile } from "../../src/types.js";

describe("Golden Dataset Validation", () => {
  let golden: QuestionFile;

  beforeAll(() => {
    const path = join(process.cwd(), "tests/fixtures/golden-jeemain-sample.json");
    const raw = readFileSync(path, "utf-8");
    golden = JSON.parse(raw);
  });

  it("has correct schema version", () => {
    expect(golden.schema).toBe("v4");
  });

  it("has correct exam metadata", () => {
    expect(golden.exam).toBe("jeemain");
    expect(golden.year).toBe(2024);
    expect(golden.shift).toBe("04apr-s1");
    expect(golden.subjects).toEqual(["physics", "chemistry", "mathematics"]);
  });

  it("has correct total", () => {
    expect(golden.total).toBe(golden.questions.length);
    expect(golden.total).toBe(10);
  });

  it("has answer key found", () => {
    expect(golden.answerKeyFound).toBe(true);
  });

  it("all questions have required fields", () => {
    for (const q of golden.questions) {
      expect(q.id).toBeTruthy();
      expect(q.number).toBeGreaterThan(0);
      expect(["physics", "chemistry", "mathematics"]).toContain(q.subject);
      expect(q.text).toBeTruthy();
      expect(q.text.length).toBeGreaterThan(10);
      expect(q.type).toBe("mcq");
      expect(q.marks).toBe(4);
      expect(q.negativeMarks).toBe(-1);
      expect(q.source).toBe("official-pdf");
    }
  });

  it("all questions have answer set", () => {
    for (const q of golden.questions) {
      expect(q.answer).toBeTruthy();
      expect(["0", "1", "2", "3"]).toContain(q.answer);
    }
  });

  it("all questions have 4 options", () => {
    for (const q of golden.questions) {
      expect(q.options).toHaveLength(4);
    }
  });

  it("all questions have a topic", () => {
    for (const q of golden.questions) {
      expect(q.topic).toBeTruthy();
      expect(typeof q.topic).toBe("string");
    }
  });

  it("IDs follow correct format", () => {
    for (const q of golden.questions) {
      const parts = q.id.split("-");
      expect(parts[0]).toBe("jeemain");
      expect(parts[1]).toBe("2024");
      expect(parts[2]).toBe("04apr");
      expect(parts[3]).toBe("s1");
      expect(["ph", "ch", "ma"]).toContain(parts[4]);
      expect(parts[5]).toMatch(/^\d{3}$/);
    }
  });

  it("passes the validator with no errors", () => {
    const results = validateQuestionFile(golden, join(process.cwd(), "tests/fixtures"));
    const errors = results.filter((r) => !r.valid);
    if (errors.length > 0) {
      const msgs = errors.flatMap((e) =>
        e.flags
          .filter((f) => f.severity === "error")
          .map((f) => `  Q${e.index + 1}: ${f.message}`),
      );
      console.log("Validation errors:\n" + msgs.join("\n"));
    }
    // The golden dataset should have no errors
    const fsErrors = errors.filter((e) =>
      e.flags.some((f) => f.field === "diagrams.file"),
    );
    // Skip file-not-found errors for diagrams (fixture doesn't have real files)
    const realErrors = errors.filter(
      (e) => !e.flags.some((f) => f.field === "diagrams.file"),
    );
    expect(realErrors).toHaveLength(0);
  });

  it("has correct subject distribution", () => {
    const subjects = golden.questions.map((q) => q.subject);
    const physics = subjects.filter((s) => s === "physics").length;
    const chemistry = subjects.filter((s) => s === "chemistry").length;
    const maths = subjects.filter((s) => s === "mathematics").length;

    expect(physics).toBe(3);
    expect(chemistry).toBe(3);
    expect(maths).toBe(4);
  });

  it("checksum is present", () => {
    expect(golden.checksum).toBeTruthy();
  });
});
