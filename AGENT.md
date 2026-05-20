# AGENT.md — Question Pipeline Context

> Agent-agnostic reference. Any AI reading this gets full end-to-end context.
> Last updated: 2026-05-19

## 1. What Is This

Standalone batch pipeline at `C:\QUESTION-PIPELINE\` (separate private repo).
Downloads Indian exam PDFs -> extracts questions -> produces clean structured JSON datasets.
Private profit first, open-source later via `--license` export flag.

**Exams covered:** jeemain, jeeadv, neet, ncert-exemplar
**Question output:** ~15,000+ questions, ~50 MB total
**Accuracy:** 100% (AI extraction -> auto-validation -> human review)
**Infra:** Node.js + TypeScript only. Zero Docker, zero DB, zero paid APIs.
**Case convention:** ALL LOWERCASE. Everywhere. Exams, dirs, files, IDs, field values.
**Repo name:** question-pipeline (private). Not part of Rankify web app.

## 2. Directory Structure

```
C:\QUESTION-PIPELINE\
  plan.md              # Full design doc (1722 lines, 70KB) — READ THIS FOR CONTEXT
  AGENT.md             # This file — condensed agent reference
  package.json         # typescript, ts-node, @types/node
  tsconfig.json
  .review-progress.json  # Review session state (gitignored)

  src/
    index.ts           # CLI entry point
    types.ts           # ALL shared types — single source of truth
    scrapers/
      nta-scraper.ts         # JEE Main / NEET from NTA official site
      gateoverflow-scraper.ts # JEE mirrors from gateoverflow.in
      ncert-scraper.ts        # NCERT Exemplar PDFs
      kaggle-importer.ts      # Import existing Kaggle/HF datasets
    extractors/
      ocr-stage.ts           # Mistral OCR -> per-page markdown + images
      structurer.ts          # Cerebras/Gemini: markdown -> JSON
      diagram-cacher.ts      # base64 -> PNG -> diagrams/
    validators/
      auto-validator.ts      # 30+ consistency checks
      field-checker.ts       # Type-specific validation rules
      cross-validator.ts     # Multi-model comparison (future)
    finalizers/
      id-assigner.ts         # Stable ID generation
      normalizer.ts          # LaTeX -> Unicode
      topic-normalizer.ts    # Map topics to controlled vocabulary
      exporter.ts            # Write JSON + diagrams to data/
    review/
      review-cli.ts          # Interactive terminal UI for human verification
      pdf-renderer.ts        # Render PDF snippet for side-by-side
      batch-signoff.ts       # Sign off entire shifts
    api/
      server.ts             # Optional local API (port 3456)
    utils/
      pdf-downloader.ts     # Download + retry + PDF validation
      rate-limiter.ts       # Free tier rate management
      hash-utils.ts         # SHA-256 dedup
      logger.ts
      integrity.ts         # Verify checksums on all JSON files
    adapters/
      rankify-adapter.ts   # Canonical -> Rankify TestSessionQuestionData (30 lines)
    vocabulary.ts          # Controlled topic + tag mappings (100+)

  data/
    index.json             # Master index of ALL datasets
    {exam}/metadata.json   # Scraped URLs, verification status
    {exam}/{year}/{shift}/
      paper.json           # Full paper (number 1-N)
      physics.json         # Subject split (number 1-N, subject-relative)
      chemistry.json
      mathematics.json
      diagrams/{subject}/q{3-digit}-fig{n}.png
    all-{subject}.json     # ALL instances of one subject across shifts

  scripts/
    batch-process.ts       # Full pipeline: download -> OCR -> ... -> save
    verify-all.ts          # Review ALL unverified datasets
    rebuild-index.ts       # Regenerate index.json from disk
    export-for-opensource.ts # Strip internals, add license
    stats.ts               # Dataset statistics + integrity report

  export/                  # Open-source output (gitignored)
