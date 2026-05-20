import type { Subject } from "./types.js";

// ---------------------------------------------------------------------------
// TOPIC ALIASES — maps extracted labels to canonical controlled names
// ---------------------------------------------------------------------------
export const topicAliases: Record<string, string> = {
  // PHYSICS
  "kinematics": "kinematics",
  "motion": "kinematics",
  "motion in 1d": "kinematics",
  "motion in 1-d": "kinematics",
  "motion in straight line": "kinematics",
  "motion along straight line": "kinematics",
  "rectilinear motion": "kinematics",
  "newtons laws": "newtons-laws",
  "newton laws": "newtons-laws",
  "newtons law": "newtons-laws",
  "newton law": "newtons-laws",
  "nlm": "newtons-laws",
  "laws of motion": "newtons-laws",
  "law of motion": "newtons-laws",
  "friction": "friction",
  "work energy power": "work-energy-power",
  "work energy": "work-energy-power",
  "work power energy": "work-energy-power",
  "work, energy and power": "work-energy-power",
  "rotational motion": "rotational-motion",
  "rigid body dynamics": "rotational-motion",
  "rotation": "rotational-motion",
  "system of particles": "rotational-motion",
  "system of particles and rotational motion": "rotational-motion",
  "gravitation": "gravitation",
  "gravity": "gravitation",
  "fluid mechanics": "fluid-mechanics",
  "fluids": "fluid-mechanics",
  "mechanical properties of fluids": "fluid-mechanics",
  "properties of matter": "properties-of-matter",
  "elasticity": "properties-of-matter",
  "thermal physics": "thermal-physics",
  "thermodynamics": "thermodynamics",
  "heat": "thermodynamics",
  "thermo": "thermodynamics",
  "kinetic theory": "kinetic-theory",
  "kinetic theory of gases": "kinetic-theory",
  "ktg": "kinetic-theory",
  "oscillations": "oscillations",
  "shm": "oscillations",
  "simple harmonic motion": "oscillations",
  "waves": "waves",
  "wave motion": "waves",
  "electrostatics": "electrostatics",
  "electrostatic": "electrostatics",
  "electric charges and fields": "electrostatics",
  "capacitance": "capacitance",
  "capacitors": "capacitance",
  "current electricity": "current-electricity",
  "electric current": "current-electricity",
  "magnetic effects": "magnetic-effects",
  "magnetism": "magnetic-effects",
  "moving charges and magnetism": "magnetic-effects",
  "magnetic effect of current": "magnetic-effects",
  "electromagnetic induction": "electromagnetic-induction",
  "emi": "electromagnetic-induction",
  "induction": "electromagnetic-induction",
  "alternating current": "alternating-current",
  "ac": "alternating-current",
  "electromagnetic waves": "electromagnetic-waves",
  "em waves": "electromagnetic-waves",
  "emw": "electromagnetic-waves",
  "ray optics": "ray-optics",
  "geometrical optics": "ray-optics",
  "reflection": "ray-optics",
  "refraction": "ray-optics",
  "wave optics": "wave-optics",
  "physical optics": "wave-optics",
  "interference": "wave-optics",
  "diffraction": "wave-optics",
  "polarisation": "wave-optics",
  "polarization": "wave-optics",
  "modern physics": "modern-physics",
  "dual nature": "modern-physics",
  "dual nature of matter": "modern-physics",
  "photoelectric effect": "modern-physics",
  "photoelectric": "modern-physics",
  "atoms": "atoms",
  "atomic physics": "atoms",
  "nuclei": "nuclei",
  "nuclear physics": "nuclei",
  "radioactivity": "nuclei",
  "semiconductors": "semiconductors",
  "semiconductor devices": "semiconductors",
  "logic gates": "semiconductors",
  "electronic devices": "semiconductors",
  "communication": "communication-systems",
  "communication systems": "communication-systems",

  // CHEMISTRY
  "mole concept": "mole-concept",
  "stoichiometry": "mole-concept",
  "basic concepts": "mole-concept",
  "some basic concepts of chemistry": "mole-concept",
  "atomic structure": "atomic-structure",
  "structure of atom": "atomic-structure",
  "classification of elements": "periodic-classification",
  "periodic table": "periodic-classification",
  "periodicity": "periodic-classification",
  "chemical bonding": "chemical-bonding",
  "bonding": "chemical-bonding",
  "molecular structure": "chemical-bonding",
  "states of matter": "states-of-matter",
  "gaseous state": "states-of-matter",
  "gases": "states-of-matter",
  "thermodynamics chemistry": "chemical-thermodynamics",
  "chemical thermodynamics": "chemical-thermodynamics",
  "thermochemistry": "chemical-thermodynamics",
  "equilibrium": "equilibrium",
  "chemical equilibrium": "equilibrium",
  "ionic equilibrium": "equilibrium",
  "redox": "redox-reactions",
  "redox reactions": "redox-reactions",
  "oxidation reduction": "redox-reactions",
  "hydrogen": "hydrogen",
  "s block": "s-block",
  "s-block elements": "s-block",
  "alkali metals": "s-block",
  "alkaline earth metals": "s-block",
  "p block": "p-block",
  "p-block elements": "p-block",
  "organic chemistry": "organic-chemistry",
  "organic": "organic-chemistry",
  "hydrocarbons": "hydrocarbons",
  "alkanes": "hydrocarbons",
  "alkenes": "hydrocarbons",
  "alkynes": "hydrocarbons",
  "environmental chemistry": "environmental-chemistry",
  "solid state": "solid-state",
  "solids": "solid-state",
  "solutions": "solutions",
  "electrochemistry": "electrochemistry",
  "chemical kinetics": "chemical-kinetics",
  "kinetics": "chemical-kinetics",
  "surface chemistry": "surface-chemistry",
  "adsorption": "surface-chemistry",
  "colloids": "surface-chemistry",
  "metallurgy": "metallurgy",
  "general principles of metallurgy": "metallurgy",
  "d block": "d-block",
  "d-block elements": "d-block",
  "coordination compounds": "coordination-compounds",
  "halogen derivatives": "halogen-derivatives",
  "haloalkanes": "halogen-derivatives",
  "haloarenes": "halogen-derivatives",
  "alcohols": "alcohols-phenols-ethers",
  "phenols": "alcohols-phenols-ethers",
  "ethers": "alcohols-phenols-ethers",
  "aldehydes": "aldehydes-ketones",
  "ketones": "aldehydes-ketones",
  "carboxylic acids": "carboxylic-acids",
  "amines": "amines",
  "biomolecules": "biomolecules",
  "carbohydrates": "biomolecules",
  "proteins": "biomolecules",
  "polymers": "polymers",
  "chemistry in everyday life": "chemistry-in-everyday-life",

  // MATHEMATICS
  "sets": "sets",
  "relations": "relations-and-functions",
  "functions": "relations-and-functions",
  "relations and functions": "relations-and-functions",
  "trigonometry": "trigonometry",
  "trigonometric functions": "trigonometry",
  "trigonometric equations": "trigonometry",
  "inverse trigonometry": "inverse-trigonometry",
  "inverse trigonometric functions": "inverse-trigonometry",
  "matrices": "matrices",
  "determinants": "determinants",
  "continuity": "continuity-and-differentiability",
  "differentiability": "continuity-and-differentiability",
  "continuity and differentiability": "continuity-and-differentiability",
  "application of derivatives": "application-of-derivatives",
  "aod": "application-of-derivatives",
  "integrals": "integrals",
  "integration": "integrals",
  "indefinite integrals": "integrals",
  "definite integrals": "integrals",
  "application of integrals": "application-of-integrals",
  "area under curve": "application-of-integrals",
  "differential equations": "differential-equations",
  "de": "differential-equations",
  "vector algebra": "vector-algebra",
  "vectors": "vector-algebra",
  "three dimensional geometry": "three-d-geometry",
  "3d geometry": "three-d-geometry",
  "linear programming": "linear-programming",
  "lp": "linear-programming",
  "probability": "probability",
  "bayes theorem": "probability",
  "binomial theorem": "binomial-theorem",
  "binomial": "binomial-theorem",
  "sequence and series": "sequences-and-series",
  "ap gp": "sequences-and-series",
  "arithmetic progression": "sequences-and-series",
  "geometric progression": "sequences-and-series",
  "complex numbers": "complex-numbers",
  "quadratic equations": "quadratic-equations",
  "permutations": "permutations-and-combinations",
  "combinations": "permutations-and-combinations",
  "permutations and combinations": "permutations-and-combinations",
  "statistics": "statistics",
  "measures of dispersion": "statistics",
  "mathematical reasoning": "mathematical-reasoning",
  "limit": "limits",
  "limits": "limits",

  // BIOLOGY
  "diversity in living world": "diversity-in-living-world",
  "classification": "diversity-in-living-world",
  "plant kingdom": "plant-kingdom",
  "animal kingdom": "animal-kingdom",
  "morphology of flowering plants": "morphology-of-flowering-plants",
  "anatomy of flowering plants": "anatomy-of-flowering-plants",
  "cell": "cell-biology",
  "cell biology": "cell-biology",
  "cell cycle": "cell-biology",
  "cell division": "cell-biology",
  "biomolecules biology": "biomolecules-biology",
  "enzymes": "biomolecules-biology",
  "plant physiology": "plant-physiology",
  "photosynthesis": "plant-physiology",
  "respiration in plants": "plant-physiology",
  "plant growth": "plant-physiology",
  "human physiology": "human-physiology",
  "digestion": "human-physiology",
  "circulation": "human-physiology",
  "excretion": "human-physiology",
  "locomotion": "human-physiology",
  "neural control": "human-physiology",
  "chemical coordination": "human-physiology",
  "reproduction": "reproduction",
  "reproduction in organisms": "reproduction",
  "sexual reproduction": "reproduction",
  "genetics": "genetics",
  "mendelian genetics": "genetics",
  "molecular genetics": "genetics",
  "dna": "genetics",
  "evolution": "evolution",
  "human health": "human-health-and-disease",
  "diseases": "human-health-and-disease",
  "immunity": "human-health-and-disease",
  "biotechnology": "biotechnology",
  "biotech": "biotechnology",
  "genetic engineering": "biotechnology",
  "ecology": "ecology",
  "ecosystem": "ecology",
  "biodiversity": "ecology",
  "environment": "ecology",
};

