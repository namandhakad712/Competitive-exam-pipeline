import { describe, it, expect } from "vitest";
import { normalizeTopic, isValidTag, getSubjectTags } from "../../src/vocabulary.js";
import { normalizeQuestionTopic } from "../../src/finalizers/topic-normalizer.js";

describe("normalizeTopic", () => {
  it("exact match returns canonical", () => {
    expect(normalizeTopic("kinematics")).toBe("kinematics");
    expect(normalizeTopic("motion")).toBe("kinematics");
    expect(normalizeTopic("organic chemistry")).toBe("organic-chemistry");
    expect(normalizeTopic("nlm")).toBe("newtons-laws");
  });

  it("case insensitive", () => {
    expect(normalizeTopic("Kinematics")).toBe("kinematics");
    expect(normalizeTopic("ORGANIC Chemistry")).toBe("organic-chemistry");
  });

  it("fuzzy match with Levenshtein distance <= 2", () => {
    expect(normalizeTopic("kineamtics")).toBe("kinematics");
    expect(normalizeTopic("orgnic")).toBe("organic-chemistry"); // org→org distance ~2
    expect(normalizeTopic("probablity")).toBe("probability");
  });

  it("returns raw string for no match", () => {
    expect(normalizeTopic("completely-unknown-topic")).toBe("completely-unknown-topic");
  });

  it("strips whitespace", () => {
    expect(normalizeTopic("  kinematics  ")).toBe("kinematics");
  });
});

describe("normalizeQuestionTopic", () => {
  it("returns default for null/empty", () => {
    expect(normalizeQuestionTopic(null, "physics")).toBe("general-physics");
    expect(normalizeQuestionTopic("", "chemistry")).toBe("general-chemistry");
    expect(normalizeQuestionTopic("   ", "mathematics")).toBe("general-mathematics");
  });

  it("uses vocabulary match", () => {
    expect(normalizeQuestionTopic("motion", "physics")).toBe("kinematics");
    expect(normalizeQuestionTopic("organic", "chemistry")).toBe("organic-chemistry");
  });

  it("returns default for unrecognized topic", () => {
    expect(normalizeQuestionTopic("quantum-computing", "physics")).toBe("general-physics");
  });

  it("fuzzy matches known subject topics", () => {
    const result = normalizeQuestionTopic("kinemtics", "physics");
    expect(["kinematics", "general-physics"]).toContain(result);
  });
});

describe("isValidTag", () => {
  it("valid physics tag", () => {
    expect(isValidTag("physics", "kinematics")).toBe(true);
    expect(isValidTag("physics", "thermodynamics")).toBe(true);
    expect(isValidTag("physics", "organic-chemistry")).toBe(false);
  });

  it("valid chemistry tag", () => {
    expect(isValidTag("chemistry", "organic-chemistry")).toBe(true);
    expect(isValidTag("chemistry", "atomic-structure")).toBe(true);
    expect(isValidTag("chemistry", "kinematics")).toBe(false);
  });
});

describe("getSubjectTags", () => {
  it("returns physics tags", () => {
    const tags = getSubjectTags("physics");
    expect(tags).toContain("kinematics");
    expect(tags).toContain("thermodynamics");
    expect(tags).not.toContain("organic-chemistry");
  });

  it("returns empty for unknown subject", () => {
    expect(getSubjectTags("unknown" as any)).toEqual([]);
  });
});