```

## 3. JSON Schema — Canonical Format

Source of truth: src/types.ts. Everything lowercase.

### QuestionFile (paper.json, physics.json, etc.)

```typescript
interface QuestionFile {
  schema: "v4";
  exam: "jeemain" | "neet" | "jeeadv" | "ncert-exemplar";
  year: number | null;       // null for ncert-exemplar
  shift: string | null;
  paper: string | null;
  subjects: string[];
  total: number;
  duration: number;
  marksCorrect: number;
  marksIncorrect: number;
  marksUnanswered: number;
  sections: Record<string, SectionConfig>;
  scrapedAt: string;         // ISO 8601
  checksum: string;          // SHA-256 before adding this field
  questions: Question[];
  passages: Passage[];
}

interface SectionConfig {
  label: string;
  total: number;
  required: number;
  mandatory: boolean;
}
```

### Question

```typescript
interface Question {
  id: string;                // jeemain-2025-22jan-s1-ph-001
  number: number;            // Contextual: 1-N
  numberLabel: string | null;
  subject: string;
  topic: string;
  section: string | null;     // Free-form: "a" | "b" | "section-1"
  type: "mcq" | "msq" | "nat" | "assertion-reason";
  text: string;
  textHi: string | null;     // Hindi (NEET only)
  options: string[] | null;  // null for assert-reason and nat
  answer: string;            // MCQ: 0-based index ("0"-"3"). NAT: numeric string
  answers: string[] | null;  // MSQ correct indices
  answerPrecision: AnswerPrecision | null;
  marks: number;
  negativeMarks: number;     // 0 for nat
  passageId: string | null;
  solution: string | null;
  solutionFormat: "plain" | "html" | "markdown" | "latex" | null;
  hasDiagram: boolean;
  diagrams: Diagram[] | null;
  difficulty: "easy" | "medium" | "hard" | null;  // null=unassigned
  tags: string[];
  revision: number;
  source: "official-pdf" | "reconstructed" | "imported-kaggle" | "imported-dataset";
  confidence: "high" | "medium" | "low" | null;
}

interface Diagram {
  file: string;
  label: string | null;
  caption: string | null;
}

interface AnswerPrecision {
  type: "exact" | "integer-range" | "decimal-range";
  value?: string;
  min?: number;
  max?: number;
  unit?: string;
}

interface Passage {
  id: string;
  text: string;
  textHi: string | null;
  diagrams: Diagram[] | null;
  questions: string[];
}
```

### Assertion-Reason Options (auto-generated, NEVER stored)

```
answer "0" = "Both A and R are true and R is the correct explanation of A"
answer "1" = "Both A and R are true but R is NOT the correct explanation of A"
answer "2" = "A is true but R is false"
answer "3" = "A is false but R is true"
```

## 4. ID Scheme

```
{exam}-{year}-{shift-shorthand}-{subject-code}-{3-digit-number}

Examples:
  jeemain-2025-22jan-s1-ph-001
  jeemain-2025-22jan-s1-ch-015
  neet-2025-04may-ph-045
  jeeadv-2025-p1-ph-012
  ncert-exemplar-11-ph-023

Subject codes: ph, ch, ma, bi
3-digit = zero-padded (001, 025, 100). Matches subject-file number.
Tombstone: removed IDs never reused.
```

## 5. Pipeline Flow

```
PDF --> Mistral OCR (markdown+images) --> Cerebras/Gemini (JSON extraction)
  --> Auto-Validator (30+ checks) --> Human Review (interactive CLI)
  --> Finalizer (IDs + normalization + checksum) --> data/