// ---------------------------------------------------------------------------
// CONTROLLED TAG LISTS by subject
// ---------------------------------------------------------------------------
export const physicsTags: string[] = [
  "kinematics", "newtons-laws", "friction", "work-energy-power",
  "rotational-motion", "gravitation", "fluid-mechanics", "properties-of-matter",
  "thermal-physics", "thermodynamics", "kinetic-theory", "oscillations",
  "waves", "electrostatics", "capacitance", "current-electricity",
  "magnetic-effects", "electromagnetic-induction", "alternating-current",
  "electromagnetic-waves", "ray-optics", "wave-optics", "modern-physics",
  "atoms", "nuclei", "semiconductors", "communication-systems",
  "experimental-physics", "units-and-dimensions", "vectors",
  "error-analysis", "measurement",
];

export const chemistryTags: string[] = [
  "mole-concept", "atomic-structure", "periodic-classification",
  "chemical-bonding", "states-of-matter", "chemical-thermodynamics",
  "equilibrium", "redox-reactions", "hydrogen", "s-block",
  "p-block", "organic-chemistry", "hydrocarbons", "environmental-chemistry",
  "solid-state", "solutions", "electrochemistry", "chemical-kinetics",
  "surface-chemistry", "metallurgy", "d-block", "coordination-compounds",
  "halogen-derivatives", "alcohols-phenols-ethers", "aldehydes-ketones",
  "carboxylic-acids", "amines", "biomolecules", "polymers",
  "chemistry-in-everyday-life", "analytical-chemistry",
  "nuclear-chemistry", "green-chemistry",
];

