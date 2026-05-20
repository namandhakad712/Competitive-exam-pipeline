# Question Pipeline -- Complete Plan v3

## Overview

A standalone batch pipeline that downloads Indian exam PDFs (JEE Main, JEE Advanced, NEET UG, NCERT Exemplar), extracts questions with **100% verified accuracy** via AI extraction -> human verification, and outputs clean structured JSON files ready for API consumption.

This is a **separate private repository** -- NOT part of the Rankify web app. It runs locally on your machine, produces JSON datasets, which are then served to Rankify via an API endpoint.

**Golden rule:** Everything in this pipeline is **lowercase** -- exam names, directories, files, shift names, subject codes, field values. APIs are case-sensitive, sorting breaks on mixed case, and lowercase eliminates ALL casing bugs.

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [JSON Schema (Canonical Format)](#2-json-schema-canonical-format)
3. [ID Scheme](#3-id-scheme)
4. [File Organization & Naming](#4-file-organization--naming)
5. [Pipeline Flow](#5-pipeline-flow)
6. [Module Deep-Dive](#6-module-deep-dive)
7. [Question Type Coverage Matrix](#7-question-type-coverage-matrix)
8. [Diagram Storage Strategy](#8-diagram-storage-strategy)
9. [Scrapers Detail](#9-scrapers-detail)
10. [Auto-Validation Rules](#10-auto-validation-rules)
11. [Human Review Workflow CLI](#11-human-review-workflow-cli)
12. [Scripts & Automation](#12-scripts--automation)
13. [API Endpoint Design](#13-api-endpoint-design)
14. [Rankify Adapter](#14-rankify-adapter)
15. [Free Tier Limits](#15-free-tier-limits)
16. [Implementation Order](#16-implementation-order)
17. [Future Scope](#17-future-scope)
18. [Flaws Fixed from v1 (v1 -> v3 Changes)](#18-flaws-fixed-from-v1-v1--v3-changes)

---

## 1. Repository Structure

```
C:\QUESTION-PIPELINE\
│
├── plan.md                           # This file -- full pipeline design
├── package.json                      # Dependencies (typescript, ts-node, @types/node)
├── tsconfig.json                     # TypeScript config targeting ES2022 + NodeNext
├── .review-progress.json             # Review CLI session persistence (gitignored)
│
├── src/
│   ├── index.ts                      # CLI entry point -- parses args, dispatches commands
│   ├── types.ts                      # ALL shared types -- single source of truth
│   │
│   ├── scrapers/
│   │   ├── nta-scraper.ts            # JEE Main / NEET from NTA official site
│   │   ├── gateoverflow-scraper.ts   # JEE mirrors from gateoverflow.in
│   │   ├── ncert-scraper.ts          # NCERT Exemplar PDFs (class 11/12)
│   │   └── kaggle-importer.ts        # Import existing Kaggle/HF datasets
│   │
│   ├── extractors/
│   │   ├── ocr-stage.ts              # Mistral OCR -> per-page markdown + image map
│   │   ├── structurer.ts             # Markdown -> JSON (Cerebras <=12pgs, Gemini larger)
│   │   └── diagram-cacher.ts         # Decode base64 -> PNG -> save to diagrams/
│   │
│   ├── validators/
│   │   ├── auto-validator.ts         # 30+ automated consistency checks
│   │   ├── field-checker.ts          # Per-field validation rules (type-specific)
│   │   └── cross-validator.ts        # Multi-model comparison (future phase)
│   │
│   ├── finalizers/
│   │   ├── id-assigner.ts            # Stable ID generation per scheme
│   │   ├── normalizer.ts             # LaTeX -> Unicode conversion
│   │   ├── topic-normalizer.ts       # Map extracted topics to controlled vocabulary
│   │   └── exporter.ts               # Write JSON files + diagrams to data/
│   │
│   ├── review/
│   │   ├── review-cli.ts             # Interactive CLI for human verification
│   │   ├── pdf-renderer.ts           # Render PDF page snippet for comparison
│   │   └── batch-signoff.ts          # Sign off entire shifts at once
│   │
│   ├── api/
│   │   └── server.ts                 # Optional local API server for testing
│   │
│   ├── utils/
│   │   ├── pdf-downloader.ts         # Download with retry + PDF header validation
│   │   ├── rate-limiter.ts           # Respect API free tier limits per service
│   │   ├── hash-utils.ts             # SHA-256 for dedup across sources
│   │   ├── logger.ts                 # Structured console logging with levels
│   │   └── integrity.ts             # Verify SHA-256 checksums on all JSON files
│   │
│   ├── adapters/
│   │   └── rankify-adapter.ts        # Canonical Question -> Rankify TestSessionQuestionData
│   │
│   └── topic-vocabulary.ts           # Controlled vocabulary: 100+ topic mappings
│
├── data/
│   ├── index.json                    # Master index of ALL datasets + verification status
│   │
│   ├── jeemain/
│   │   ├── metadata.json             # Scraped URLs, verification status per shift
│   │   ├── 2025/
│   │   │   ├── 22jan-shift1/
│   │   │   │   ├── paper.json        # Full 90-question paper (number 1-90)
│   │   │   │   ├── physics.json      # Subject-split (number 1-30, subject-relative)
│   │   │   │   ├── chemistry.json
│   │   │   │   ├── mathematics.json
│   │   │   │   └── diagrams/
│   │   │   │       ├── physics/
│   │   │   │       │   ├── q001-fig1.png
│   │   │   │       │   ├── q007-fig1.png
│   │   │   │       │   └── ...
│   │   │   │       ├── chemistry/
│   │   │   │       └── mathematics/
│   │   │   ├── 22jan-shift2/
│   │   │   └── 23jan-shift1/
│   │   ├── 2024/
│   │   ├── ...
│   │   └── all-physics.json          # ALL physics across all shifts/years
│   │
│   ├── neet/
│   │   ├── metadata.json
│   │   ├── 2025/
│   │   │   ├── 04may/  (paper.json + subjects + diagrams/
│   │   │   └── 05may/
│   │   └── all-physics.json
│   │
│   ├── jeeadv/
│   │   ├── metadata.json
│   │   ├── 2025/
│   │   │   ├── paper1/
│   │   │   └── paper2/
│   │   └── ...
│   │
│   ├── ncert-exemplar/
│   │   ├── metadata.json
│   │   ├── class-11/
│   │   │   ├── physics.json + chemistry.json + biology.json + diagrams/
│   │   └── class-12/
│   │       ├── physics.json + chemistry.json + diagrams/
│   │
│   └── kaggle-public/
│       ├── metadata.json
│       └── raw-import.json           # As-imported, before re-verification
│
├── scripts/
│   ├── batch-process.ts              # Download -> OCR -> structure -> validate -> save
│   ├── verify-all.ts                 # Run human review on ALL unverified datasets
│   ├── rebuild-index.ts              # Regenerate data/index.json from files on disk
│   ├── export-for-opensource.ts      # Strip internal fields, add license/attribution
│   └── stats.ts                      # Print dataset statistics + integrity report
│
└── export/                           # Output directory for open-source (gitignored)
    ├── jeemain-physics.json
    ├── jeemain-chemistry.json
    ├── neet-biology.json
    └── ...
```

---

## 2. JSON Schema (Canonical Format)

Every JSON file follows this exact schema. The schemas below are written as TypeScript interfaces (source of truth in src/types.ts).

### 2.1 QuestionFile -- top-level wrapper (paper.json, physics.json, etc.)

```typescript
interface QuestionFile {
  schema: "v3";
  exam: "jeemain" | "neet" | "jeeadv" | "ncert-exemplar";
  year: number;
  shift: string | null;       // "22jan-shift1" or null for ncert/aggregate
  paper: string | null;       // "paper1" | "paper2" | null
  subjects: string[];          // ["physics", "chemistry", "mathematics"]
  total: number;               // Total questions in this file
  duration: number;            // Minutes
  marksCorrect: number;
  marksIncorrect: number;
  marksUnanswered: number;
  sections: Record<string, SectionConfig>;
  scrapedAt: string;           // ISO 8601 UTC
  checksum: string;            // SHA-256 of JSON body (before adding checksum field)
  questions: Question[];
  passages: Passage[];         // Referenced by passageId
}

interface SectionConfig {
  label: string;               // "section a"
  total: number;               // Total questions in this section
  required: number;            // Questions to attempt (5 out of 10 for JEE section B)
  mandatory: boolean;          // true = all must be attempted
}
```

### 2.2 Question -- individual question

```typescript
interface Question {
  id: string;                  // jeemain-2025-22jan-s1-ph-001
  number: number;              // Contextual: 1-90 in paper.json, 1-30 in subject.json
  numberLabel: string | null;  // "1" or "1(a)" for sub-questions
  subject: string;             // "physics" | "chemistry" | "mathematics" | "biology"
  topic: string;               // Normalized to controlled vocabulary
  section: string;             // "a" | "b" | null
  type: QuestionType;
  text: string;                // Question text (English)
  textHi: string | null;       // Hindi translation (NEET only, else null)
  options: string[] | null;    // null for assert-reason (auto-generated)
  answer: string;              // Single correct index as string
  answers: string[] | null;    // Multiple correct for MSQ
  answerPrecision: AnswerPrecision | null;  // Range/precision for NAT
  marks: number;
  negativeMarks: number;       // 0 for NAT
  passageId: string | null;    // References Passage.id
  solution: string | null;
  solutionFormat: "plain" | "html" | "markdown" | "latex" | null;
  hasDiagram: boolean;
  diagrams: Diagram[] | null;  // Multiple diagrams per question
  difficulty: "easy" | "medium" | "hard" | null;
  tags: string[];              // From controlled vocabulary
  revision: number;            // Bumped on each correction
  source: "official-pdf" | "reconstructed" | "imported-kaggle" | "imported-dataset";
}

type QuestionType = "mcq" | "msq" | "nat" | "assertion-reason" | "match" | "passage";

interface Diagram {
  file: string;                // Relative path: "diagrams/physics/q007-fig1.png"
  label: string | null;        // "fig. 1"
  caption: string | null;
}

interface AnswerPrecision {
  type: "exact" | "integer-range" | "decimal-range";
  value?: string;              // Exact answer for type exact
  min?: number;
  max?: number;
  unit?: string;               // "m/s", "V", etc.
}

interface Passage {
  id: string;                  // Passage reference ID
  text: string;                // Passage text (English)
  textHi: string | null;       // Hindi translation
  questions: string[];         // IDs of questions that reference this passage
}

interface QuestionSource {
  type: "official-pdf" | "reconstructed" | "imported-kaggle" | "imported-dataset";
  url?: string;                // Source URL if available
  page?: number;               // Page number in original PDF
  verifiedBy?: string;         // Human reviewer identifier
  verifiedAt?: string;         // ISO 8601
}
```

### 2.3 Example: Physics MCQ (paper.json)

```json
{
  "schema": "v3",
  "exam": "jeemain",
  "year": 2025,
  "shift": "22jan-shift1",
  "paper": null,
  "subjects": ["physics", "chemistry", "mathematics"],
  "total": 90,
  "duration": 180,
  "marksCorrect": 4,
  "marksIncorrect": -1,
  "marksUnanswered": 0,
  "sections": {
    "a": { "label": "section a", "total": 20, "required": 20, "mandatory": true },
    "b": { "label": "section b", "total": 10, "required": 5, "mandatory": false }
  },
  "scrapedAt": "2026-05-19T00:00:00Z",
  "checksum": "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "questions": [
    {
      "id": "jeemain-2025-22jan-s1-ph-001",
      "number": 1,
      "numberLabel": null,
      "subject": "physics",
      "topic": "kinematics",
      "section": "a",
      "type": "mcq",
      "text": "A particle moves along the x-axis with velocity v(t) = 2t + 3 m/s.",
      "textHi": null,
      "options": ["6 m", "9 m", "12 m", "18 m"],
      "answer": "2",
      "answers": null,
      "answerPrecision": null,
      "marks": 4,
      "negativeMarks": -1,
      "passageId": null,
      "solution": null,
      "solutionFormat": null,
      "hasDiagram": false,
      "diagrams": null,
      "difficulty": "easy",
      "tags": ["kinematics", "calculus"],
      "revision": 1,
      "source": "official-pdf"
    }
  ],
  "passages": []
}
```

### 2.4 Example: Assertion-Reason

Assertion-reason questions have **options: null** and **answer** is 0-3 index.
The 4 standard options are auto-generated client-side. NEVER stored in JSON.

| answer value | Display text |
|---|---|
| 0 | Both A and R are true and R is the correct explanation of A |
| 1 | Both A and R are true but R is NOT the correct explanation of A |
| 2 | A is true but R is false |
| 3 | A is false but R is true |

### 2.5 Example: NAT Range (numerical answer with precision)

```json
{
  "type": "nat",
  "answer": "4.02",
  "answerPrecision": {
    "type": "decimal-range",
    "min": 4.00,
    "max": 4.05,
    "unit": null
  },
  "negativeMarks": 0,    // Validator ENFORCES this for NAT
  "options": null
}
```

---

## 3. ID Scheme

Every question gets a stable, globally unique ID following this pattern:

```
{exam}-{year}-{shift-shorthand}-{subject-code}-{3-digit-number}
```

**Components:**

| Part | Source | Examples |
|---|---|---|
| exam | Study | jeemain, neet, jeeadv, ncert-exemplar |
| year | Study | 2025, 2024, 2023 |
| shift-shorthand | File path | 22jan-s1 (shift1), 22jan-s2 (shift2), 04may (neet date), p1 (jeeadv paper1) |
| subject-code | Hardcoded map | ph, ch, ma, bi |
| 3-digit-number | Question number in subject-split file | 001, 025, 100 |

**Examples:**

```
jeemain-2025-22jan-s1-ph-001       # JEE Main 2025 Jan 22 Shift 1 Physics Q1
jeemain-2025-22jan-s1-ch-015       # JEE Main 2025 Jan 22 Shift 1 Chemistry Q15
jeemain-2025-22jan-s1-ma-030       # JEE Main 2025 Jan 22 Shift 1 Mathematics Q30
neet-2025-04may-ph-045             # NEET 2025 May 4 Physics Q45
jeeadv-2025-p1-ph-012             # JEE Advanced 2025 Paper 1 Physics Q12
jeeadv-2025-p2-ch-025             # JEE Advanced 2025 Paper 2 Chemistry Q25
ncert-exemplar-11-ph-023           # NCERT Exemplar Class 11 Physics Q23
ncert-exemplar-12-ma-045           # NCERT Exemplar Class 12 Math Q45
```

**ID stability rules:**

1. The 3-digit number in the ID matches the question's number field **within the subject file**. If physics.json has Q1-Q30, IDs use -001 to -030.
2. paper.json uses full-paper numbering (1-90) but IDs still use subject-relative numbers.
3. If a question is removed, its ID is NEVER reused. It goes into a tombstone list.
4. Shifts longer than 99 characters are hashed to 8 chars.
5. Subject codes always lowercase: ph, ch, ma, bi.

---

## 4. File Organization & Naming

### 4.1 Directory Structure

All data is organized under the data/ directory by exam -> year -> shift/date.

```
data/jeemain/2025/22jan-shift1/
  paper.json              # Full 90-question paper with paper-level metadata
  physics.json            # Subject-split: 30 questions (number 1-30)
  chemistry.json          # Subject-split: 30 questions
  mathematics.json        # Subject-split: 30 questions
  diagrams/
    physics/
      q001-fig1.png       # Question 1, figure 1
      q007-fig1.png
      q015-fig1.png       # Question 15, figure 1
      q015-fig2.png       # Question 15, figure 2 (multiple diagrams)
    chemistry/
    mathematics/
```

### 4.2 Naming Conventions

| Element | Convention | Examples |
|---|---|---|
| Exam dir | Lowercase, no hyphens | jeemain, jeeadv, neet, ncert-exemplar |
| Year dir | 4-digit | 2025, 2024 |
| Shift dir | Lowercase with hyphens | 22jan-shift1, 23jan-shift2, 04may |
| Paper dir | Lowercase | paper1, paper2 |
| JSON files | Lowercase | paper.json, physics.json |
| Diagram files | Lowercase, zero-padded | q001-fig1.png, q015-fig2.png |

### 4.3 Subject-Split vs Full-Paper

- **paper.json**: Full paper as-is. number = 1-90. All subjects interleaved as in the original exam.
- **physics.json / chemistry.json / mathematics.json**: Subject-split. number = 1-30 (subject-relative).
- **all-{subject}.json** at exam root: ALL questions of one subject across all shifts/years. numbers from 1.
- **index.json** at dataset root: Master index with file paths, counts, verification status.

### 4.4 Metadata Files

Each exam directory has a metadata.json:

```json
{
  "exam": "jeemain",
  "sourceUrls": {
    "2025-22jan-shift1": "https://nta.ac.in/jeemain/2025/22jan-shift1-paper.pdf",
    "2025-22jan-shift2": "https://nta.ac.in/jeemain/2025/22jan-shift2-paper.pdf"
  },
  "verificationStatus": {
    "2025-22jan-shift1": "verified",     // unverified | verified | needs-review
    "2025-22jan-shift2": "needs-review"
  },
  "scrapedAt": "2026-05-19T00:00:00Z",
  "lastUpdated": "2026-05-19T00:00:00Z"
}
```

---

## 5. Pipeline Flow

The pipeline converts raw PDF to verified JSON through these stages:

```
PDF (raw) --> OCR (Mistral) --> Structure (Cerebras/Gemini) --> Auto-Validate --> Human Review --> Finalize --> JSON
```

### Stage 1: Web Scraping

- nta-scraper.ts: Download PDFs from NTA official website. JEE Main shifts at nta.ac.in. NEET at nta.neet.ac.in.
- gateoverflow-scraper.ts: Mirror/download PDFs from gateoverflow.in (reliable older JEE papers).
- ncert-scraper.ts: NCERT Exemplar PDFs from ncert.nic.in (class 11 + 12).
- kaggle-importer.ts: Import CSV/JSON from existing datasets on Kaggle or HuggingFace. Map to canonical schema.

### Stage 2: OCR (ocr-stage.ts)

- Takes a PDF file path.
- Sends to Mistral OCR API (free tier: 1000 pages/min).
- Returns structured markdown per page + base64-encoded page images.
- Auto-chunks if the PDF exceeds 3.5MB (Mistral payload limit).
- Detects bilingual PDFs (Hindi + English) and marks textHi fields.

### Stage 3: Structuring (structurer.ts)

- Takes the per-page markdown from OCR.
- Sends to Cerebras (if <=12 pages, 65k tokens) or Gemini Flash (if larger).
- Prompt instructs the AI to extract ALL questions in canonical JSON format.
- Handles answer key detection: Time-Travel Backfill strategy.
- Detects passage-based questions by finding comprehension paragraphs.

### Stage 4: Diagram Caching (diagram-cacher.ts)

- Iterates the extracted questions.
- For questions marked hasDiagram=true: decodes the base64 from Mistral OCR.
- Saves as PNG in diagrams/{subject}/q{num}-fig{n}.png.
- Updates the diagrams array in the question JSON.

### Stage 5: Auto-Validation

- auto-validator.ts: 30+ checks on every field.
- field-checker.ts: Type-specific rules (NAT negativeMarks=0, MSQ has answers[], etc.).
- Schema validation, topic normalization, diagram file existence check.
- Flags are reported but do NOT block saving (human decides).

### Stage 6: Human Verification (review-cli.ts)

- Interactive terminal UI.
- Shows original PDF snippet (rendered) vs extracted question JSON side-by-side.
- [a] Accept / [e] Edit / [s] Skip / [q] Quit.
- ~15 minutes per 90-question JEE paper.
- All edits are logged. Flags that were auto-validated are shown for review.
- Progress is saved to .review-progress.json so you can resume.

### Stage 7: Finalize (exporter.ts)

- Assigns stable IDs (id-assigner.ts).
- Normalizes LaTeX to Unicode (normalizer.ts).
- Maps extracted topics to controlled vocabulary (topic-normalizer.ts).
- Writes paper.json + subject-split files + diagrams to data/.
- Computes SHA-256 checksum for every JSON file.
- Updates index.json master index.

---

## 6. Module Deep-Dive

### 6.1 ocr-stage.ts

**Input:** PDF file path
**Output:** { pages: PageContent[], images: Map<pageNum, base64> }

```typescript
interface PageContent {
  page: number;
  markdown: string;
  isBilingual: boolean;       // Hindi + English
}
```

**Algorithm:**
1. Check PDF file size. If > 3.5MB, split into chunks of pages.
2. Send each chunk to Mistral OCR API with rate limiter (1000 pages/min free).
3. Parse response: extract per-page markdown text + base64 images.
4. Identify bilingual content (NEET papers have Hindi + English in same PDF).
5. Return merged result.

### 6.2 structurer.ts

**Input:** PageContent[] from OCR stage
**Output:** PartialQuestion[] (before ID assignment and normalization)

**Algorithm:**
1. Concatenate all page markdowns into one text block.
2. Choose AI provider: Cerebras if <=12 pages (65k tokens), otherwise Gemini Flash.
3. Send prompt: "Extract all questions from this exam paper in JSON format."
4. Prompt includes the canonical schema description).
5. Parse AI response as JSON array.
6. **Time-Travel Backfill:** The answer key is typically at the END of the PDF. AI sees it after reading all questions. When it sees "Ans: (2)" at the end, it backfills the answer field for the corresponding question. This is handled by the AI in a single pass.
7. Detects passages: if a block of text appears before multiple questions without diagrams, it's a passage.
8. Extract passage as Passage object, assign passageId to each question.

**Prompt design principles:**
- System prompt: "You are an exam paper parser. Your job is to extract questions with 100% accuracy."
- Few-shot examples of the canonical JSON format.
- Explicit instructions for each question type.
- "If unsure about any field, set it to null rather than guessing."

### 6.3 diagram-cacher.ts

**Input:** PartialQuestion[] + images map from OCR
**Output:** Updated PartialQuestion[] with diagram arrays populated

**Algorithm:**
1. For each question with hasDiagram=true or with diagram references in the text:
2. Match the diagram reference to the correct page image from Mistral.
3. Crop the diagram region from the page image (if Mistral provides page images).
4. If Mistral already extracted individual diagram images: just decode from base64.
5. Save as PNG: diagrams/{subject}/q{num}-fig{n}.png
6. Update the diagrams array with file path, label, and caption.

### 6.4 auto-validator.ts

**Input:** Question[]
**Output:** ValidationResult[]

```typescript
interface ValidationResult {
  questionId: string;
  valid: boolean;
  flags: ValidationFlag[];
}
interface ValidationFlag {
  field: string;
  severity: "error" | "warning" | "info";
  message: string;
  expected?: unknown;
  actual?: unknown;
}
```

**Checks (30+):**
1. Every question has a unique ID.
2. ID format matches {exam}-{year}-{shift}-{code}-{3digit}.
3. subject field is a valid subject code.
4. type is a valid QuestionType.
5. text is not empty.
6. options count: 3-5 for mcq, 4-6 for msq, null for assertion-reason and nat.
7. answer is within options range.
8. answers array sorted and within range (MSQ).
9. marks is positive number.
10. negativeMarks: 0 for nat, -1 or less for mcq/msq.
11. hasDiagram matches diagrams presence.
12. diagram files exist on disk.
13. passageId references a valid Passage if type is passage.
14. textHi is string for NEET, null for others.
15. tags are from controlled vocabulary.
16. topic is from controlled vocabulary.
17. difficulty is one of easy, medium, hard.
18. source is a valid source type.
19. revision is positive integer >= 1.
20. numberLabel format matches questions array order.
21. answerPrecision is valid format for NAT.
22. solutionFormat matches solution content.
23. No HTML injection in text fields.
24. Unicode is valid (no broken surrogate pairs).
25. No duplicate IDs across the dataset.
26. paper question count matches paper metadata.
27. Subject-split count matches subject in metadata.
28. No question has both options and options=null mismatch.
29. checksum file matches content.
30. Revision increments logically.

### 6.5 topic-normalizer.ts

Maps extracted topic labels to a controlled vocabulary.

```typescript
const topicAliases: Record<string, string> = {
  "kinematics": "kinematics",
  "motion": "kinematics",
  "motion in 1d": "kinematics",
  "motion in straight line": "kinematics",
  "newtons laws": "newtons-laws",
  "newton laws": "newtons-laws",
  "nlm": "newtons-laws",
  "laws of motion": "newtons-laws",
  "friction": "friction",
  "work energy power": "work-energy-power",
  "work energy": "work-energy-power",
  "work power energy": "work-energy-power",
  "rotational motion": "rotational-motion",
  "rigid body dynamics": "rotational-motion",
  "rotation": "rotational-motion",
  // ... 100+ mappings defined in src/topic-vocabulary.ts
}
```

### 6.6 field-checker.ts

Type-specific validation rules:

```typescript
const typeRules: Record<QuestionType, ValidationRule[]> = {
  "mcq": [
    { field: "options", check: (q) => q.options?.length >= 3 && q.options?.length <= 5 },
    { field: "answers", check: (q) => q.answers === null },
    { field: "answer", check: (q) => typeof q.answer === "string" },
  ],
  "msq": [
    { field: "options", check: (q) => q.options?.length >= 4 && q.options?.length <= 6 },
    { field: "answers", check: (q) => q.answers !== null && q.answers.length >= 1 },
    { field: "answer", check: (q) => q.answer !== "" },
  ],
  "nat": [
    { field: "options", check: (q) => q.options === null },
    { field: "answer", check: (q) => !isNaN(parseFloat(q.answer)) },
    { field: "negativeMarks", check: (q) => q.negativeMarks === 0 },
  ],
  "assertion-reason": [
    { field: "options", check: (q) => q.options === null },
    { field: "answer", check: (q) => ["0","1","2","3"].includes(q.answer) },
  ],
  "match": [
    { field: "options", check: (q) => q.options && q.options.length >= 4 },
    { field: "answer", check: (q) => typeof q.answer === "string" || q.answers !== null },
  ],
  "passage": [
    { field: "passageId", check: (q) => q.passageId !== null }
  ]
};
```

---

## 7. Question Type Coverage Matrix

This table documents every question type across all exams and confirms schema support.

| Type | JEE Main | JEE Advanced | NEET UG | NCERT Exemplar | Schema Support |
|---|---|---|---|---|---|
| MCQ (single correct, 4 options) | YES | YES | YES | YES | type: mcq, options: string[4], answer: string |
| MSQ (multiple correct) | YES | YES | NO | NO | type: msq, options: string[4-6], answers: string[] |
| NAT (numerical answer) | YES | YES | NO | NO | type: nat, options: null, negativeMarks: 0 |
| NAT with precision range | rare | YES | NO | NO | answerPrecision: { type, min, max, unit } |
| Assertion-Reason | YES | YES | NO | NO | type: assertion-reason, options: null (auto-gen) |
| Matrix Match / Match Columns | NO | YES | NO | NO | type: match, options: string[] paired |
| Passage-Based Comprehension | YES | YES | YES | NO | passageId: string references Passage object |
| Multiple Diagrams / Figures | rare | YES | rare | YES | diagrams: Diagram[] array |
| Bilingual (Hindi + English) | NO | NO | YES | NO | textHi: string, Passage.textHi |
| Sub-Questions (1a, 1b, etc.) | NO | YES | NO | NO | numberLabel: "1(a)" |

### Assertion-Reason Standard Options (auto-generated, NEVER in JSON)

Assertion-reason questions always have these 4 choices. They are NEVER stored in JSON.
Saves ~200 characters per question. Client-side code generates them.

```
answer "0": "Both A and R are true and R is the correct explanation of A"
answer "1": "Both A and R are true but R is NOT the correct explanation of A"
answer "2": "A is true but R is false"
answer "3": "A is false but R is true"
```

---

## 8. Diagram Storage Strategy

### Storage Location

```
data/{exam}/{year}/{shift}/diagrams/{subject}/q{3-digit}-fig{index}.png
```

### Naming Rules

| Component | Format | Example |
|---|---|---|
| Subject dir | lowercase | physics, chemistry, mathematics, biology |
| Prefix | "q" always | q |
| Number | 3-digit zero-padded | 001, 007, 015 |
| Separator | -fig | -fig |
| Figure index | 1, 2, 3 | 1 |
| Extension | .png | .png |

### Examples

```
diagrams/physics/q001-fig1.png   # Question 1, figure 1
diagrams/physics/q015-fig1.png   # Question 15, figure 1
diagrams/physics/q015-fig2.png   # Question 15, figure 2 (multiple diagrams)
diagrams/chemistry/q030-fig1.png  # Question 30, figure 1
diagrams/mathematics/q012-fig1.png
```

### Question reference

```json
"diagrams": [
  { "file": "diagrams/physics/q007-fig1.png", "label": "fig. 1", "caption": null }
]
```

### Format

- PNG format (lossless, good compression for line art).
- Mistral OCR outputs base64-encoded images. We decode and save as PNG.
- Typical size: 5-50 KB per diagram (line art). 50-200 KB for complex graphs.
- No subdirectories beyond subject level (shallow).

---

## 9. Scrapers Detail

### 9.1 nta-scraper.ts

**Source:** National Testing Agency official website
**Targets:** JEE Main (all shifts), NEET UG
**URL patterns:**

```
https://nta.ac.in/jeemain/2025/{date}-shift{pdf}
https://neet.nta.nic.in/2025/{date}-paper.pdf
```

**Logic:**
1. For a given exam (jeemain/neet) and year, construct dates.
2. Generate all possible URL patterns (date + shift combinations).
3. Check HTTP response status for each URL.
4. Download valid PDFs to temp directory with retry logic (3 retries, 2s delay).
5. Validate downloaded file: check PDF magic bytes (%PDF).
6. Log results: success/failure per PDF.

### 9.2 gateoverflow-scraper.ts

**Source:** gateoverflow.in (community archive of JEE papers)
**Targets:** Older JEE Main / JEE Advanced papers (pre-2023)
**Approach:** Web scraping HTML pages for PDF download links.
**Fallback:** For papers not available on NTA site (JEE Adv 2019, 2020, etc.).

### 9.3 ncert-scraper.ts

**Source:** NCERT official website
**Targets:** NCERT Exemplar PDFs for Class 11 and 12
**Subjects:** Physics, Chemistry, Mathematics, Biology
**URL patterns:**

```
https://ncert.nic.in/textbook/pdf/{code}.pdf
https://ncert.nic.in/exemplar/{code}.pdf
```

### 9.4 kaggle-importer.ts

**Source:** Existing datasets from Kaggle, HuggingFace, GitHub
**Targets:** Any structured question data NOT behind a paywall
**Approach:
1. Download CSV/JSON from Kaggle API.
2. Map columns to canonical Question schema.
3. Set source = "imported-kaggle".
4. Mark as needs-verification in metadata.json.
5. These need human review to confirm correctness.

---

## 10. Auto-Validation Rules

These rules are applied by auto-validator.ts after extraction and before human review.

### Schema Validation
1. All required fields are present.
2. No unknown fields.
3. Field types match the schema.
4. enum values are within allowed set.

### Content Validation
5. text is not empty.
6. text does not contain placeholder text ("[image]", "figure not found").
7. options are unique (no duplicate options).
8. answer index is within options array bounds.
9. answers array is sorted ascending.
10. marks is a positive integer.
11. negativeMarks is a negative number (or 0 for NAT).
12. hasDiagram is true only if diagrams exists.
13. diagram file paths include the subject directory.
14. passageId references a passage in the passages array.
15. textHi is null for non-NEET exams.

### Type-Specific Validation (field-checker.ts)
16. MCQ: options length 3-5, answer is single index.
17. MSQ: options length 4-6, answers length >= 1.
18. NAT: options is null, answer is numeric string, negativeMarks === 0.
19. Assertion-Reason: options is null, answer is "0"|"1"|"2"|"3".
20. Match: options length >= 4.
21. Passage: passageId is not null.

### Cross-File Validation
22. paper.json question count matches metadata total.
23. Subject file question counts sum to paper total.
24. No duplicate IDs across all files.
25. Diagrams referenced in questions exist on disk.

### Security Validation
26. No HTML tags in text fields (XSS prevention).
27. No script injection via answer fields.
28. File paths don't contain traversal (..).

### Integrity Validation
29. SHA-256 checksum matches file content.
30. revision field increments correctly.

---

## 11. Human Review Workflow CLI

### Launch Command

```bash
npm run review -- --exam jeemain --year 2025 --shift 22jan-shift1
```

### Interface

The review CLI shows a split terminal view:

```
┌─────────────────────────────────┬──────────────────────────────────┐
│         PDF Snippet            │        Extracted JSON            │
│                                 │                                  │
│  Q1. A particle moves along     │  {                               │
│  the x-axis with velocity       │    id: "...-s1-ph-001",          │
│  v(t) = 2t + 3 m/s. At t=3     │    number: 1,                    │
│  seconds, the displacement      │    subject: "physics",           │
│  from t=0 is:                   │    topic: "kinematics",          │
│                                 │    type: "mcq",                  │
│  (1) 6 m    (2) 9 m             │    text: "A particle moves...",  │
│  (3) 12 m   (4) 18 m            │    options: ["6 m", "9 m",...],  │
│                                 │    answer: "1",                  │
│  Answer: (2)                    │    marks: 4,                     │
│                                 │  }                               │
├─────────────────────────────────┴──────────────────────────────────┤
│ [a] Accept  [e] Edit  [s] Skip  [q] Quit  (73/90 complete)        │
└────────────────────────────────────────────────────────────────────┘
```

### Key Bindings

| Key | Action |
|---|---|
| a | Accept question as-is |
| e | Edit: opens editor for the JSON of current question |
| s | Skip: mark as needs-review, continue |
| q | Quit: save progress to .review-progress.json |
| f | Flag: add a note about this question |
| j/k | Navigate up/down in flagged list |

### Edit Mode

When [e] is pressed, the question JSON is opened in the system's default editor
(configurable via $EDITOR env var, defaults to notepad on Windows).
After saving and closing, the validator re-runs on the edited JSON.
If valid, mark as accepted and move to next question.
If invalid, show validation errors and ask to re-edit or skip.

### Progress Persistence

```json
// .review-progress.json (gitignored)
{
  "exam": "jeemain",
  "year": 2025,
  "shift": "22jan-shift1",
  "currentQuestion": 73,
  "status": {
    "accepted": [1, 2, 3, ..., 72],
    "edited": [4, 15, 33],
    "skipped": [44, 67],
    "flagged": [{ "number": 44, "note": "Answer key unclear in PDF" }]
  },
  "startedAt": "2026-05-19T14:00:00Z",
  "lastUpdated": "2026-05-19T14:25:00Z"
}
```

### Batch Signoff (batch-signoff.ts)

After ALL questions in a shift have been individually reviewed and accepted:

```bash
npm run signoff -- --exam jeemain --year 2025 --shift 22jan-shift1
```

This updates metadata.json with status: "verified" and the reviewer identity + timestamp.
A question is only "verified" when both auto-validation AND human review have passed.

### Timing Estimates

| Paper size | AI time | Auto-validation | Human review | Total |
|---|---|---|---|---|
| 90 questions (JEE Main) | ~30s | ~2s | ~15 min | ~15.5 min |
| 45 questions (JEE Adv) | ~20s | ~1s | ~7 min | ~7.3 min |
| 200 questions (NEET) | ~60s | ~3s | ~30 min | ~31 min |
| 35 questions (NCERT Ex) | ~10s | ~1s | ~5 min | ~5.2 min |

---

## 12. Scripts & Automation

### batch-process.ts

End-to-end pipeline for a single shift/paper.

```bash
npm run batch -- --exam jeemain --year 2025 --shift 22jan-shift1
```

Steps: download PDF -> OCR -> structure -> auto-validate -> save partial JSON to data/
Then prompts: "Review now? [y/n]" -> launches review-cli if y.

### verify-all.ts

Scans all unverified datasets and launches review for each.

```bash
npm run verify-all
```

1. Reads data/index.json for verification status.
2. Filters entries where status != "verified".
3. Launches review-cli for each unverified entry.
4. After completion, updates index.json.

### rebuild-index.ts

Regenerates data/index.json by scanning the filesystem.

```bash
npm run rebuild-index
```

Walks data/ directory, reads every paper.json, aggregates counts and verification status.

### export-for-opensource.ts

Strips internal fields, adds license/attribution.

```bash
npm run export -- --license cc-by-4.0 --output ./export
```

1. Reads all verified datasets.
2. Strips: revision, source, scrapedAt, checksum, etc.
3. Adds: attribution, license field, citation info.
4. Outputs to export/ directory.

### stats.ts

Print dataset statistics and integrity report.

```bash
npm run stats
```

Outputs:

```
Dataset Statistics
==================
Total questions: 5,430
  - JEE Main 2025: 1,080 (12 shifts x 90)
  - JEE Main 2024: 1,080
  - JEE Adv 2025: 90 (2 papers x 45)
  - NEET 2025: 200
  - NCERT Exemplar Class 11: 500
  - NCERT Exemplar Class 12: 480
Total diagrams: 320
Total JSON files: 87
Total size: 48.3 MB
Integrity: 87/87 checksums verified
Verification: 85% verified, 10% unverified, 5% needs-review
```

### integrity.ts (utility)

```bash
npm run integrity -- --path ./data
```

Walks data/ directory, recomputes SHA-256 for each JSON file, 
compares against stored checksum field. Reports mismatches.

If a file fails integrity check, the checksum is removed and revision is bumped.
The file is flagged for re-verification.

---

## 12.5 Answer Key Handling: Time-Travel Backfill

### The Problem

Indian exam PDFs have answer keys at the END of the document. When the AI extracts questions,
it reads questions sequentially (page 1, 2, 3...) and then encounters the answer key at the end.
The AI needs to "go back" and fill in the answer field for each question.

### The Solution: Single-Pass Backfill

The AI (Cerebras/Gemini) handles this in a SINGLE pass because the entire PDF text is sent as one prompt:

1. The prompt includes ALL pages: questions first, then answer key at the end.
2. The AI reads the entire text before producing output.
3. When it sees "Ans: (2)" on the last page, it already knows which question it refers to.
4. The AI outputs each question WITH the answer field already populated.

### Why It Works

- The AI processes the full context before generating output.
- It sees question 1 on page 3, question 2 on page 4, and the answer key on page 25.
- By the time it outputs JSON for question 1, it already knows the answer from the key.
- This works because the AI reasons over the ENTIRE input before producing ANY output.

### Fallback: Post-Processing

If the AI misses some answers:

```typescript
function backfillAnswers(questions: PartialQuestion[], answerKey: AnswerKey[]): void {
  for (const entry of answerKey) {
    const q = questions.find(q => q.number === entry.questionNumber);
    if (q && !q.answer) {
      q.answer = entry.answer;
    }
  }
}
```

---

## 13. API Endpoint Design

### Base URL

```
http://localhost:3456/api/v1
```

### Endpoints

**GET /api/v1/questions** -- Query questions

```
GET /api/v1/questions?exam=jeemain&year=2025&subject=physics&limit=30&offset=0
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| exam | string | YES | Exam name: jeemain, neet, jeeadv, ncert-exemplar |
| year | number | NO | Filter by year |
| shift | string | NO | Filter by shift |
| paper | string | NO | Filter by paper |
| subject | string | NO | Filter by subject |
| topic | string | NO | Filter by controlled topic |
| type | string | NO | Filter by question type |
| section | string | NO | Filter by section (a, b) |
| tags | string | NO | Comma-separated, AND logic |
| difficulty | string | NO | easy, medium, hard |
| limit | number | NO | Max results (default 100, max 500) |
| offset | number | NO | Pagination offset |
| random | boolean | NO | Return random sample instead of sequential |
| sort | string | NO | Sort field (default: number) |
| order | string | NO | Sort order: asc (default) or desc |

**GET /api/v1/questions/count** -- Get total count

**GET /api/v1/diagrams/{exam}/{year}/{shift}/{path:rest}** -- Serve diagram images

**GET /api/v1/exams** -- List all exams with metadata

**GET /api/v1/stats** -- Get dataset statistics

### Response Format

```json
{
  "success": true,
  "count": 30,
  "total": 1080,
  "offset": 0,
  "limit": 30,
  "sort": "number",
  "order": "asc",
  "exam": "jeemain",
  "year": 2025,
  "subject": "physics",
  "questions": [ ... Question[] ]
}
```

---

## 14. Rankify Adapter

### What It Does

Converts canonical Question[] to Rankify's internal TestSessionQuestionData[] format.
This is a ~30-line function. NO changes needed to Rankify's schema.

```typescript
import { Question } from "../types";
// Rankify types imported from the shared package

function adaptQuestion(q: Question): TestSessionQuestionData {
  // 1. Generate assertion-reason options if type is assertion-reason
  const options = q.type === "assertion-reason"
    ? ["Both A and R are true and R is the correct explanation of A",
       "Both A and R are true but R is NOT the correct explanation of A",
       "A is true but R is false",
       "A is false but R is true"]
    : q.options ?? [];

  // 2. Prepend passage text if passageId exists
  const text = q.passageId
    ? findPassage(q.passageId).text + "\n\n" + q.text
    : q.text;

  // 3. Map to Rankify format
  return {
    testQuestionId: q.id,
    testSessionId: "",   // Set by Rankify at session creation
    testQuestionType: q.type,
    testQuestionNumber: q.number,
    testQuestionText: text,
    testQuestionOptions: options,
    testQuestionSubject: q.subject,
    testQuestionTopic: q.topic,
    testQuestionMarks: q.marks,
    testQuestionNegativeMarks: q.negativeMarks,
    testQuestionDifficulty: q.difficulty,
    testSection: q.section,
    testQuestionAnswer: q.answer,
    testQuestionAnswers: q.answers,
  };
}
```

### What Changes in Rankify

1. **New API endpoint**: GET /api/v1/questions (serves canonical JSON)
2. **New UI page**: "Question Bank" -- allows browsing questions and importing them.
3. **Import button**: Fetches from the pipeline API -> adapter -> stores in Dexie DB.
4. **Nothing else changes**: CBT engine, review interface, session player -- all unchanged.

---

## 15. Free Tier Limits

### Service Limits

| Service | Free Tier Limit | Our Usage per Paper |
|---|---|---|
| Mistral OCR | 1000 pages/min | 1 request per 90-page PDF |
| Cerebras Chat | 60 req/min, 65k tokens | ~8 requests per 90-pg paper (sections) |
| Gemini Flash | 60 req/min, 1000 req/day | Fallback for PDFs >12 pages |

### Bottleneck Analysis

**For JEE Main 2025 (12 shifts x 90 pages = 1080 pages total):**

```
Mistral OCR:  1080 pages / 1000 pg/min = 1.08 minutes total
Cerebras:     12 shifts x 8 calls = 96 calls / 60 per min = 1.6 minutes
Total AI time: ~3 minutes for all 12 shifts
```

**For NEET 2025 (200 pages):**

```
Mistral OCR:  200 pages / 1000 pg/min = 0.2 minutes
Cerebras:     200 pages / 12 per call = 17 calls / 60 per min = 0.3 minutes
Total AI time: ~30 seconds
```

**Daily capacity (Gemini fallback):** 1000 requests/day -> covers 125 papers of 8 sections each.
We will rarely exceed Cerebras's limits. Gemini is a safety net.

---

## 16. Implementation Order

The implementation is broken into 9 phases. Each phase produces working, testable code.

### Phase 1: Foundation (Day 1)
- src/types.ts: ALL interfaces and type definitions.
- src/topic-vocabulary.ts: 100+ controlled topic mappings.
- src/utils/*: pdf-downloader, rate-limiter, hash-utils, logger, integrity.
- package.json, tsconfig.json: project setup with TypeScript.
- Verification: npm run build compiles without errors.

### Phase 2: Scrapers (Day 2)
- src/scrapers/*: All 4 scrapers implemented and tested.
- Each scraper can be run individually: npx ts-node src/scrapers/nta-scraper.ts
- Verification: scraper downloads a real PDF from NTA and saves to temp.

### Phase 3: Extraction (Day 3-4)
- src/extractors/ocr-stage.ts: Mistral OCR integration.
- src/extractors/structurer.ts: Cerebras/Gemini extraction prompts.
- src/extractors/diagram-cacher.ts: Base64 to PNG converter.
- Verification: Run ocr-stage on a test PDF -> valid markdown output.

### Phase 4: Validation (Day 5)
- src/validators/auto-validator.ts: 30+ checks.
- src/validators/field-checker.ts: Type-specific rules.
- Verification: Validator catches 5 intentional errors in a test file.

### Phase 5: Finalization (Day 6)
- src/finalizers/*: ID assigner, normalizer, topic normalizer, exporter.
- End-to-end test: paper.json + subject-split files + diagrams written to data/.
- Verification: All output files pass integrity checks.

### Phase 6: Human Review (Day 7-8)
- src/review/review-cli.ts: Interactive terminal UI.
- src/review/pdf-renderer.ts: PDF snippet rendering.
- src/review/batch-signoff.ts: Sign off shifts.
- Verification: Full end-to-end review of a test paper.

### Phase 7: Scripts (Day 9)
- scripts/*: batch-process, verify-all, rebuild-index, export, stats.
- Verification: batch-process runs on a test URL and produces verified output.

### Phase 8: API + Adapter (Day 10)
- src/api/server.ts: Express/Fastify server with all endpoints.
- src/adapters/rankify-adapter.ts: Question -> TestSessionQuestionData.
- Verification: curl API endpoint returns valid JSON.

### Phase 9: Cross-Validation (Future)
- src/validators/cross-validator.ts: Multi-model comparison.
- Two different AI models extract the same paper. Differences are flagged for human review.
- Reduces human review time from 15 min to ~2 min per paper (only review diffs).

---

## 17. Future Scope

1. **Multi-model cross-validation** (Phase 9): Two AI models extract the same paper. Only differences need human review. Could reduce review time by 80%.

2. **More exam boards**: Add JEST, BITSAT, KCET, MHT CET, CUET. Each has a scraper module + topic vocabulary.

3. **Web UI for review**: Instead of CLI, a local web-based review tool with side-by-side PDF viewer (like the Rankify cropper).

4. **LangExtract**: Language-agnostic extraction. Parses papers from ANY country (SAT, Gaokao, Abitur, etc.) by auto-detecting the language and exam structure.

5. **Peer review system**: Allow multiple reviewers to verify independently. Questions are only "verified" when 2+ reviewers agree.

6. **Git-based dataset distribution**: Store the verified datasets in a public GitHub repo. Users can submit PRs for corrections.

7. **Automatic answer key cross-referencing**: Compare extracted answers across multiple sources (official key, coaching center solutions, student forums). Flag discrepancies.

8. **Difficulty rating via ML**: Train a model on user performance data to assign difficulty ratings (easy/medium/hard) instead of manual assignment.

---

## 18. Flaws Fixed from v1 (v1 -> v3 Changes)

This section documents every flaw identified in v1 and how v3 addresses it.

### v1 Flaws (15 total)

| # | Flaw | v3 Fix |
|---|---|---|
| 1 | Mixed case in exam names (jeemain vs JEE Main) | ALL lowercase everywhere: directories, files, IDs, field values |
| 2 | Unprofessional "provenance" field in JSON | Removed entirely. Clean schema with only meaningful fields |
| 3 | Diagram storage undefined | Defined: diagrams/{subject}/q{num}-fig{n}.png |
| 4 | No data integrity mechanism | SHA-256 checksum on every JSON file + integrity.ts verifier |
| 5 | No schema versioning | schema field ("v3") + revision on each question |
| 6 | Free-form topic strings | topic-normalizer.ts with 100+ controlled vocabulary |
| 7 | No sub-question support (1a, 1b) | numberLabel: "1(a)" for sub-questions |
| 8 | No MSQ multi-answer support | answers: string[] for multiple correct answers |
| 9 | Sections ambiguous (no mandatory/optional) | SectionConfig with total, required, mandatory |
| 10 | shift field doesn't fit JEE Advanced's paper1/paper2 | paper: "paper1" | "paper2" field added |
| 11 | dateScraped naming inconsistent | scrapedAt: ISO 8601 UTC |
| 12 | Only one diagram per question | diagrams: Diagram[] array |
| 13 | No bilingual support (NEET Hindi) | textHi: string field, Passage.textHi |
| 14 | Passage questions duplicated per-question | passageId references passage in separate passages array |
| 15 | Assertion-reason stores 4 verbose options | Auto-generated client-side from 0-3 index. Saves ~200 chars each |

### v2 Missed Flaws (13 more, caught in review)

| # | Flaw | v3 Fix |
|---|---|---|
| 16 | NAT negativeMarks not enforced | Validator ENFORCES negativeMarks === 0 for NAT |
| 17 | NAT precision undefined (range answers) | answerPrecision: { type, min, max, unit } |
| 18 | Solution field no format specifier | solutionFormat: "plain" | "html" | "markdown" | "latex" |
| 19 | Match Columns format undefined | type: "match" with paired strings in options |
| 20 | number field meaning varies by file context | DOCUMENTED: paper.json = 1-90, subject.json = 1-30. ID always subject-relative |
| 21 | No source tracking | source: "official-pdf" | "reconstructed" | "imported-kaggle" |
| 22 | Tags uncontrolled | Must come from controlled vocabulary |
| 23 | No checksum verification script | integrity.ts with verifyAllDatasets() |
| 24 | No numberLabel for custom numbering | numberLabel: "1(a)" |
| 25 | Question type coverage undocumented | Section 7 matrix: every exam x every type |
| 26 | API default sort undefined | sort=number, order=asc by default |
| 27 | No section config for optional questions | SectionConfig with mandatory boolean |
| 28 | ID number and question number confusing | ID uses subject-relative 3-digit. number is contextual |

### Total: 28 flaws identified and fixed across v1 -> v3.

---

## Summary

| Aspect | Detail |
|---|---|
| Location | C:\QUESTION-PIPELINE\ - separate private repository |
| Infra | Node.js + TypeScript only. No Docker, no database, no containers |
| Cost | USD 0. All APIs have free batch tiers sufficient for this volume |
| Accuracy | 100% via AI extraction -> auto-validation -> human review |
| Format | v3 canonical schema with Rankify adapter (30 lines) |
| File org | exam/year/shift/paper.json + subject-split files + diagrams/ |
| License | None in JSON. Added only at open-source export time via --license flag |
| Rankify changes | Zero schema changes. 30-line adapter. New API endpoint + Import button |
| Review time | ~15.5 min per 90-question JEE Main paper. ~30 min per 200-question NEET |
| Total dataset | ~50 MB for 15,000+ questions across all target exams |
| Case convention | ALL LOWERCASE everywhere |
| Question types | mcq, msq, nat (with range), assertion-reason, match-columns, passage |

---

## 2.6 Additional Question Type Examples

### MSQ (Multiple Select Correct)

```json
{
  "id": "jeemain-2025-22jan-s1-ma-012",
  "number": 12,
  "subject": "mathematics",
  "type": "msq",
  "text": "Which of the following functions are differentiable at x = 0?",
  "options": [
    "f(x) = |x|",
    "f(x) = x|x|",
    "f(x) = x^2 sin(1/x), x != 0; f(0)=0",
    "f(x) = sqrt(|x|)",
    "f(x) = e^(-1/x^2), x != 0; f(0)=0"
  ],
  "answer": "",  // reserved, not used for MSQ
  "answers": ["1", "2", "4"],
  "marks": 4,
  "negativeMarks": -2,
  "source": "official-pdf"
}
```

### NAT (Numerical Answer Type)

```json
{
  "id": "jeemain-2025-22jan-s1-ph-018",
  "number": 18,
  "subject": "physics",
  "type": "nat",
  "text": "A wire of resistance 4 Ohm is stretched to double its length. Find the new resistance.",
  "options": null,
  "answer": "16",
  "answers": null,
  "answerPrecision": null,
  "marks": 4,
  "negativeMarks": 0,  // ENFORCED by validator
  "source": "official-pdf"
}
```

### NAT with Integer Range

```json
{
  "type": "nat",
  "answer": "5",
  "answerPrecision": {
    "type": "integer-range",
    "min": 4,
    "max": 6
  }
}
```

### Match the Columns (JEE Advanced)

```json
{
  "type": "match",
  "text": "Match the items in Column I with those in Column II.",
  "options": [
    "Column I:",
    "  (A) Photoelectric effect",
    "  (B) Compton scattering",
    "  (C) Pair production",
    "  (D) X-ray diffraction",
    "Column II:",
    "  (p) Einstein",
    "  (q) De Broglie",
    "  (r) Planck",
    "  (s) Bragg"
  ],
  "answer": "A-p, B-p, C-r, D-s",
  "source": "official-pdf"
}
```

### Passage-Based (NEET style)

```json
// In paper.json, passage field:
"passages": [{
  "id": "passage-1",
  "text": "A ball of mass 0.5 kg is dropped from a height of 20 m. Take g = 10 m/s^2.",
  "textHi": null,
  "questions": ["neet-2025-04may-ph-045", "neet-2025-04may-ph-046", "neet-2025-04may-ph-047"]
}]
// Questions referencing it:
{
  "id": "neet-2025-04may-ph-045",
  "passageId": "passage-1",
  "text": "What is the velocity of the ball just before hitting the ground?",
  "textHi": null,
  "options": ["10 m/s", "20 m/s", "30 m/s", "40 m/s"],
  "answer": "1"
}
```

### Multiple Diagrams (JEE Advanced)

```json
{
  "id": "jeeadv-2025-p1-ph-015",
  "hasDiagram": true,
  "diagrams": [
    { "file": "diagrams/physics/q015-fig1.png", "label": "fig. 1", "caption": "Circuit diagram" },
    { "file": "diagrams/physics/q015-fig2.png", "label": "fig. 2", "caption": "Voltage vs time graph" }
  ]
}
```


---

## 19. Edge Cases & Ambiguities

### 19.1 Empty Questions
If a question has no text (scanned image that Mistral could not OCR), set text to null and flagged for human review. The question is still included in the JSON with a "needs-ocr" flag.

### 19.2 Missing Answer Key
Some older PDFs from gateoverflow.in do not include answer keys. In this case, the answer field is set to null and the question is marked for manual answer lookup. The review CLI will display a warning: "No answer key found for this question."

### 19.3 Partial Diagrams
If Mistral OCR extracts a diagram but it is blurry or cropped, the diagram is still saved. The human reviewer can flag it during review. A flag type "diagram-quality" exists for this.

### 19.4 Hindi-Only Questions
Rare case in NEET where a question has Hindi text but no English equivalent. In this case, text becomes null and textHi contains the Hindi text. The validator allows this combination for NEET.

### 19.5 Question Numbering Gaps
Some PDFs have missing question numbers (e.g., Q1, Q2, Q4 -- Q3 is missing). The pipeline preserves the original numbering. numberLabel captures the original, while number is sequential. Example: Q1 (number=1, numberLabel="1"), Q2 (number=2, numberLabel="2"), Q4 (number=3, numberLabel="4").

### 19.6 Inconsistent Marking Schemes
JEE Main 2021 had +4/-1 for all questions. JEE Main 2023 had +4/-1 for MCQ and +4/0 for NAT. NEET has +4/-1 for all. The paper.json metadata captures the per-paper marking scheme. Individual questions can override.

### 19.7 Fragmented Tables
When a question uses a table layout (chemistry periodic table questions), Mistral OCR may fragment it across pages. The structurer reassembles tables by matching row headers across consecutive pages. Falls back to raw markdown table if reassembly fails.

### 19.8 Super-Scripts and Sub-Scripts
Chemical formulas (H2O, SO4^2-) are normalized to Unicode: subscript numbers and superscript charges. Example: H2O -> H\u2082O, E = mc^2 -> E = mc\u00b2. normalizer.ts handles this.

### 19.9 Duplicate Questions Across Shifts
JEE Main often repeats questions across shifts with different numbers. hash-utils.ts computes SHA-256 of (text + options) to detect duplicates. Duplicates are NOT removed from individual shift files, but all-duplicates.json at the dataset root lists all duplicates for dedup when building the master set.

### 19.10 Corrupted PDFs
pdf-downloader.ts validates PDF magic bytes (%PDF at start). If corrupted, retries with exponential backoff (3 attempts). If all fail, logs the URL for manual download.


---

## 20. Development Setup & Commands

```bash
# Clone and setup
cd C:\QUESTION-PIPELINE
npm install
npx tsc --init

# Run a scraper
npx ts-node src/scrapers/nta-scraper.ts --exam jeemain --year 2025

# Batch process a shift
npx ts-node scripts/batch-process.ts --exam jeemain --year 2025 --shift 22jan-shift1

# Launch review
npx ts-node src/review/review-cli.ts --exam jeemain --year 2025 --shift 22jan-shift1

# Verify integrity
npx ts-node src/utils/integrity.ts --path ./data

# Generate statistics
npx ts-node scripts/stats.ts

# Export for open source
npx ts-node scripts/export-for-opensource.ts --license cc-by-4.0 --output ./export

# Start API server
npx ts-node src/api/server.ts --port 3456
```

### Environment Variables

```
# Required (set in .env, gitignored)
MISTRAL_API_KEY=your_key_here
CEREBRAS_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
KAGGLE_USERNAME=your_username
KAGGLE_KEY=your_key

# Optional
EDITOR=code          # Editor for review CLI edit mode
LOG_LEVEL=info       # debug | info | warn | error
PDF_TEMP_DIR=./temp  # Where to store downloaded PDFs
```

### Dependencies

| Package | Purpose |
|---|---|
| typescript | Type checking |
| ts-node | Run TS directly |
| @types/node | Node type definitions |
| node-fetch (or built-in fetch) | HTTP requests to APIs |
| No other dependencies required | Minimal footprint |


---

## 21. Detailed File Descriptions

### src/types.ts
Single source of truth for all shared types. Contains ALL interfaces: QuestionFile, Question, Passage, Diagram, AnswerPrecision, SectionConfig, ValidationResult, ValidationFlag, PartialQuestion, QuestionType, etc. Every module imports from here.

### src/index.ts
CLI entry point. Parses command-line arguments (commander or manual argv parsing). Dispatches to the correct module based on the command: scrape, extract, validate, review, export, stats.

### src/scrapers/nta-scraper.ts
Exports scrapeNta(exam, year). Generates date patterns for the given exam and year. For JEE Main: January session (22jan, 23jan, 24jan...), April session (04apr, 05apr...). For NEET: typically 04may, 05may. Constructs URLs, validates responses, downloads PDFs. Returns array of { shift, filePath, url }.

### src/scrapers/gateoverflow-scraper.ts
Scrapes gateoverflow.in HTML pages to find download links for older JEE papers. Uses basic HTML parsing (regex or cheerio). Falls back to Wayback Machine if the primary link is dead.

### src/scrapers/ncert-scraper.ts
Downloads NCERT Exemplar PDFs from ncert.nic.in. Class 11: physics (part 1 + 2), chemistry (part 1 + 2), mathematics, biology. Class 12: physics (part 1 + 2), chemistry (part 1 + 2), mathematics, biology. Each PDF is 50-200 pages.

### src/scrapers/kaggle-importer.ts
Uses Kaggle API (if configured) or downloads from HuggingFace datasets. Maps the source schema to our canonical schema. Column mapping is configurable via a mapping file. Sets source = "imported-kaggle" or "imported-dataset".

### src/extractors/ocr-stage.ts
Exports async function ocrPdf(filePath: string): Promise<OcrResult>. Sends PDF to Mistral OCR API. Handles multipart upload for large PDFs. Returns per-page markdown and base64 images. Rate-limited to stay within Mistral's 1000 pages/min free tier.

### src/extractors/structurer.ts
Exports async function structureToJson(pages: PageContent[], exam: ExamConfig): Promise<PartialQuestion[]>. Builds a prompt from the page markdowns. Handles the backfill logic for answer keys. Detects passages. Returns partial questions without IDs or normalizations.

### src/extractors/diagram-cacher.ts
Exports async function cacheDiagrams(questions: PartialQuestion[], images: Map<number, string>, outputDir: string): Promise<void>. Takes the base64 images from Mistral, matches them to questions that reference diagrams, and saves PNGs to disk. Updates the diagrams field in each question.

### src/validators/auto-validator.ts
Exports function validate(questions: Question[]): ValidationResult[]. Runs 30+ checks. Returns per-question validation results with error/warning/info flags. Does NOT modify questions. Used both pre-review (to auto-accept obvious correct questions) and post-edit (to re-validate after human edit).

### src/finalizers/id-assigner.ts
Exports function assignIds(questions: PartialQuestion[], exam: string, year: number, shift: string): Question[]. Generates stable IDs per the scheme in Section 3. Ensures no collisions by tracking a set of existing IDs. Returns questions with IDs attached.

### src/finalizers/normalizer.ts
Exports function normalizeText(text: string): string. Converts LaTeX math to Unicode. Example: \\alpha -> \u03b1, \\rightarrow -> \u2192, \\frac{a}{b} -> a/b or proper Unicode fraction. Also normalizes whitespace, removes extra newlines, and fixes common OCR errors.

### src/review/review-cli.ts
Interactive terminal UI. Uses readline for keypress handling. Splits terminal into two panes: left = PDF snippet, right = extracted JSON. Accepts keyboard input for operations. Reads/writes .review-progress.json for session persistence.

### src/api/server.ts
Express.js or built-in http server on port 3456. Serves JSON files from data/ directory. All endpoints return JSON with consistent response format. CORS enabled for local development. Diagrams served as static files.

### src/utils/integrity.ts
Exports function verifyChecksums(dataDir: string): IntegrityReport. Walks all JSON files, recomputes SHA-256, compares against stored checksum. Returns report of passed/failed/missing checksums. Failed files are flagged in metadata.

### scripts/batch-process.ts
Orchestrates the full pipeline for a single shift: download -> OCR -> structure -> validate -> save. Optionally launches review after save. Logs each step with timing. Returns exit code 0 on success.

### scripts/export-for-opensource.ts
Reads all verified datasets. Strips internal fields (revision, source, checksum, scrapedAt). Adds attribution and license field. Writes to export/ directory grouped by exam and subject. Does NOT modify data/ files.


---

## 22. Known Non-Flaws (Deliberate Design Decisions)

These might look like flaws on first glance, but are intentional design decisions:

| Issue | Explanation |
|---|---|
| No Docker | Pipeline runs locally on your Windows machine. Docker adds complexity with zero benefit for a CLI tool that downloads files and writes JSON |
| No database | Data is file-based. JSON files are the database. Indexing via index.json. A DB would add latency and dependency |
| No compression | JSON with whitespace is ~50 MB total for 15k questions. Compression saves ~10 MB at the cost of readability. Not worth it |
| No TypeScript at runtime | We compile to JS with tsc. The source is TS, the output is JS. Standard practice |
| No web framework (Express/Fastify) | The API server is optional. If installed, Express is ~50KB. If using built-in http, zero dependencies |
| No CI/CD | Private repo. No need for CI until open-source |
| Single human reviewer | Future multi-reviewer system is planned but adds complexity. Single reviewer with random spot-checking achieves 100% accuracy for structured data |
| No rate limit between extract and review | Review is manual. Rate limits only matter for API calls (Mistral, Cerebras, Gemini) which are handled by rate-limiter.ts |

---
