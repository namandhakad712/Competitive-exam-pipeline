const LATEX_MAP: Record<string, string> = {
  "\\alpha": "\u03B1",
  "\\beta": "\u03B2",
  "\\gamma": "\u03B3",
  "\\delta": "\u03B4",
  "\\epsilon": "\u03B5",
  "\\zeta": "\u03B6",
  "\\eta": "\u03B7",
  "\\theta": "\u03B8",
  "\\iota": "\u03B9",
  "\\kappa": "\u03BA",
  "\\lambda": "\u03BB",
  "\\mu": "\u03BC",
  "\\nu": "\u03BD",
  "\\xi": "\u03BE",
  "\\omicron": "\u03BF",
  "\\pi": "\u03C0",
  "\\rho": "\u03C1",
  "\\sigma": "\u03C3",
  "\\tau": "\u03C4",
  "\\upsilon": "\u03C5",
  "\\phi": "\u03C6",
  "\\chi": "\u03C7",
  "\\psi": "\u03C8",
  "\\omega": "\u03C9",
  "\\Delta": "\u0394",
  "\\Theta": "\u0398",
  "\\Lambda": "\u039B",
  "\\Pi": "\u03A0",
  "\\Sigma": "\u03A3",
  "\\Phi": "\u03A6",
  "\\Omega": "\u03A9",
  "\\rightarrow": "\u2192",
  "\\leftarrow": "\u2190",
  "\\Rightarrow": "\u21D2",
  "\\Leftarrow": "\u21D0",
  "\\infty": "\u221E",
  "\\partial": "\u2202",
  "\\nabla": "\u2207",
  "\\sqrt": "\u221A",
  "\\int": "\u222B",
  "\\sum": "\u2211",
  "\\prod": "\u220F",
  "\\times": "\u00D7",
  "\\div": "\u00F7",
  "\\pm": "\u00B1",
  "\\mp": "\u2213",
  "\\cdot": "\u00B7",
  "\\neq": "\u2260",
  "\\leq": "\u2264",
  "\\geq": "\u2265",
  "\\approx": "\u2248",
  "\\equiv": "\u2261",
  "\\propto": "\u221D",
  "\\emptyset": "\u2205",
  "\\subset": "\u2282",
  "\\supset": "\u2283",
  "\\subseteq": "\u2286",
  "\\supseteq": "\u2287",
  "\\cup": "\u222A",
  "\\cap": "\u2229",
  "\\in": "\u2208",
  "\\notin": "\u2209",
  "\\angle": "\u2220",
  "\\perp": "\u22A5",
  "\\degree": "\u00B0",
  "\\^": "^",
  "\\_": "_",
};

const LATEX_PATTERNS: Array<{ pattern: RegExp; replace: (match: string, ...groups: string[]) => string }> = [
  { pattern: /\\frac\{([^}]+)\}\{([^}]+)\}/g, replace: (_, a, b) => `${a}/${b}` },
  { pattern: /\\sqrt\{([^}]+)\}/g, replace: (_, a) => `\u221A(${a})` },
  { pattern: /\^\{([^}]+)\}/g, replace: (_, a) => `^(${a})` },
  { pattern: /\{([^}]+)\}/g, replace: (_, a) => a },
  { pattern: /\\text\{([^}]+)\}/g, replace: (_, a) => a },
  { pattern: /\\mathrm\{([^}]+)\}/g, replace: (_, a) => a },
  { pattern: /\\textbf\{([^}]+)\}/g, replace: (_, a) => a },
  { pattern: /\\textit\{([^}]+)\}/g, replace: (_, a) => a },
];

const OCR_FIXES: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /ﬁ/g, replace: "fi" },
  { pattern: /ﬂ/g, replace: "fl" },
  { pattern: /ﬀ/g, replace: "ff" },
  { pattern: /ﬃ/g, replace: "ffi" },
  { pattern: /ﬄ/g, replace: "ffl" },
  { pattern: /—/g, replace: " - " },
  { pattern: /–/g, replace: "-" },
  { pattern: /"/g, replace: '"' },
  { pattern: /"/g, replace: '"' },
  { pattern: /'/g, replace: "'" },
  { pattern: /'/g, replace: "'" },
  { pattern: /\r\n/g, replace: "\n" },
  { pattern: /\r/g, replace: "\n" },
  { pattern: /[ \t]+/g, replace: " " },
  { pattern: /\n{3,}/g, replace: "\n\n" },
];

export function normalizeLatex(text: string): string {
  if (!text) return text;

  let result = text;

  for (const fix of OCR_FIXES) {
    result = result.replace(fix.pattern, fix.replace);
  }

  for (const [latex, unicode] of Object.entries(LATEX_MAP)) {
    result = result.replace(new RegExp(latex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), unicode);
  }

  for (const pat of LATEX_PATTERNS) {
    result = result.replace(pat.pattern, pat.replace as unknown as string);
  }

  result = result.replace(/\\([a-zA-Z]+)/g, (match) => {
    const known = LATEX_MAP[match];
    return known ?? match;
  });

  result = result.trim();
  return result;
}

export function normalizeText(text: string | null): string | null {
  if (text === null || text === undefined) return null;
  return normalizeLatex(text);
}

export function normalizeTexts(
  questions: Array<{ text: string; textHi: string | null; options: string[] | null; solution: string | null }>,
): void {
  for (const q of questions) {
    q.text = normalizeLatex(q.text);
    if (q.textHi) q.textHi = normalizeLatex(q.textHi);
    if (q.options) {
      q.options = q.options.map(o => normalizeLatex(o));
    }
    if (q.solution) q.solution = normalizeLatex(q.solution);
  }
}
