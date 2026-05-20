# Question Pipeline — Complete Plan v2

## Overview

A standalone batch pipeline that downloads Indian exam PDFs (JEE Main, JEE Advanced, NEET UG, NCERT Exemplar), extracts questions with **100% verified accuracy** via AI extraction → human verification, and outputs clean structured JSON files ready for API consumption.

This is a **separate private repository** — NOT part of the Rankify web app. It runs locally on your machine, produces JSON datasets, which are then served to Rankify via an API endpoint.

**Golden rule:** Everything in this pipeline is **lowercase** — exam names, directory names, file names, shift names, subject codes. APIs are case-sensitive, sorting breaks on mixed case, and lowercase eliminates ALL casing bugs.

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [JSON Schema (Canonical Format)](#2-json-schema-canonical-format)
3. [File Organization & Naming](#3-file-organization--naming)
4. [Pipeline Flow](#4-pipeline-flow)
5. [Module Deep-Dive](#5-module-deep-dive)
6. [Scrapers Detail](#6-scrapers-detail)
7. [Extraction Detail — 100% Accuracy Strategy](#7-extraction-detail--100-accuracy-strategy)
8. [Human Review Workflow CLI](#8-human-review-workflow-cli)
9. [Scripts & Automation](#9-scripts--automation)
10. [API Endpoint Design](#10-api-endpoint-design)
11. [Exporting for Open-Source](#11-exporting-for-open-source)
12. [Rankify Adapter (Zero Changes)](#12-rankify-adapter-zero-changes)
13. [Free Tier Limits & Rate Limiting](#13-free-tier-limits--rate-limiting)
14. [Implementation Order](#14-implementation-order)
15. [Diagram Storage Strategy](#15-diagram-storage-strategy)
16. [Future Scope](#16-future-scope)
17. [Flaws Fixed from v1 (v1 → v2 Changes)](#17-flaws-fixed-from-v1-v1--v2-changes)

---

## 1. Repository Structure

```
C:\QUESTION-PIPELINE\
│
├── plan.md                           # This file
├── package.json                      # Dependencies (none outside Node built-ins + fetch)
├── tsconfig.json                     # TypeScript config
│
├── src/
│   ├── index.ts                      # CLI entry point
│   ├── types.ts                      # All shared types
│   │
│   ├── scrapers/
│   │   ├── nta-scraper.ts            # JEE Main / NEET from NTA official
│   │   ├── gateoverflow-scraper.ts   # JEE mirrors from gateoverflow
│   │   ├── ncert-scraper.ts          # NCERT Exemplar PDFs
│   │   └── kaggle-importer.ts        # Import existing Kaggle/HF datasets
│   │
│   ├── extractors/
│   │   ├── ocr-stage.ts              # Mistral OCR → per-page markdown
│   │   ├── structurer.ts             # Markdown → JSON (Cerebras)
│   │   └── diagram-cacher.ts         # Save base64 diagram images to disk as PNG
│   │
│   ├── validators/
│   │   ├── auto-validator.ts          # Automated consistency checks
│   │   ├── field-checker.ts           # Per-field validation rules
│   │   └── cross-validator.ts         # Multi-model comparison (future)
│   │
│   ├── finalizers/
│   │   ├── id-assigner.ts            # Stable ID generation
│   │   ├── normalizer.ts             # Unicode/text/LaTeX normalization
│   │   ├── topic-normalizer.ts       # Map extracted topics to controlled vocabulary
│   │   └── exporter.ts              # Write JSON files + diagrams to data/
│   │
│   ├── review/
│   │   ├── review-cli.ts             # Interactive CLI for human verification
│   │   ├── pdf-renderer.ts           # Render PDF page snippet for comparison
│   │   └── batch-signoff.ts          # Sign off entire shifts
│   │
│   ├── api/
│   │   └── server.ts                 # Optional local API server for testing
│   │
│   ├── utils/
│   │   ├── pdf-downloader.ts         # Download with retry + validation
│   │   ├── rate-limiter.ts           # Respect API free tier limits
│   │   ├── hash-utils.ts             # File hashing for dedup + integrity
│   │   ├── logger.ts                 # Structured console logging
│   │   └── integrity.ts             # SHA-256 checksum verification for JSON files
│   │
│   ├── adapters/
│   │   └── rankify-adapter.ts        # Canonical → Rankify TestSessionQuestionData
│   │
│   └── topic-vocabulary.ts           # Controlled topic list for normalization
│
├── data/
│   ├── index.json                    # Master index of all datasets
│   │
│   ├── jeemain/
│   │   ├── metadata.json             # Scraped URLs, verification status per shift
│   │   ├── 2025/
│   │   │   ├── 22jan-shift1/
│   │   │   │   ├── paper.json        # Full 90-question paper
│   │   │   │   ├── physics.json      # Subject-split
│   │   │   │   ├── chemistry.json
│   │   │   │   ├── mathematics.json
│   │   │   │   └── diagrams/
│   │   │   │       ├── physics/
│   │   │   │       │   ├── q001.png
│   │   │   │       │   ├── q002.png
│   │   │   │       │   └── ...
│   │   │   │       ├── chemistry/
│   │   │   │       └── mathematics/
│   │   │   ├── 22jan-shift2/
│   │   │   │   └── ...
│   │   │   └── 23jan-shift1/
│   │   │       └── ...
│   │   ├── 2024/
│   │   │   └── ...
│   │   └── all-physics.json          # All-time physics (for cross-exam queries)
│   │
│   ├── neet/
│   │   ├── metadata.json
│   │   ├── 2025/
│   │   │   ├── 04may/
│   │   │   │   ├── paper.json
│   │   │   │   ├── physics.json
│   │   │   │   ├── chemistry.json
│   │   │   │   ├── biology.json
│   │   │   │   └── diagrams/
│   │   │   │       ├── physics/
│   │   │   │       ├── chemistry/
│   │   │   │       └── biology/
│   │   │   └── 05may/
│   │   │       └── ...
│   │   ├── 2024/
│   │   │   └── ...
│   │   └── all-physics.json
│   │
│   ├── jeeadv/
│   │   ├── metadata.json
│   │   ├── 2025/
│   │   │   ├── paper1/
│   │   │   │   ├── paper.json
│   │   │   │   ├── physics.json
│   │   │   │   ├── chemistry.json
│   │   │   │   ├── mathematics.json
│   │   │   │   └── diagrams/
│   │   │   └── paper2/
│   │   │       └── ...
│   │   └── ...
│   │
│   ├── ncert-exemplar/
│   │   ├── metadata.json
│   │   ├── class-11/
│   │   │   ├── physics.json
│   │   │   ├── chemistry.json
│   │   │   ├── biology.json
│   │   │   └── diagrams/
│   │   │       ├── physics/
│   │   │       ├── chemistry/
│   │   │       └── biology/
│   │   └── class-12/
│   │       ├── physics.json
│   │       ├── chemistry.json
│   │       └── diagrams/
│   │
│   └── kaggle-public/
│       ├── metadata.json
│       └── raw-import.json           # As-imported (before re-verification)
│
├── scripts/
│   ├── batch-process.ts              # Download + extract + validate all pending
│   ├── verify-all.ts                 # Run human review on all unverified
│   ├── rebuild-index.ts              # Regenerate data/index.json from files on disk
│   ├── export-for-opensource.ts      # Strip internal fields, add attribution
│   └── stats.ts                      # Show dataset statistics
│
└── .review-progress.json             # Review CLI session persistence (gitignored)
```

---

## 2. JSON Schema (Canonical Format)

### Paper-Level Wrapper (`paper.json`)

All field names are lowercase. All string values are lowercase. No mixed case anywhere.

```jsonc
{
  "schema": "v2",
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
  "scrapedAt": "2026-05-19T00:00:00Z",
  "checksum": "sha256-abc123...",
  "questions": [
    /* Question[] */
  ]
}
```

### Subject-Level Wrapper (`physics.json`)

```jsonc
{
  "schema": "v2",
  "exam": "jeemain",
  "year": 2025,
  "shift": "22jan-shift1",
  "paper": null,
  "subject": "physics",
  "total": 30,
  "duration": 180,
  "marksCorrect": 4,
  "marksIncorrect": -1,
  "marksUnanswered": 0,
  "scrapedAt": "2026-05-19T00:00:00Z",
  "checksum": "sha256-def456...",
  "questions": [
    /* 30 Question[] */
  ]
}
```

### JEE Advanced Wrapper (uses `paper` instead of `shift`)

```jsonc
{
  "schema": "v2",
  "exam": "jeeadv",
  "year": 2025,
  "shift": null,
  "paper": "paper1",
  "subjects": ["physics", "chemistry", "mathematics"],
  "total": 54,
  "duration": 180,
  "marksCorrect": 4,
  "marksIncorrect": -1,
  "marksUnanswered": 0,
  "scrapedAt": "2026-05-19T00:00:00Z",
  "questions": []
}
```

### Individual Question

```jsonc
{
  "id": "jeemain-2025-22jan-s1-ph-001",
  "number": "1",
  "numberLabel": "1",
  "subject": "physics",
  "topic": "kinematics",
  "section": "a",
  "type": "mcq",
  "text": "A particle moves along the x-axis with velocity v(t) = 2t m/s. What is its displacement from t = 0 to t = 3 s?",

  "options": [
    "6 m",
    "9 m",
    "12 m",
    "18 m"
  ],

  "answer": "2",
  "answers": null,
  "marks": 4,
  "negativeMarks": -1,
  "solution": "s = ∫₀³ v dt = ∫₀³ 2t dt = [t²]₀³ = 9 - 0 = 9 m",

  "hasDiagram": false,
  "diagramFile": null,

  "difficulty": "easy",
  "tags": ["kinematics", "calculus", "integration"],

  "revision": 1
}
```

### TypeScript Interface

```typescript
// src/types.ts

// === Canonical schema ===

interface QuestionFile {
  schema: string              // "v2"
  exam: ExamName
  year: number
  shift: string | null        // null for jeeadv (uses paper instead)
  paper: string | null        // "paper1" | "paper2" | null for non-jeeadv
  subject?: string            // Only in subject-split files
  subjects?: string[]         // Only in paper.json
  total: number
  duration: number
  marksCorrect: number
  marksIncorrect: number
  marksUnanswered: number
  scrapedAt: string           // ISO date
  checksum: string            // "sha256-<hex>" — SHA-256 of all questions combined
  questions: Question[]
}

interface Question {
  id: string
  number: string              // "1" | "1a" | "1b" — string to support sub-questions
  numberLabel: string         // Human-readable: "1" | "1(a)" | "Q1"
  subject: string
  topic: string
  section: string             // "a" | "b" | "i" | "ii"
  type: QuestionType
  text: string
  options: string[] | null    // null for NAT
  answer: string | null       // Single answer: "2" (index) | "42" (NAT value) | null
  answers: string[] | null    // Multiple answers for MSQ: ["1", "3"] | null
  marks: number
  negativeMarks: number
  solution: string | null
  hasDiagram: boolean
  diagramFile: string | null  // "diagrams/physics/q001.png" — relative to shift dir
  difficulty: string | null   // "easy" | "medium" | "hard" | null
  tags: string[]
  revision: number            // Incremented each time the question is corrected
}

type ExamName = 'jeemain' | 'jeeadv' | 'neet' | 'ncert-exemplar' | 'other'
type QuestionType = 'mcq' | 'msq' | 'nat' | 'match' | 'assertion-reason'

// === Internal types (not exported to JSON) ===

interface ExtractionResult {
  questions: Question[]
  extractionLog: string       // Which model, what time, which chunks
  imageMap: Map<string, string>  // imageId → base64 data
}

interface VerificationStatus {
  id: string                  // matches dataset identifier
  status: 'pending' | 'verified' | 'needs-correction'
  verifiedBy: string | null
  verifiedAt: string | null
}
```

### ID Scheme

```
{exam}-{year}-{shift-shorthand}-{subject-code}-{number padded 3}

Subject codes:
  physics    → ph
  chemistry  → ch
  mathematics → ma
  biology    → bi

Examples:
  jeemain-2025-22jan-s1-ph-001
  jeemain-2025-22jan-s1-ch-015
  jeemain-2025-23jan-s2-ma-030
  neet-2025-04may-ph-045
  jeeadv-2025-p1-ph-012
  ncert-exemplar-11-ph-023

For JEE Advanced (paper instead of shift):
  jeeadv-2025-p1-ph-001    # Paper 1
  jeeadv-2025-p2-ch-015    # Paper 2
```

All lowercase. Hyphen-separated. Reversible — exam, year, shift/paper, subject, and number are all extractable from the ID.

---

## 3. File Organization & Naming

```
data/jeemain/2025/22jan-shift1/
├── paper.json              # Full 90 questions
├── physics.json            # 30 questions (subject split)
├── chemistry.json          # 30 questions
├── mathematics.json        # 30 questions
└── diagrams/
    ├── physics/
    │   ├── q001.png        # Question 1's diagram
    │   ├── q002.png
    │   └── ...
    ├── chemistry/
    └── mathematics/
```

**Rules:**
- All directory names lowercase with hyphens: `22jan-shift1`, not `22Jan-Shift1`
- Shift directory name = normalized lowercase shift string from NTA
- JEE Advanced uses `paper1/`, `paper2/` instead of shift names
- NEET uses dates: `04may/`, `05may/`
- Each shift dir gets `paper.json` + per-subject files + `diagrams/` subdirectory
- Subject files contain the **same** question objects as `paper.json`, just filtered
- `all-physics.json` at exam level = concatenation of all physics across all shifts/years
- Every JSON file has a `checksum` field for integrity verification
- `metadata.json` per exam tracks scrape sources + verification progress (not checksummed — it's a living document)

**NCERT Exemplar structure (no shifts):**
```
data/ncert-exemplar/
├── metadata.json
├── class-11/
│   ├── physics.json
│   ├── chemistry.json
│   ├── biology.json
│   └── diagrams/
│       ├── physics/
│       ├── chemistry/
│       └── biology/
└── class-12/
    ├── physics.json
    ├── chemistry.json
    └── diagrams/
```

---

## 4. Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          WEB SCRAPING                                   │
│                                                                         │
│  nta-scraper.ts  ───►  gateoverflow-scraper.ts  ───►  ncert-scraper.ts │
│                                                                         │
│  Output: PDF files stored in a temporary directory                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ PDF
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 1: OCR                                       │
│                                                                         │
│  ocr-stage.ts ───►  Mistral OCR API  ───►  Per-page markdown           │
│                                                                         │
│  • One API call per PDF (handles entire doc)                           │
│  • Returns markdown + base64 images for diagrams                       │
│  • Progress: 0 → 40%                                                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ markdown
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 2: STRUCTURING                               │
│                                                                         │
│  structurer.ts ───►  Cerebras (≤12pgs) / Gemini (>12pgs)               │
│                                                                         │
│  • OCR markdown → structured JSON array                                 │
│  • Cerebras: ~3s for 12 pages, 3000 t/s                                │
│  • Includes answer key detection (Time-Travel Backfill)                 │
│  • Progress: 40 → 75%                                                  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ Raw JSON (80-95% accurate)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 3: DIAGRAM CACHING                           │
│                                                                         │
│  diagram-cacher.ts                                                      │
│                                                                         │
│  • For each question with hasDiagram=true,                             │
│  • Look up imageId in Mistral OCR's image map                          │
│  • Decode base64 → PNG file                                            │
│  • Save to diagrams/{subject}/q{number-padded-3}.png                   │
│  • Set diagramFile in question JSON                                    │
│  • Progress: 75 → 80%                                                  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ JSON with diagramFile paths
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 4: AUTO-VALIDATION                           │
│                                                                         │
│  auto-validator.ts ────►  field-checker.ts                             │
│                                                                         │
│  Checks per question:                                                   │
│  ✅ Options count matches type (mcq=4, msq=4-5, nat=0)                 │
│  ✅ Answer format matches type (index for mcq, number for nat)          │
│  ✅ Text length > 10 chars                                              │
│  ✅ No duplicate options                                                │
│  ✅ No OCR artifacts (encoding issues)                                  │
│  ✅ Subject non-empty                                                   │
│  ✅ Section non-empty                                                   │
│  ✅ Marks match typical pattern                                         │
│  ✅ Question numbers are sequential                                     │
│  ✅ Topic is from controlled vocabulary (auto-corrected if off)        │
│  ✅ diagramFile exists on disk if hasDiagram=true                       │
│  ✅ All values are lowercase where applicable                          │
│                                                                         │
│  Output: same JSON + per-question validation report                    │
│  Auto-fixes: option label stripping, newline cleanup, topic correction  │
│  Progress: 80 → 90%                                                    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ Validated JSON + flags
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 5: HUMAN VERIFICATION                        │
│                                                                         │
│  review-cli.ts + pdf-renderer.ts                                        │
│                                                                         │
│  Step-by-step interactive review:                                      │
│  ┌─────────────────────────────────────────────────┐                   │
│  │  [24/90]  physics  section a                   │                   │
│  │                                                 │                   │
│  │  PDF SNIPPET:                                   │                   │
│  │  ┌─────────────────────────────────────────┐   │                   │
│  │  │ 24. A particle moves along...           │   │                   │
│  │  │     (1) 6 m     (2) 9 m                 │   │                   │
│  │  │     (3) 12 m    (4) 18 m                │   │                   │
│  │  └─────────────────────────────────────────┘   │                   │
│  │                                                 │                   │
│  │  EXTRACTED:                                    │                   │
│  │  text:    A particle moves along...            │                   │
│  │  options: 6 m | 9 m | 12 m | 18 m             │                   │
│  │  answer:  2 (9 m)                              │                   │
│  │                                                 │                   │
│  │  [a] Accept  [e] Edit  [s] Skip  [q] Quit     │                   │
│  └─────────────────────────────────────────────────┘                   │
│                                                                         │
│  Progress: 90 → 100%                                                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ 100% verified JSON
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 6: FINALIZE                                   │
│                                                                         │
│  id-assigner.ts → normalizer.ts → topic-normalizer.ts → exporter.ts     │
│                                                                         │
│  • Assign stable IDs                                                    │
│  • Normalize Unicode (convert LaTeX to readable text)                   │
│  • Map extracted topics to controlled vocabulary                        │
│  • Strip option label prefixes                                          │
│  • Validate all values are lowercase                                    │
│  • Compute SHA-256 checksum                                             │
│  • Write JSON files + diagrams to data/                                 │
│  • Rebuild data/index.json                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Module Deep-Dive

### `src/extractors/ocr-stage.ts`

```typescript
interface OcrInput {
  pdfBuffer: ArrayBuffer
  fileName: string
}

interface OcrOutput {
  pages: MistralOcrPage[]
  totalChars: number
  totalImages: number
  imagesWithBase64: number
}

export async function runOcr(input: OcrInput): Promise<OcrOutput> {
  // 1. Convert PDF to data URL
  // 2. Send to Mistral OCR API (1 request for entire PDF)
  // 3. Handle chunking if base64 payload > 3.5MB (split into 5-page batches via pdf-lib)
  // 4. Return structured OCR pages with image map
  // 5. Image map: imageId → { bbox coordinates, base64 data }
}
```

### `src/extractors/structurer.ts`

```typescript
export async function structureToJson(
  ocrMarkdown: string,
  pageCount: number,
  subject?: string         // Pre-set subject for NCERT Exemplars
): Promise<ExtractionResult> {
  // 1. Build system prompt with JSON schema instructions
  // 2. Split markdown into chunks if >12 pages
  // 3. Model selection:
  //    ≤12 pages → Cerebras (qwen-3-235b, 3000 t/s, free)
  //    >12 pages → Gemini (gemini-2.5-flash, free tier)
  // 4. Each chunk → independent API call
  // 5. Merge results: separate questions + answer keys
  // 6. Time-Travel Backfill: retroactively match answer keys to questions
  // 7. Attach diagram references from image map
  // 8. Return ExtractionResult with questions + imageMap
}
```

### `src/extractors/diagram-cacher.ts`

```typescript
export async function cacheDiagrams(
  questions: Question[],
  imageMap: Map<string, string>,    // imageId → base64 data
  shiftDir: string                  // e.g., "data/jeemain/2025/22jan-shift1"
): Promise<void> {
  for (const q of questions) {
    if (!q.hasDiagram) continue

    const imgBase64 = imageMap.get(q.diagramImageId)
    if (!imgBase64) {
      console.warn(`Missing diagram for ${q.id}`)
      continue
    }

    const subjectDir = path.join(shiftDir, 'diagrams', q.subject)
    ensureDir(subjectDir)

    const filePath = path.join(subjectDir, `q${padNumber(q.number, 3)}.png`)
    const pngBuffer = Buffer.from(imgBase64, 'base64')
    await writeFile(filePath, pngBuffer)

    // Update question with relative path
    q.diagramFile = `diagrams/${q.subject}/q${padNumber(q.number, 3)}.png`
  }
}
```

### `src/validators/auto-validator.ts`

```typescript
interface ValidationResult {
  passed: boolean
  issues: ValidationIssue[]
  autoFixes: AutoFix[]
}

export function validateQuestion(q: Question): ValidationResult {
  const issues: ValidationIssue[] = []
  const autoFixes: AutoFix[] = []

  // 1. text length ≥ 10
  if (q.text.length < 10) issues.push({ field: 'text', message: 'too short' })

  // 2. options count vs type
  if (q.type === 'mcq' && (q.options.length < 3 || q.options.length > 5))
    issues.push({ field: 'options', message: `mcq has ${q.options.length} options` })
  if (q.type === 'nat' && q.options.length > 0) {
    autoFixes.push({ field: 'options', from: q.options, to: null })
    q.options = null
  }

  // 3. answer format vs type
  if (q.type === 'mcq' && q.answer !== null && !/^\d+$/.test(q.answer))
    issues.push({ field: 'answer', message: 'mcq answer must be numeric index' })

  // 4. encoding artifacts
  if (/[□â€™â€œÃ¡Ã©\\uFFFD]/.test(q.text))
    issues.push({ field: 'text', message: 'encoding artifacts detected' })

  // 5. subject non-empty + lowercase
  if (!q.subject) issues.push({ field: 'subject', message: 'missing' })
  if (q.subject !== q.subject.toLowerCase()) {
    autoFixes.push({ field: 'subject', from: q.subject, to: q.subject.toLowerCase() })
    q.subject = q.subject.toLowerCase()
  }

  // 6. section lowercase
  if (q.section !== q.section.toLowerCase()) {
    autoFixes.push({ field: 'section', from: q.section, to: q.section.toLowerCase() })
    q.section = q.section.toLowerCase()
  }

  // 7. diagramFile exists on disk if hasDiagram
  if (q.hasDiagram && q.diagramFile) {
    if (!existsSync(q.diagramFile))
      issues.push({ field: 'diagramFile', message: 'file not found on disk' })
  }

  // 8. revision >= 1
  if (!q.revision || q.revision < 1) {
    q.revision = 1
  }

  return { passed: issues.length === 0, issues, autoFixes }
}
```

### `src/finalizers/id-assigner.ts`

```
jeemain-2025-22jan-s1-ph-001
│      │     │    │   │  │  │
│      │     │    │   │  │  └── 3-digit number
│      │     │    │   │  └── subject code (ph/ch/ma/bi)
│      │     │    │   └── shift number (s1/s2)
│      │     │    └── shift date shorthand (22jan)
│      │     └── year
│      └── exam code (all lowercase)
```

### `src/finalizers/normalizer.ts`

```typescript
export function normalizeText(text: string): string {
  return text
    // Strip LaTeX delimiters
    .replace(/\$\$(.*?)\$\$/g, '$1')
    .replace(/\$(.*?)\$/g, '$1')
    .replace(/\\\((.*?)\\\)/g, '$1')
    .replace(/\\\[(.*?)\\\]/g, '$1')
    // LaTeX commands → Unicode
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\implies/g, '⇒')
    .replace(/\\approx/g, '≈')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\propto/g, '∝')
    .replace(/\\infty/g, '∞')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\theta/g, 'θ')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\mu/g, 'μ')
    .replace(/\\pi/g, 'π')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\gamma/g, 'γ')
    // Superscripts
    .replace(/\^\{([^}]+)\}/g, '^$1')
    .replace(/\^(\d)/g, '^$1')
    // Subscripts
    .replace(/\_\{([^}]+)\}/g, '_{$1}')
    .replace(/\_(\d)/g, '_{$1}')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}
```

### `src/finalizers/topic-normalizer.ts`

```typescript
// Controlled vocabulary of topics
// Maps common AI extractions → canonical form
const topicMap: Record<string, string> = {
  // Physics
  'kinematics': 'kinematics',
  'kinematics-1d': 'kinematics',
  'motion in 1d': 'kinematics',
  'motion in one dimension': 'kinematics',
  'motion in straight line': 'kinematics',
  'newtons laws': 'newtons-laws',
  'newtons law': 'newtons-laws',
  'nlm': 'newtons-laws',
  'work energy power': 'work-energy-power',
  'work power energy': 'work-energy-power',
  'electrostatics': 'electrostatics',
  'electrostatic': 'electrostatics',
  // Chemistry
  'organic chemistry': 'organic-chemistry',
  'organic': 'organic-chemistry',
  'inorganic chemistry': 'inorganic-chemistry',
  'inorganic': 'inorganic-chemistry',
  'physical chemistry': 'physical-chemistry',
  'physical': 'physical-chemistry',
  'mole concept': 'mole-concept',
  'stoichiometry': 'mole-concept',
  // Mathematics
  'calculus': 'calculus',
  'differentiation': 'calculus',
  'integration': 'calculus',
  'integrals': 'calculus',
  'vectors': 'vectors',
  '3d geometry': '3d-geometry',
  'three dimensional geometry': '3d-geometry',
  'probability': 'probability',
  // Biology
  'cell biology': 'cell-biology',
  'cell the unit of life': 'cell-biology',
  'genetics': 'genetics',
  'principle of inheritance': 'genetics',
  'ecology': 'ecology',
  'ecosystem': 'ecology',
}

export function normalizeTopic(raw: string): string {
  const normalized = raw.toLowerCase().trim()
  return topicMap[normalized] ?? normalized.replace(/\s+/g, '-')
}
```

### `src/finalizers/exporter.ts`

```typescript
import { createHash } from 'crypto'

export async function exportDataset(
  questions: Question[],
  metadata: {
    exam: string
    year: number
    shift: string | null
    paper: string | null
    subjects: string[]
    duration: number
    marksCorrect: number
    marksIncorrect: number
    marksUnanswered: number
  }
): Promise<void> {
  const baseDir = path.join('data', metadata.exam, String(metadata.year), metadata.shift ?? metadata.paper!)
  ensureDir(baseDir)

  const wrapper = {
    schema: 'v2',
    ...metadata,
    total: questions.length,
    scrapedAt: new Date().toISOString(),
    checksum: '',  // computed below
    questions,
  }

  // Compute checksum over questions only (ignores wrapper fields)
  const hash = createHash('sha256')
  for (const q of questions) {
    hash.update(JSON.stringify(q, Object.keys(q).sort()))
  }
  wrapper.checksum = `sha256-${hash.digest('hex')}`

  // Full paper
  await writeJson(path.join(baseDir, 'paper.json'), wrapper)

  // Subject splits
  for (const subject of metadata.subjects) {
    const subjectQuestions = questions.filter(q => q.subject === subject)
    await writeJson(path.join(baseDir, `${subject}.json`), {
      ...wrapper,
      subject,
      total: subjectQuestions.length,
      questions: subjectQuestions,
    })
  }
}
```

### `src/utils/integrity.ts`

```typescript
import { createHash } from 'crypto'

export function verifyChecksum(filePath: string): boolean {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'))
  const expectedChecksum = data.checksum

  // Recompute hash from questions only
  const hash = createHash('sha256')
  for (const q of data.questions) {
    hash.update(JSON.stringify(q, Object.keys(q).sort()))
  }
  const actualChecksum = `sha256-${hash.digest('hex')}`

  return expectedChecksum === actualChecksum
}

export async function verifyAllDatasets(baseDir: string = 'data'): Promise<void> {
  // Walk data/ directory, find all JSON files, verify checksums
  // Report any corruption
}
```

---

## 6. Scrapers Detail

### `nta-scraper.ts`

```
Source: https://jeemain.nta.nic.in / https://neet.nta.nic.in
Pattern: JEEMAIN(2025)_(ShiftCode)_(PaperCode).pdf

Strategy:
1. Fetch known URL patterns for each year
2. Verify PDF (check %PDF header, valid page count)
3. Download to temp directory
4. Return list of { pdfBuffer, metadata }

URL patterns:
  https://jeemain.nta.nic.in/2025/JEEMAIN_22Jan_Shift1_E.pdf
  https://jeemain.nta.nic.in/2024/JEEMAIN_24Jan_Shift1_M.pdf

Output directory name: "22jan-shift1" (lowercased, hyphenated)
```

### `gateoverflow-scraper.ts`

```
Source: https://jeemain.gateoverflow.in
Pattern: /year/shift/papercode

Strategy:
1. Scrape directory listing
2. Download each PDF
3. Dedup against NTA originals (SHA-256 file hash comparison)
4. Fill gaps that NTA site doesn't have
```

### `ncert-scraper.ts`

```
Source: https://ncert.nic.in/textbook.php
Pattern: Class 11/12 → Science → Exemplar Problem

Strategy:
1. Download 6 NCERT Exemplar PDFs:
   - Class 11 Physics, Chemistry, Biology
   - Class 12 Physics, Chemistry, Biology
2. Each PDF has ~200-300 questions
3. Extract using same pipeline, but subject is pre-set
4. Output: data/ncert-exemplar/class-11/physics.json
```

### `kaggle-importer.ts`

```
Sources:
- Kaggle: "JEE Main Previous Year Questions" (~3000 Q, CC0)
- HuggingFace: "NEET-PYQ" (~2800 Q, MIT)
- GitHub: "ncert-exemplar-solutions" (~2300 Q)

Strategy:
1. Import raw JSON as-is
2. Normalize to canonical Question format
3. Mark revision=1
4. These need human re-verification (confidence unknown)
5. After review, revision is bumped
```

---

## 7. Extraction Detail — 100% Accuracy Strategy

The core philosophy: **AI gets 80-95% right. Human catches the rest. Result is 100% forever.**

### Why This Works

| Method | Accuracy | Cost | Speed |
|--------|----------|------|-------|
| Single AI model | 85-92% | Free | ~2000 Q/hr |
| AI + auto-validation | 90-95% | Free | ~1800 Q/hr |
| AI + auto-validation + human review | **100%** | Your time | ~360 Q/hr |

With **one model + auto-validation + human review** on a 90-question JEE paper:
- AI gets ~78 right perfectly
- Auto-validation fixes ~5 more (option formatting, answer normalization, topic correction)
- AI flags ~7 as low-confidence
- Human reviews all 90 in ~15 minutes at 3 sec/Q
- Catches remaining 2-5 AI errors
- **Result: 100% verified dataset forever**

Total per paper: ~30 sec AI + ~15 min human = **~15.5 min/paper**

For 2025 JEE Main (24 shifts): **~6.2 hours total review**

### Confidence Levels in Human Review

| Level | Meaning | Auto-action |
|-------|---------|-------------|
| 5 | Text + options + answer all match expected patterns | Auto-accepted |
| 4 | Minor formatting issues auto-fixed | Auto-accepted |
| 3 | Options present but answer uncertain | Queued for review |
| 2 | Text extracted but options garbled | Queued for review |
| 1 | Model couldn't parse | Needs manual entry |

### Manual Verification Workflow

```
QUESTION 24/90  |  physics  |  section a
═══════════════════════════════════════════════════════════════════════════

╔═══════════════════════════════════════════════════════════════════════════╗
║  [PDF SNIPPET — Page 8, cropped to question area]                       ║
║                                                                         ║
║  24. A particle of mass 2 kg is moving in a circular path of radius     ║
║      2 m. If its angular velocity changes from 2 rad/s to 4 rad/s in   ║
║      1 s, find the torque acting on it.                                ║
║      (1) 4 N-m    (2) 8 N-m    (3) 16 N-m    (4) 32 N-m               ║
╚═══════════════════════════════════════════════════════════════════════════╝

EXTRACTED ─────────────────────────────────────────────────────────────────
  text:    A particle of mass 2 kg is moving in a circular path of radius
           2 m. If its angular velocity changes from 2 rad/s to 4 rad/s
           in 1 s, find the torque acting on it.
  options: [0] 4 N-m | [1] 8 N-m | [2] 16 N-m | [3] 32 N-m
  answer:  [1] — 8 N-m

VALIDATION ────────────────────────────────────────────────────────────────
  ✅ All checks passed

ACTIONS ──────────────────────────────────────────────────────────────────
  [a] Accept & Next        [e] Edit Field
  [x] Mark Incorrect       [s] Skip (review later)
  [v] Show PDF context     [q] Quit (save progress)
```

**Edit mode (pressing 'e'):**

```
EDIT FIELD ───────────────────────────────────────────────────────────────
  [1] text      [2] options    [3] answer    [4] subject
  [5] section   [6] type       [7] marks     [8] topic/tags

  Select field: 3

  Current: 1 (8 N-m)
  Correct: 2

  (12 N-m)

  [n] Next question
```

### Tracking Verification

`data/index.json`:
```jsonc
{
  "schema": "v2",
  "updatedAt": "2026-05-19T00:00:00Z",
  "datasets": [
    {
      "id": "jeemain-2025-22jan-shift1",
      "exam": "jeemain",
      "year": 2025,
      "shift": "22jan-shift1",
      "total": 90,
      "verified": 90,
      "status": "verified",
      "verifiedAt": "2026-05-19T00:00:00Z"
    },
    {
      "id": "jeemain-2025-22jan-shift2",
      "exam": "jeemain",
      "year": 2025,
      "shift": "22jan-shift2",
      "total": 90,
      "verified": 0,
      "status": "pending",
      "verifiedAt": null
    }
  ]
}
```

---

## 8. Human Review Workflow CLI

### Commands

```
# Review a specific shift
node src/index.ts review --exam=jeemain --year=2025 --shift=22jan-shift1

# Review all unverified items
node src/index.ts review --all-pending

# Review only low-confidence items (skip auto-accepted)
node src/index.ts review --exam=jeemain --year=2025 --strict

# Review with PDF context
node src/index.ts review --exam=jeemain --year=2025 --shift=22jan-shift1 --show-pdf
```

### CLI Design

```
QUESTION PIPELINE v2
═══════════════════════════════════════════════════════════════════

command: review

options:
  --exam          filter by exam (jeemain | neet | jeeadv | ncert)
  --year          filter by year
  --shift         filter by shift
  --paper         filter by paper (for jeeadv)
  --all-pending   review all unverified items in sequence
  --strict        only show items with confidence < 5
  --show-pdf      display PDF snippet alongside extracted JSON
  --oneline       compact mode (no PDF preview, faster)

examples:
  review --exam=jeemain --year=2025 --shift=22jan-shift1
  review --all-pending --oneline
  review --exam=ncert --strict
```

### Progress Persistence

- Saves progress on every 'q' quit to `.review-progress.json`
- Resumes from last unanswered question
- File is gitignored

---

## 9. Scripts & Automation

### `batch-process.ts` — Download + Extract + Validate

```typescript
// 1. Scrape all available PDFs for a given exam/year
// 2. Download each PDF to temp/
// 3. Run OCR + structuring + diagram caching
// 4. Run auto-validation
// 5. Write to data/ with default revision=1, status=pending
// 6. Print summary

node src/scripts/batch-process.ts --exam=jeemain --year=2025
```

### `verify-all.ts` — Review All Pending

```typescript
// 1. Read data/index.json
// 2. Find all datasets with status !== "verified"
// 3. Launch review-cli for each, one by one
// 4. After each is verified, bump revision on corrected questions
// 5. Recompute checksum
// 6. Update index.json

node src/scripts/verify-all.ts
```

### `rebuild-index.ts` — Regenerate Master Index

```typescript
// 1. Walk data/ directory tree
// 2. Read each paper.json
// 3. Rebuild data/index.json from actual file state
// 4. Detect orphaned/missing files

node src/scripts/rebuild-index.ts
```

### `stats.ts` — Dataset Statistics

```typescript
// 1. Read all datasets
// 2. Print:
//    - Total questions per exam/year
//    - Verified vs pending counts
//    - Subject distribution
//    - Question type distribution
//    - File sizes + total size
//    - Integrity check (% passed checksum verification)
//    - Remaining review estimate (hours)

node src/scripts/stats.ts
```

```
═══════════════════════════════════════════════════════════════════
QUESTION PIPELINE — DATASET STATISTICS
═══════════════════════════════════════════════════════════════════

jeemain 2025
  shifts: 24/24 scraped  ✅
  questions: 2,160
  verified: 0/2,160  ❌ (est. 6 hours)
  integrity: 100% checksum pass  ✅
  size: 4.2 MB

neet 2025
  shifts: 2/2 scraped  ✅
  questions: 360
  verified: 0/360  ❌ (est. 1 hour)
  integrity: 100%  ✅
  size: 0.7 MB

ncert-exemplar
  class 11 physics: 300 — pending
  class 11 chemistry: 300 — pending
  class 11 biology: 250 — pending
  class 12 physics: 300 — pending
  class 12 chemistry: 300 — pending

═══════════════════════════════════════════════════════════════════
total: 3,970 questions  |  verified: 0  |  est. review: ~11 hours
═══════════════════════════════════════════════════════════════════
```

### `export-for-opensource.ts` — Prepare Public Release

```typescript
// 1. Read all verified datasets (status === "verified")
// 2. Strip internal fields:
//    - scrapedAt
//    - checksum
//    - revision
// 3. Add attribution header:
//    "dataset": "Rankify Question Bank",
//    "curatedBy": "Rankify",
//    "homepage": "https://rankify.qzz.io",
// 4. Write to export/ directory
// 5. Print summary

node src/scripts/export-for-opensource.ts --output=./export
```

**Note:** No license is embedded in output JSON files. The export script can optionally add one via `--license=cc-by-4.0`.

Only subject-level files are exported (not `paper.json` — those contain shift metadata). Each subject file is a standalone dataset:

```
export/
├── jeemain-physics.json       # 7,200+ questions across all years
├── jeemain-chemistry.json     # 7,200+
├── jeemain-mathematics.json   # 7,200+
├── neet-physics.json          # 1,200+
├── neet-chemistry.json        # 1,200+
├── neet-biology.json          # 2,400+
├── ncert-physics.json         # 600+
├── ncert-chemistry.json       # 600+
├── ncert-biology.json         # 500+
└── readme.md                  # Dataset documentation
```

No license embedded by default. Use `--license=cc-by-4.0` to add:

```jsonc
{
  "dataset": "Rankify Structured Question Bank",
  "source": "JEE Main Previous Year Questions (2019-2026)",
  "curatedBy": "Rankify (https://rankify.qzz.io)",
  "schema": "v2",
  "license": "cc-by-4.0",
  "total": 7200,
  "updatedAt": "2026-05-19T00:00:00Z",
  "questions": []
}
```

---

## 10. API Endpoint Design

### Query Parameters

| Param | Example | Behavior |
|-------|---------|----------|
| `exam` | `jeemain` | Required. Filter by exam. |
| `year` | `2025` | Filter by year. |
| `shift` | `22jan-shift1` | Filter by shift. |
| `paper` | `paper1` | Filter by paper (jeeadv). |
| `subject` | `physics` | Filter by subject. |
| `topic` | `kinematics` | Filter by topic. |
| `type` | `mcq` | Filter by question type. |
| `tags` | `easy,kinematics` | Filter by tags (comma-separated AND). |
| `limit` | `50` | Max results (default 100, max 500). |
| `offset` | `0` | Pagination offset. |
| `random` | `true` | Random sample. |

### Response Format

```jsonc
{
  "success": true,
  "count": 30,
  "total": 90,
  "offset": 0,
  "limit": 30,
  "questions": [
    /* Question[] */
  ]
}
```

### Nuxt Server Route (in Rankify web app)

```typescript
// apps/web/server/api/questions/index.get.ts

export default defineEventHandler(async (event) => {
  const { exam, year, shift, paper, subject, topic, type, tags, limit, offset, random } = getQuery(event)

  // Option A: Read from local data/ directory (pipeline repo cloned alongside)
  // Option B: Fetch from GitHub raw (if hosting JSON on a public repo)
  // Option C: Serve from /public directory (deploy JSON as static files)

  const dataset = await loadDataset({ exam, year, shift, paper, subject })
  const filtered = applyFilters(dataset.questions, { topic, type, tags })
  const paginated = paginate(filtered, { limit, offset, random })

  return { success: true, count: paginated.length, total: filtered.length, offset, limit, questions: paginated }
})
```

---

## 11. Exporting for Open-Source

### When You Decide to Open-Source

1. Run `node src/scripts/export-for-opensource.ts`
2. Optionally add `--license=cc-by-4.0`
3. Creates `./export/` with cleaned JSON files
4. Each file is a **standalone dataset** — no dependencies, self-describing
5. Push `./export/` to a public GitHub repo

### Attribution in Public Repo

```jsonc
{
  "dataset": "Rankify Structured Question Bank",
  "source": "JEE Main Previous Year Questions (2019-2026)",
  "curatedBy": "Rankify (https://rankify.qzz.io)",
  "schema": "v2",
  "total": 7200,
  "updatedAt": "2026-05-19T00:00:00Z",
  "questions": []
}
```

License is only added if explicitly specified. By default, no license — your choice when to add it.

---

## 12. Rankify Adapter (Zero Changes)

```typescript
// src/adapters/rankify-adapter.ts

import type { Question } from '../types'
import type { TestSessionQuestionData } from '~/shared/types/cbt-interface'

const typeMap: Record<string, string> = {
  'mcq': 'MCQ',
  'msq': 'MSQ',
  'nat': 'NAT',
  'match': 'MSQ',
  'assertion-reason': 'MCQ',
}

export function toTestSessionQuestionData(
  q: Question,
  index: number
): TestSessionQuestionData {
  return {
    queId: index + 1,
    queText: q.text,
    options: q.options ?? [],
    queType: typeMap[q.type] ?? 'MCQ',
    queMarks: q.marks,
    queNegativeMarks: q.negativeMarks,
    queSubject: q.subject,
    queSection: q.section,
    queTopic: q.topic,
    correctAnswer: q.answer ?? undefined,
    solution: q.solution ?? undefined,
    hasDiagram: q.hasDiagram,
  }
}
```

**Rankify changes:**
- Zero. The adapter runs at import time inside Rankify's existing flow.
- Existing Dexie `testQuestionsData` table, CBT `interface.vue`, `useCbtSettings` composable — all unchanged.
- Only additions: one new API endpoint `GET /api/questions` + one "Import Question Bank" button in UI.

### How Rankify Uses This

```
User clicks "Import Question Bank"
           │
           ▼
FE: fetch /api/questions?exam=jeemain&year=2025&subject=physics&shift=22jan-shift1
           │
           ▼
FE: adapter.toTestSessionQuestionData(q, index) for each
           │
           ▼
FE: db.testQuestionsData.bulkAdd(adaptedQuestions)
           │
           ▼
FE: navigate to CBT interface ← questions already in Dexie, ready to go
```

User never touches the pipeline. They just see a list of available question banks to import.

---

## 13. Free Tier Limits & Rate Limiting

### `src/utils/rate-limiter.ts`

```typescript
export const rateLimits = {
  mistral: {
    ocr: { rpm: 60, concurrency: 3 },
    chat: { rpm: 30, concurrency: 2 },
  },
  cerebras: {
    chat: { rpm: 60, concurrency: 5, maxContext: 65536 },
  },
  gemini: {
    vision: { rpm: 60, rpd: 1000, concurrency: 3 },
  },
}
```

| Service | Free Limit | Our Usage |
|---------|-----------|-----------|
| **Mistral OCR** | 1000 pages/min | ~1 request per PDF (even 90-page papers) |
| **Cerebras Chat** | 60 req/min, 65k context | 1 req per 12 pages (chunked) |
| **Gemini Flash** | 60 req/min, 1000 req/day | Fallback for >12 page chunks |
| **Groq** | 30 req/min, 1440 req/day | Future multi-model cross-validation |

For a 90-page JEE paper:
- 1 Mistral OCR request
- 8 Cerebras requests (12 pages each, 90/12 = 7.5 → 8 chunks)
- ~2s delay between Cerebras requests to stay under 60/min
- Total AI time: ~30 seconds per paper

---

## 14. Implementation Order

### Phase 1: Foundation (Day 1)
```
[ ] src/types.ts              — Question schema + all interfaces
[ ] src/topic-vocabulary.ts   — Controlled topic list
[ ] src/utils/rate-limiter.ts — API rate limit wrapper
[ ] src/utils/pdf-downloader.ts — Download PDFs with retry
[ ] src/utils/hash-utils.ts   — SHA-256 for dedup
[ ] src/utils/logger.ts       — Structured console logging
[ ] src/utils/integrity.ts    — Checksum verification
```

### Phase 2: Scrapers (Day 2)
```
[ ] src/scrapers/nta-scraper.ts         — JEE Main + NEET from NTA
[ ] src/scrapers/gateoverflow-scraper.ts — Community mirrors
[ ] src/scrapers/ncert-scraper.ts       — NCERT Exemplar
[ ] src/scrapers/kaggle-importer.ts     — Existing datasets
```

### Phase 3: Extraction (Day 3-4)
```
[ ] src/extractors/ocr-stage.ts      — Mistral OCR wrapper
[ ] src/extractors/structurer.ts     — Cerebras/Gemini JSON structuring
[ ] src/extractors/diagram-cacher.ts — Save base64 images as PNG files
```

### Phase 4: Validation (Day 5)
```
[ ] src/validators/auto-validator.ts — 20+ automated checks
[ ] src/validators/field-checker.ts  — Per-field validation rules
```

### Phase 5: Finalization (Day 6)
```
[ ] src/finalizers/id-assigner.ts      — Stable ID generation
[ ] src/finalizers/normalizer.ts       — LaTeX/Unicode normalization
[ ] src/finalizers/topic-normalizer.ts — Map topics to controlled vocabulary
[ ] src/finalizers/exporter.ts         — Write JSON files + checksums
```

### Phase 6: Human Review (Day 7-8)
```
[ ] src/review/pdf-renderer.ts   — Render PDF snippet for comparison
[ ] src/review/review-cli.ts     — Interactive verification CLI
[ ] src/review/batch-signoff.ts  — Sign off entire shifts
```

### Phase 7: Scripts (Day 9)
```
[ ] src/scripts/batch-process.ts        — Full pipeline end-to-end
[ ] src/scripts/verify-all.ts           — Review all pending
[ ] src/scripts/rebuild-index.ts        — Regenerate master index
[ ] src/scripts/stats.ts                — Dataset statistics
[ ] src/scripts/export-for-opensource.ts — Prepare public release
```

### Phase 8: API + Rankify Integration (Day 10)
```
[ ] src/api/server.ts            — Local API server for testing
[ ] src/adapters/rankify-adapter.ts — Canonical → Rankify format
[ ] Rankify: Add GET /api/questions endpoint
[ ] Rankify: Add "Import Question Bank" button in UI
```

### Phase 9: Multi-Model Cross-Validation (Future)
```
[ ] src/validators/cross-validator.ts — Run 2+ models, compare outputs
[ ] Pick best version per question
[ ] Only flag discrepancies for human review
```

---

## 15. Diagram Storage Strategy

### Where Diagrams Live

```
data/jeemain/2025/22jan-shift1/
├── paper.json
├── physics.json
├── diagrams/
│   ├── physics/
│   │   ├── q001.png      # Question 1's diagram
│   │   ├── q007.png      # Question 7 has a diagram
│   │   └── q015.png
│   ├── chemistry/
│   │   └── q003.png
│   └── mathematics/
│       └── q022.png
```

### How Questions Reference Diagrams

```jsonc
{
  "id": "jeemain-2025-22jan-s1-ph-001",
  "hasDiagram": true,
  "diagramFile": "diagrams/physics/q001.png"
}
```

The path is **relative** to the shift directory. The API or client resolves:
```
data/jeemain/2025/22jan-shift1/diagrams/physics/q001.png
```

### Diagram Naming Convention

```
{subject}/{q}{question-number-padded-3}.png

Rules:
- PNG format only (lossless, widely supported, no transparency issues for scanned diagrams)
- 3-digit zero-padded question number (q001, q007, q015)
- Subject subdirectory for organization
```

### Extraction Flow

1. Mistral OCR returns base64-encoded images per diagram
2. `diagram-cacher.ts` decodes base64 → writes PNG to `diagrams/{subject}/q{number}.png`
3. Question JSON gets `diagramFile: "diagrams/{subject}/q{number}.png"`
4. Auto-validator checks: if `hasDiagram=true`, does the file exist on disk?
5. If file is missing → flagged for human review → manual crop from PDF

### Serving Diagrams via API

When serving questions via the API, the diagram endpoint is:

```
GET /api/diagrams/{exam}/{year}/{shift}/{subject}/{question-number}.png

Example:
GET /api/diagrams/jeemain/2025/22jan-shift1/physics/q001.png
```

This maps directly to the file on disk.

---

## 16. Future Scope

### Multi-Model Cross-Validation
Run 2-3 models on the same PDF, compare outputs:
- Questions where all models agree → auto-accept
- Questions where models disagree → only those flagged for review
- Human time drops from 15 min/paper to ~2 min/paper

### Incremental Updates
When new exam papers release each year:
1. Update scraper URL patterns
2. Run `batch-process --exam=jeemain --year=2026`
3. Review 24 shifts (~6 hours)
4. Done — datasets stay current

### Topic Classification (ML)
- Train a lightweight classifier on verified questions
- Auto-assign topics with 85%+ accuracy
- Improves over time as more data is verified

### Difficulty Prediction
- Use question features (length, topic, options similarity)
- Calibrate against actual exam statistics
- Tag questions as easy/medium/hard automatically

### Question Similarity Detection
- Hash questions to detect near-duplicates across years
- Cross-reference: "variant of jeemain-2023-q042"
- Enable "Show similar questions" in Rankify CBT

### Automated Solution Generation
- For NAT: use Cerebras to generate step-by-step solutions
- For MCQ: generate explanations for wrong options
- Flag generated solutions for human review

---

## 17. Flaws Fixed from v1 (v1 → v2 Changes)

| # | Flaw in v1 | Fix in v2 |
|---|-----------|-----------|
| 1 | Mixed case everywhere (`22Jan-Shift1`, `JEE-Main`) | Everything lowercase: `22jan-shift1`, `jeemain` |
| 2 | `extractionMethod: "mistral-ocr + cerebras + manual-verification"` unprofessional | Removed from output JSON. No extraction details in public schema |
| 3 | Diagram storage vague — `diagramFile: "diagrams/ph/q024.png"` undefined location | Defined: `diagrams/{subject}/q{number-3-padded}.png` relative to shift dir |
| 4 | No data integrity | Added `checksum` field (SHA-256) to every JSON file |
| 5 | No question versioning | Added `revision: number` — bumped on each correction |
| 6 | Topic field too free-form | Added `topic-normalizer.ts` with controlled vocabulary |
| 7 | No sub-question support | `number` is now string: `"1"`, `"1a"`, `"1b"`. Added `numberLabel` |
| 8 | No MSQ answer format | Added `answers: string[] | null` for multiple correct answers |
| 9 | `section` field ambiguous | Standardized to lowercase single char: `"a"`, `"b"`, `"i"`, `"ii"` |
| 10 | `shift` doesn't fit JEE Advanced | Added `paper: string | null` field alongside `shift` |
| 11 | `dateScraped` inconsistent naming | Renamed to `scrapedAt` — matches `verifiedAt` convention |
| 12 | `sourceUrl` implies 100% accuracy from source | Documented that verified questions may differ from source |
| 13 | No diagram metadata | `diagramFile` is validated at export time (file must exist on disk) |
| 14 | `correctAnswer: null` vs `""` inconsistent | Single sentinel: `null` for absent, string for present |
| 15 | `index.json` uses mixed case | All lowercase in index.json too |

---

## References

- **NTA Official**: https://jeemain.nta.nic.in
- **GateOverflow Mirror**: https://jeemain.gateoverflow.in
- **NCERT Exemplar**: https://ncert.nic.in/textbook.php
- **Mistral OCR API**: https://console.mistral.ai
- **Cerebras API**: https://inference.cerebras.ai
- **Kaggle JEE Dataset**: https://kaggle.com/datasets/jeemain-pyq
- **Plan location**: `C:\QUESTION-PIPELINE\PLAN.md`
- **Rankify project**: `E:\naman\Documents\Cursor AI\Rankify`

---

## Summary

| Decision | Choice |
|----------|--------|
| **Location** | `C:\QUESTION-PIPELINE\` — separate private repo |
| **Infrastructure** | Node.js + TypeScript only — no Docker, no DB |
| **Cost** | $0 — all APIs have free tiers sufficient for batch use |
| **Accuracy** | 100% via AI extraction + auto-validation + human review |
| **Format** | Canonical `Question` schema with adapter to Rankify |
| **File org** | `exam/year/shift/paper.json` + subject splits + `diagrams/` |
| **License in JSON** | None by default — added only at open-source export time |
| **Rankify changes** | Zero schema changes — 30-line adapter at import |
| **Review speed** | ~15 min per 90-question paper |
| **Total dataset** | ~50 MB for 15,000+ questions across all exams |
| **Case convention** | Everything lowercase — exam names, directories, IDs, field values |