```

### Stage details:

| Stage | Module | What happens |
|---|---|---|
| 1. Scrape | nta-scraper.ts | Download PDF from NTA site. Validate PDF magic bytes. Retry 3x |
| 2. OCR | ocr-stage.ts | Send PDF to Mistral OCR. Get per-page markdown + base64 images. Chunk >3.5MB |
| 3. Structure | structurer.ts | Send markdown to Cerebras (<=12pgs, 65k) or Gemini (>12pgs). AI returns JSON |
| 4. Cache | diagram-cacher.ts | Decode base64 -> PNG. Save to diagrams/{s}/q{num}-fig{n}.png |
| 5. Validate | auto-validator.ts | 30+ checks. Errors flagged, not blocking |
| 6. Review | review-cli.ts | PDF vs JSON side-by-side. [a]ccept [e]dit [s]kip [q]uit |
| 7. Finalize | exporter.ts | IDs + normalizer + topic-mapper + checksum index.json update |


## 6. Answer Key Handling — Time-Travel Backfill

PDF answer keys are at the END. AI reads the ENTIRE PDF in one prompt.
When it encounters "Ans: (2)" on the last page, it backfills answer fields
for questions it already saw on page 3. All in a single AI pass.

Fallback: post-processing function matches answer key entries to question numbers.

## 7. Key Validation Rules

| Rule | Check |
|---|---|
| MCQ | options 3-5, answer is 0-based index string |
| MSQ | options 4-6, answers array length >= 1, sorted |
| NAT | options=null, answer is numeric, negativeMarks MUST be 0 |
| AR | options=null, answer in "0"|"1"|"2"|"3" |
| DIAGRAM | hasDiagram=true iff diagrams array is populated. Files exist on disk |
| PASSAGE | passageId references valid passage in passages array |
| TOPIC | Must be from controlled vocabulary in vocabulary.ts |
| TAGS | Must be from controlled vocabulary |
| TEXT | No HTML, no placeholders like "[image]", not empty |
| DIFFICULTY | null by default. Human assigns via rubric. AI never guesses |
| CHECKSUM | SHA-256 of JSON body before adding checksum field |

Difficulty rubric (assigned by human during review):
  easy = single concept, 60%+ expected correct
  medium = 2+ concepts, 30-60% expected correct
  hard = multi-step/trick, <30% expected correct

## 8. Question Type Coverage

| Type | JEE Main | JEE Adv | NEET | NCERT | How stored |
|---|---|---|---|---|---|
| MCQ | YES | YES | YES | YES | type: mcq, options: string[], answer: index |
| MSQ | YES | YES | NO | NO | type: msq, answers: string[] |
| NAT | YES | YES | NO | NO | type: nat, options: null, negativeMarks=0 |
| NAT-range | rare | YES | NO | NO | answerPrecision on nat |
| Assert-Reason | YES | YES | NO | NO | type: assertion-reason, options auto-gen |
| Match-Cols | NO | YES | NO | NO | type: mcq, 4 pairing options |
| Passage | YES | YES | YES | NO | passageId on any Question type |
| Diagrams | rare | YES | rare | YES | diagrams: Diagram[] array |
| Bilingual | NO | NO | YES | NO | textHi: string |
| Sub-Questions | NO | YES | NO | NO | numberLabel: "1(a)" |


## 9. File Organization Rules

- `data/{exam}/{year}/{shift}/paper.json` — full paper
- `data/{exam}/{year}/{shift}/{subject}.json` — subject split
- `data/{exam}/{year}/{shift}/diagrams/{subject}/q{3digit}-fig{n}.png` — diagrams
- `data/{exam}/all-{subject}.json` — aggregate across all shifts
- Subject files: number = 1-N (not hardcoded). JEE Adv phys = 18, NEET phys = 50
- Aggregate files: number resets to 1-N sequentially. IDs stay unique
- All lowercase with hyphens: 22jan-shift1, 04may, paper1

## 10. Key Design Decisions

1. **ALL lowercase** — eliminates casing bugs. IDs, directories, field values.
2. **No license in JSON** — added only at export via --license. Private profit first.
3. **Assertion-reason options auto-generated** — 4 standard options NEVER stored. ~200 chars saved per question.
4. **Passage-based = any type + passageId** — not a separate type. MCQ/NAT can reference a passage.
5. **Match-columns = MCQ with 4 pairing options** — not a separate type.
6. **Difficulty = null from AI** — never guessed. Human assigns with rubric.
7. **Checksum computed before adding checksum field** — serialize without, hash, add, re-serialize.
8. **Human review is the accuracy guarantee** — AI gets 80-95%, auto-validation catches ~5% more, human catches rest.
9. **Zero Rankify schema changes** — 30-line adapter converts at import time.
10. **Free tier only** — Mistral OCR 1000pg/min, Cerebras 60req/min, Gemini 60req/min/1000day.
11. **No Docker** — unnecessary for a CLI tool that downloads files and writes JSON.
12. **No database** — JSON files ARE the database. index.json is the index.


## 11. Timing Estimates

| Paper | AI time | Validation | Human review | Total |
|---|---|---|---|---|
| JEE Main (90q) | ~30s | ~2s | ~15 min | ~15.5 min |
| JEE Adv (45q) | ~20s | ~1s | ~7 min | ~7.3 min |
| NEET (200q) | ~60s | ~3s | ~30 min | ~31 min |
| NCERT (35q) | ~10s | ~1s | ~5 min | ~5.2 min |

**JEE Main 2025 total:** 12 shifts x 15.5 min = ~3 hours human review. ~30 sec AI.

## 12. CLI Commands

```
# Scrape
npx ts-node src/scrapers/nta-scraper.ts --exam jeemain --year 2025