export const mathematicsTags: string[] = [
  "sets", "relations-and-functions", "trigonometry", "inverse-trigonometry",
  "matrices", "determinants", "continuity-and-differentiability",
  "application-of-derivatives", "integrals", "application-of-integrals",
  "differential-equations", "vector-algebra", "three-d-geometry",
  "linear-programming", "probability", "binomial-theorem",
  "sequences-and-series", "complex-numbers", "quadratic-equations",
  "permutations-and-combinations", "statistics", "mathematical-reasoning",
  "limits", "number-theory", "graph-theory", "inequalities",
  "logarithms", "modulus-function", "greatest-integer-function",
];

export const biologyTags: string[] = [
  "diversity-in-living-world", "plant-kingdom", "animal-kingdom",
  "morphology-of-flowering-plants", "anatomy-of-flowering-plants",
  "cell-biology", "biomolecules-biology", "plant-physiology",
  "human-physiology", "reproduction", "genetics", "evolution",
  "human-health-and-disease", "biotechnology", "ecology",
  "microbiology", "immunology", "bioinformatics",
];

// ---------------------------------------------------------------------------
// SUBJECT VOCABULARY MAP
// ---------------------------------------------------------------------------
export const subjectTags: Record<Subject, string[]> = {
  physics: physicsTags,
  chemistry: chemistryTags,
  mathematics: mathematicsTags,
  biology: biologyTags,
};

export const subjectCodes: Record<Subject, string> = {
  physics: "ph",
  chemistry: "ch",
  mathematics: "ma",
  biology: "bi",
};

export const codeToSubject: Record<string, Subject> = {
  ph: "physics",
  ch: "chemistry",
  ma: "mathematics",
  bi: "biology",
};

// ---------------------------------------------------------------------------
// FUZZY MATCHING
// ---------------------------------------------------------------------------

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bn; j++) {
    matrix[0][j] = j;
  }

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
 * 1. Exact match (fast path)
 * 2. Fuzzy match (Levenshtein distance <= 2)
 * 3. Fallback to raw string
 */
export function normalizeTopic(raw: string): string {
  const key = raw.trim().toLowerCase();

  // 1. Exact match
  const exact = topicAliases[key];
  if (exact) return exact;

  // 2. Fuzzy match (Levenshtein distance <= 2)
  for (const [alias, canonical] of Object.entries(topicAliases)) {
    if (levenshtein(key, alias) <= 2) {
      return canonical;
    }
  }

  // 3. Fallback
  return key;
}

export function isValidTag(subject: Subject, tag: string): boolean {
  const t = tag.toLowerCase();
  return subjectTags[subject]?.includes(t) ?? false;
}

export function getSubjectTags(subject: Subject): string[] {
  return subjectTags[subject] ?? [];
}