# Full batch
npx ts-node scripts/batch-process.ts --exam jeemain --year 2025 --shift 22jan-shift1

# Review
npx ts-node src/review/review-cli.ts --exam jeemain --year 2025 --shift 22jan-shift1

# Sign off
npx ts-node src/review/batch-signoff.ts --exam jeemain --year 2025 --shift 22jan-shift1

# Verify integrity
npx ts-node src/utils/integrity.ts --path ./data

# Stats
npx ts-node scripts/stats.ts

# Export open-source
npx ts-node scripts/export-for-opensource.ts --license cc-by-4.0 --output ./export

# API server
npx ts-node src/api/server.ts --port 3456

# Rebuild index
npx ts-node scripts/rebuild-index.ts
```

## 13. API (port 3456)

```
GET /api/v1/questions?exam=jeemain&year=2025&subject=physics&limit=30&offset=0
  Params: exam(required), year, shift, subject, topic, type, section
          tags(comma, AND), difficulty, limit(100), offset, random, sort, order
GET /api/v1/questions/count
GET /api/v1/diagrams/{exam}/{year}/{shift}/{path}
GET /api/v1/exams
GET /api/v1/stats
```

## 14. Implementation Status

| Phase | What | Status |
|---|---|---|
| 1 | Foundation: types.ts, vocabulary.ts, utils/* | NOT STARTED |
| 2 | Scrapers: nta, gateoverflow, ncert, kaggle | NOT STARTED |
| 3 | Extraction: ocr-stage, structurer, diagram-cacher | NOT STARTED |
| 4 | Validation: auto-validator, field-checker | NOT STARTED |
| 5 | Finalization: id-assigner, normalizer, exporter | NOT STARTED |
| 6 | Human Review: review-cli, pdf-renderer, batch-signoff | NOT STARTED |
| 7 | Scripts: batch-process, verify-all, rebuild-index, export, stats | NOT STARTED |
| 8 | API + Rankify Adapter | NOT STARTED |
| 9 | Cross-Validator (multi-model comparison) | FUTURE |

**Next:** Phase 1 — write src/types.ts, src/vocabulary.ts, src/utils/*

## 15. Environment Variables

```
MISTRAL_API_KEY=sk-...         # Required
CEREBRAS_API_KEY=...            # Required
GEMINI_API_KEY=...              # Optional (fallback)
KAGGLE_USERNAME=...             # Optional
KAGGLE_KEY=...                  # Optional
EDITOR=code                     # Editor for review edit mode
LOG_LEVEL=info                  # debug | info | warn | error
PDF_TEMP_DIR=./temp
```

## 16. Design Flaws Fixed (v1 -> v4)

42 total flaws fixed across 4 iterations. Key categories:

- **Case**: Mixed case -> all lowercase everywhere (dirs, files, IDs, field values)
- **Types**: Removed unnecessary types (passage, match). Kept only mcq/msq/nat/assertion-reason.
- **Integrity**: Added SHA-256 checksums + revision counters + integrity.ts verifier.
- **Vocabulary**: Added controlled topic+tag vocabulary (vocabulary.ts, 100+ mappings).
- **Passages**: passageId on any type. Passage object has diagrams support.
- **Bilingual**: textHi for Hindi (NEET). Passage.textHi too.
- **Diagrams**: diagrams: Diagram[] array. Two-tier extraction (direct + crop fallback).
- **Validation**: NAT negativeMarks=0 enforced. Type-specific rules per type.
- **Confidence**: Optional confidence field for reconstructed/imported questions.
- **Testing**: vitest unit tests + integration + snapshot + mocking strategy documented.


---
**End of AGENT.md** — Full design detail in plan.md (1722 lines).