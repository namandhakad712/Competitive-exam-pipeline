# AGENT.md — Question Pipeline Operational Manual

> Agent-agnostic. Any AI reading this can autonomously run the full pipeline.
> Every file, every command, every error pattern, every loop.
> Last updated: 2026-05-19

## 1. Mission

Extract Indian exam questions from PDF → clean structured JSON. No user writes commands.
The agent (you) does everything. The user only provides API keys and approves questions.

**Exams:** jeemain | jeeadv | neet | ncert-exemplar
**Infra:** Node.js + TypeScript. Zero Docker, zero DB, zero paid APIs except AI providers.
**Data dir:** `C:\QUESTION-PIPELINE\data\`
**Case:** ALL LOWERCASE everywhere. Exams, dirs, files, IDs, field values.

---

## 2. First Contact — What to Do When User Gives API Keys

```powershell
cd C:\QUESTION-PIPELINE
$env:MISTRAL_API_KEY = "sk-..."
$env:CEREBRAS_API_KEY = "..."
$env:GEMINI_API_KEY = "..."
npm install
```

Then ask: *"Which exam and shift? e.g. jeemain 2025 22jan-shift1"*

---

## 3. Directory — Every File by Role

```
C:\QUESTION-PIPELINE\
  plan.md                 1722-line design doc (read for full context)
  AGENT.md                THIS FILE
  package.json            scripts: scrape, batch, review, signoff, stats, api, export
  tsconfig.json

  src/
    index.ts              CLI entry (npm run start <cmd>)
    types.ts              ALL interfaces: QuestionFile, Question, Passage, Diagram,
                          AnswerPrecision, SectionConfig, PartialQuestion, QuestionType
    vocabulary.ts         100+ topic aliases + controlled tag lists. Helpers:
                          normalizeTopic(), isValidTag(), suggestTopics()

    scrapers/
      nta-scraper.ts       Downloads JEE Main / NEET PDFs from NTA official site.
                           Flags: --exam, --year, --shifts (count), --output
                           Generates dates from known pattern, constructs URLs.
                           Returns: downloaded file paths.
                           Errors: 404 = shift not released, retry 3x

      gateoverflow-scraper.ts  JEE Adv 2019-2024 + JEE Main 2023 mirrors.
                               Flags: --exam, --output
                               Sources from gateoverflow.in PDF links.

      ncert-scraper.ts     NCERT Exemplar Class 11/12.
                           Flags: --class, --subjects, --output
                           Subject codes: physics/chemistry/mathematics/biology

      kaggle-importer.ts   Import existing datasets (CSV or JSON).
                           Flags: --input, --format, --exam, --year, --shift
                           Maps columns, sets source=imported-kaggle, confidence=low

    extractors/
      ocr-stage.ts         Mistral OCR. Chunks >3.5MB PDFs.
                           In: PDF path. Out: { pages: [{markdown, images: [{id,base64}]}] }
                           Retry: 3x with exponential backoff
                           Error: File too large → split and re-OCR

      structurer.ts        Priority: NVIDIA (40 RPM) > Cerebras (5 RPM, <=12pgs) > Gemini (5 RPM) > LongCat (50M tokens).
                           System prompt = JSON schema for Question[].
                            Time-travel backfill: answer key on last page → match by number.
                            ANTI-HALLUCINATION: scans raw text for answer key patterns BEFORE sending to AI.
                            If no key detected: sets ALL answers to "" and warns user.
                           In: markdown string. Out: Question[] + Passage[]
                           Error: JSON parse failure → re-prompt with stricter instructions

      diagram-cacher.ts    Decodes base64 images from Mistral → PNG files.
                           Tier 1: use Mistral's individual image coordinates.
                           Tier 2: coordinate-crop from full-page PNG (sharp, fallback=uncropped).
                           Saves to: diagrams/{subject}/q{number}-fig{n}.png

    validators/
      field-checker.ts     Type-specific rules per QuestionType:
                           MCQ: options 3-5, answer is 0-based index string
                           MSQ: options 4-6, answers array sorted, >=1
                           NAT: options=null, negativeMarks=0, answer is numeric
                           AR:  options=null, answer in "0"|"1"|"2"|"3"
                           Returns: { valid: boolean, errors: ValidationError[] }

      auto-validator.ts    32 checks. Covers: ID format, subject/type validity, text empty,
                           placeholder detection, options uniqueness, NAT negativeMarks=0,
                           diagram file existence, passage reference integrity,
                           HTML injection, Unicode corruption, duplicate IDs,
                           source-confidence consistency, topic normalization, tag vocabulary.
                           Returns: { passed: number, failed: number, warnings: number }

      cross-validator.ts   Phase 9. Two models extract same paper → diff report.
                           Functions:
                             crossValidate(fileA, fileB) → CrossValidationReport
                             buildConsensus(fileA, fileB, resolutions?) → {report, consensus}
                             saveReport(report, dir)
                             loadReport(exam, year, shift, dir)
                           HTML report generator in diff-viewer.ts

    finalizers/
      id-assigner.ts       {exam}-{year}-{shift-shorthand}-{subject-code}-{3-digit}
                           Shorthand: "22jan-shift1" → "22jan-s1"
                                      "04may" → "04may"
                           Subject codes: ph/ch/ma/bi
                           Tombstone tracking: removed IDs never reused via data/.tombstones.json

      normalizer.ts        60+ LaTeX→Unicode mappings (\alpha→α, \beta→β, \theta→θ, etc.)
                           OCR ligature fixes (ﬁ→fi, ﬂ→fl)
                           Whitespace normalization (multiple spaces→one, trim)
                           Functions: normalizeText(), normalizeLatex()

      topic-normalizer.ts  Maps free-form topic strings → controlled vocabulary via vocabulary.ts.
                           Fallback: "general-{subject}" if no match.
                           Functions: normalizeTopic(topic, subject)

      exporter.ts          Full pipeline output:
                           1. normalizeText() on all text fields
                           2. normalizeTopic() on all topics
                           3. assign IDs via id-assigner
                           4. build QuestionFile wrapper
                           5. compute checksum (serialize without checksum → SHA-256 → add)
                           6. write paper.json + subject split files + data/index.json
                           Functions: exportPaper(questions, passages, meta, outputDir)

    review/
      pdf-renderer.ts      Formats question for terminal: 72-char wrap, 60-line truncation,
                           sidebar with ID/number/subject/type/topic/options/answer.
                           Functions: renderQuestion(q, index, total)

      review-cli.ts        Interactive terminal. Keys:
                             a = accept  e = edit ($EDITOR)  s = skip
                             f = flag with note  j/k = prev/next  q = quit
                           Saves progress to .review-progress.json (auto-resume).
                           On accept: updates metadata.json counts.
                           Functions: main(exam, year, shift)

      batch-signoff.ts     Marks a shift as verified/needs-review in metadata.json.
                           Flags: --exam, --year, --shift, --status
                           Writes review metadata with counts and timestamp.

    api/
      server.ts            Native http module (no Express). Port 3456 (configurable via PORT env).
                           Endpoints:
                             GET /api/v1/questions?exam=&year=&shift=&subject=&topic=
                                 &type=&section=&tags=&difficulty=&limit=100&offset=0
                                 &random=&sort=number&order=asc
                             GET /api/v1/questions/count
                             GET /api/v1/exams
                             GET /api/v1/stats
                             GET /api/v1/diagrams/:exam/:year/:shift/:path
                           CORS open (Access-Control-Allow-Origin: *)

    utils/
      pdf-downloader.ts    Downloads PDF with retry (3x), validates PDF magic bytes (%PDF),
                           parallel downloads via Promise.all. DownloadProgress callback.

      rate-limiter.ts    Queue + window-based throttling. Configs:
                           Mistral OCR: 60 req/min (1 RPS enforcement),
                           Cerebras: 5 req/min (30k TPM),
                           Gemini: 5 req/min (250k TPM, 20 RPD)
                           Queue + window-based throttling. RateLimiter class.

      hash-utils.ts        SHA-256 via crypto.subtle. Functions:
                             computeChecksum(data: string): string
                             verifyChecksum(data: string, expected: string): boolean

      logger.ts            Structured logging: info, warn, error, debug.
                           Respects LOG_LEVEL env var (debug|info|warn|error).

      integrity.ts         Walks data/ and verifies SHA-256 checksums on all paper.json files.
                           Returns: { totalFiles, passed, failed, missing }
                           Verify every time before accepting a dataset as clean.

    adapters/
      rankify-adapter.ts   Converts canonical Question → Rankify TestSessionQuestionData.
                           30 lines. Zero changes to Rankify schema.
                           Functions:
                             adaptQuestion(q) → RankifyQuestionData
                             adaptPaper(questions, passages, sessionId?) → RankifyPaperData
                             setPassageCache(passages) — prepends passage text when passageId set
                           AR options auto-generated: 4 standard strings.
```

---

## 4. Pipeline Loop — The Agent Must Execute This

This is the core loop. You do ALL of these steps. User only provides API keys and approval.

### Step 1: Install & Verify

```powershell
cd C:\QUESTION-PIPELINE
npm install
# Verify tsconfig compiles:
npx tsc --noEmit
# If errors, fix them first. Never proceed with broken build.
```

### Step 2: Scrape

Ask user: *"Which exam, year, and shift? e.g. jeemain 2025 22jan-shift1"*

```powershell
npm run scrape -- --exam {exam} --year {year} --shifts 1
```

**Agent check:** Did the PDF download? Check `data/{exam}/raw/` for `.pdf` files.
**Error handling:**
- No PDF found? Try gateoverflow-scraper as fallback.
- 404? The shift may not be released yet. Tell user.

### Step 3: OCR

```powershell
# Manually call the OCR module. Currently no npm script — run via tsx:
npx tsx src/extractors/ocr-stage.ts --input data/{exam}/raw/{file}.pdf --output data/{exam}/ocr/
```

**Agent check:** Did Mistral return pages? Check for OCR output files.
**Error handling:**
- PDF too large? Split and re-OCR.
- Mistral timeout? Retry with backoff (rate-limiter handles this).
- Mistral returns empty? The PDF may be scanned images only. Proceed anyway.

### Step 4: Structure (AI Extraction)

```powershell
npx tsx src/extractors/structurer.ts --input data/{exam}/ocr/{file}.json --output data/{exam}/extracted/
```

**Agent check:** Did AI return valid JSON questions?
**Error handling:**
- JSON parse error? Re-prompt Gemini/Cerebras with stricter instructions.
- Zero questions returned? Try the other model.
- Questions but no answers? The time-travel backfill should handle this.
- Partial garbage? Extract what's valid, flag the rest.

### Step 5: Cache Diagrams

```powershell
npx tsx src/extractors/diagram-cacher.ts --input data/{exam}/ocr/{file}.json --output data/{exam}/diagrams/
```

**Agent check:** Do diagram files exist on disk?
**Error handling:**
- Sharp not installed? Falls back to uncropped images (graceful).
- No diagrams? Fine — most papers have few or none.

### Step 6: Validate

```powershell
npx tsx src/validators/auto-validator.ts --path data/{exam}/{year}/{shift}/
```

**Agent check:** Read the validation report.
- 0 errors? Proceed.
- Errors? Fix them automatically if possible (e.g., missing topics → topic-normalizer),
  otherwise present to user with the specific field that failed.

### Step 7: Finalize (Export)

```powershell
npx tsx src/finalizers/exporter.ts --exam {exam} --year {year} --shift {shift}
```

**Agent check:** Does `data/{exam}/{year}/{shift}/paper.json` exist? Check checksum.
**Error handling:**
- Exporter crashes? Likely a missing field in the data. Read error, fix the data, retry.

### Step 8: Human Review Loop (CRITICAL — agent drives this)

Run the CLI review:

```powershell
npm run review -- --exam {exam} --year {year} --shift {shift}
```

**BUT** this opens interactive terminal. The agent CANNOT press keys.
**Instead, the agent must present questions to the user manually:**

```
Agent: "Here's question 1 of 90:
  ID: jeemain-2025-22jan-s1-ph-001
  Number: 1
  Type: mcq
  Subject: physics
  Topic: kinematics
  Text: A particle moves along x-axis with velocity v = 2t m/s. ...
  Options:
    0: 1 m
    1: 2 m
    2: 4 m
    3: 8 m
  AI Answer: 2 (index 2)

  Accept? (yes / edit / skip / flag)
```

Then process each question based on user response:
- **yes** → mark accepted in `.review-progress.json`
- **edit** → user provides corrected text → update the question
- **skip** → mark skipped, come back later
- **flag** → user provides note → save flag

After ALL questions reviewed (or user says "accept all remaining"):

### Step 9: Sign Off

```powershell
npm run signoff -- --exam {exam} --year {year} --shift {shift} --status verified
```

### Step 10: Verify

```powershell
npm run verify
npm run rebuild-index
npm run stats
```

Report back to user: *"JEE Main 2025 22jan-shift1: 90 questions verified, 0 errors, 3 diagrams. Dataset ready at data/jeemain/2025/22jan-shift1/"*

---

## 5. Agent Review Loop (Alternative — Phase 9 Cross-Validation)

If user doesn't want to manually review 90 questions, run cross-validation:

```powershell
# Step 3 and 4: Run BOTH Cerebras AND Gemini on same OCR output
npx tsx src/extractors/structurer.ts --input ... --model cerebras --output extracted-cerebras.json
npx tsx src/extractors/structurer.ts --input ... --model gemini --output extracted-gemini.json

# Step: Cross-validate
npx tsx src/cross-validate/cross-validator.ts --a extracted-cerebras.json --b extracted-gemini.json

# Opens HTML report. Present ONLY diffs to user:
```

**Flow:**
- Matched questions (80-95%) → auto-accepted
- Diffs only → present to user for resolution
- User reviews 5-15 questions instead of 90
- Update consensus via `buildConsensus()` with manual resolutions

---

## 6. Self-Healing — Common Errors and Fixes

| Symptom | Likely Cause | Fix |
|---|---|---|
| `npm install` fails | Node version <18 | `node --version`, tell user to install Node 18+ |
| `tsc --noEmit` errors | Missing types or bad import | Read error, fix the TypeScript, retry |
| 404 scraping | URL pattern or shift not released | Try gateoverflow, or tell user shift unavailable |
| Mistral returns no text | Password-protected PDF | Tell user, skip this paper |
| Cerebras JSON parse fail | AI returned markdown-wrapped JSON | Strip ```json fences, retry parse |
| Cerebras returns 0 questions | Context window exceeded | Split pages, retry with smaller batch |
| GPT returns garbage | Unclear instructions | Re-prompt with stricter schema, add examples |
| Validator errors on type | AI assigned wrong type | Correct type based on answer structure |
| Validator errors on topic | Unknown topic string | Run topic-normalizer, fallback to general-{subject} |
| Exporter crashes | Missing required field | Find missing field, add default value, retry |
| Review CLI hangs | stdin not interactive | Fall back to manual review loop (agent presents each q) |
| Checksum mismatch | File modified after export | Re-run exporter, ensure no concurrent writes |
| `npm run api` port busy | Port 3456 in use | Kill process: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3456).OwningProcess` |

---

## 7. Known Limitations (Don't Waste Time On)

1. **Sharp native module** — Optional. Diagram cropping works without it (returns uncropped).
   Don't install sharp via npm — it needs native build tools on Windows. Uncropped is fine.
2. **Bilingual NEET papers** — `textHi` field is populated only when Mistral detects Hindi.
   If `textHi` is null, that's fine — some NEET papers are English-only.
3. **Kaggle import datasets** — confidence=low. These need human review even more than AI-extracted.
4. **Gateoverflow JEE Main 2023** — Mirrors only. Some shifts may be missing.
5. **Assertion-reason options** — NEVER stored in JSON. Generated on-the-fly by adapter or display.
6. **Match-columns** — Stored as MCQ with 4 pairing options. This matches JEE Advanced format exactly.

---

## 8. Environment Variables Reference

```powershell
$env:MISTRAL_API_KEY             # Required for OCR
$env:NVIDIA_API_KEY              # Optional — 40 RPM, recommended primary extraction
$env:CEREBRAS_API_KEY            # Optional — 5 RPM, falls back to NVIDIA
$env:GEMINI_API_KEY              # Optional — 5 RPM
$env:LONGCAT_API_KEY             # Optional — 50M tokens
$env:POOLSIDE_API_KEY            # Optional — poolside/laguna-m.1
$env:VC_API_KEY                  # Optional — Vanchin KAT-Coder-Air-V1
$env:KAGGLE_USERNAME          # Optional, for Kaggle import
$env:KAGGLE_KEY               # Optional, for Kaggle import
$env:EDITOR                   # Editor for review edit mode (default: notepad)
$env:LOG_LEVEL                # debug | info | warn | error (default: info)
$env:PORT                     # API server port (default: 3456)
```

---

## 9. All Commands Reference

```powershell
# Setup
cd C:\QUESTION-PIPELINE
npm install
npx tsc --noEmit                     # Verify compilation

# Scrape
npm run scrape -- --exam jeemain --year 2025 --shifts 2
npm run scrape -- --exam neet --year 2024
npm run scrape -- --exam jeeadv --year 2024

# Full pipeline (scrape + OCR + extract + finalize)
npm run batch -- --exam jeemain --year 2025 --shift 22jan-shift1

# Individual stages (when batch fails)
npx tsx src/extractors/ocr-stage.ts --input data/jeemain/raw/jeemain-2025-22jan-s1.pdf --output data/jeemain/ocr/
npx tsx src/extractors/structurer.ts --input data/jeemain/ocr/jeemain-2025-22jan-s1.json --output data/jeemain/extracted/
npx tsx src/extractors/diagram-cacher.ts --input data/jeemain/ocr/jeemain-2025-22jan-s1.json
npx tsx src/validators/auto-validator.ts --path data/jeemain/2025/22jan-shift1/
npx tsx src/finalizers/exporter.ts --exam jeemain --year 2025 --shift 22jan-shift1

# Review
npm run review -- --exam jeemain --year 2025 --shift 22jan-shift1
npm run signoff -- --exam jeemain --year 2025 --shift 22jan-shift1 --status verified

# Cross-validation (Phase 9)
npx tsx src/extractors/structurer.ts --model cerebras --input ... --output extracted-cerebras.json
npx tsx src/extractors/structurer.ts --model gemini --input ... --output extracted-gemini.json
npx tsx src/cross-validate/cross-validator.ts --a extracted-cerebras.json --b extracted-gemini.json

# Post-processing
npm run stats
npm run verify
npm run rebuild-index
npm run api

# Export open-source
npm run export -- --license cc-by-4.0 --output ./export --include exam,year,shift

# Manual diagram caching
npx tsx src/extractors/diagram-cacher.ts --input data/jeemain/ocr/jeemain-2025-22jan-s1.json
```

---

## 10. Agent Script — Full Autonomous Run

When user says "go", execute this sequence:

```powershell
# 1. Verify environment
if (-not $env:MISTRAL_API_KEY) { throw "MISTRAL_API_KEY not set" }
if (-not $env:CEREBRAS_API_KEY) { throw "CEREBRAS_API_KEY not set" }
npm install

# 2. Ask what to scrape
# User: "jeemain 2025 22jan-shift1"

# 3. Scrape
npm run scrape -- --exam jeemain --year 2025 --shifts 1

# 4. OCR
npx tsx src/extractors/ocr-stage.ts --input data/jeemain/raw/jeemain-2025-22jan-s1.pdf --output data/jeemain/ocr/
# If >3.5MB, the module auto-chunks. Check output.

# 5. Extract
npx tsx src/extractors/structurer.ts --input data/jeemain/ocr/jeemain-2025-22jan-s1.json --output data/jeemain/extracted/
# If fail → try Gemini. If both fail → present raw OCR to user.

# 6. Validate
npx tsx src/validators/auto-validator.ts --path data/jeemain/2025/22jan-shift1/

# 7. Finalize
npx tsx src/finalizers/exporter.ts --exam jeemain --year 2025 --shift 22jan-shift1

# 8. Report → user reviews
Write-Host "90 questions extracted. Ready for review."
# Present questions one by one, collect responses.
```

---

## 11. Questions File — Canonical JSON Schema

Source of truth: `src/types.ts`. Brief reference:

```typescript
interface QuestionFile {
  schema: "v4";
  exam: string;        // "jeemain" | "neet" | "jeeadv" | "ncert-exemplar"
  year: number | null;
  shift: string | null;
  paper: string | null;
  subjects: string[];
  total: number;
  duration: number;
  marksCorrect: number;
  marksIncorrect: number;
  marksUnanswered: number;
  sections: Record<string, SectionConfig>;
  scrapedAt: string;
  checksum: string;
  questions: Question[];
  passages: Passage[];
}

interface Question {
  id: string;
  number: number;
  numberLabel: string | null;
  subject: string;
  topic: string;
  section: string | null;
  type: "mcq" | "msq" | "nat" | "assertion-reason";
  text: string;
  textHi: string | null;
  options: string[] | null;
  answer: string;           // MCQ: "0"-"3". NAT: numeric string
  answers: string[] | null; // MSQ: sorted indices
  answerPrecision: AnswerPrecision | null;
  marks: number;
  negativeMarks: number;    // 0 for NAT
  passageId: string | null;
  solution: string | null;
  solutionFormat: "plain" | "html" | "markdown" | "latex" | null;
  hasDiagram: boolean;
  diagrams: Diagram[] | null;
  difficulty: "easy" | "medium" | "hard" | null;
  tags: string[];
  revision: number;
  source: "official-pdf" | "reconstructed" | "imported-kaggle" | "imported-dataset";
  confidence: "high" | "medium" | "low" | null;
}
```

AR options (auto-generated, NEVER stored):
```
0 = "Both A and R are true and R is the correct explanation of A"
1 = "Both A and R are true but R is NOT the correct explanation of A"
2 = "A is true but R is false"
3 = "A is false but R is true"
```

---

## 12. ID Scheme

```
{exam}-{year}-{shift-shorthand}-{subject-code}-{3-digit-number}

jeemain-2025-22jan-s1-ph-001
neet-2025-04may-bi-045
jeeadv-2025-p1-ch-012
ncert-exemplar-11-ph-023

Subject codes: ph / ch / ma / bi
3-digit: zero-padded, matches subject-file number
Tombstone: removed IDs never reused
```

---

## 13. Design Decisions Summary

1. **ALL lowercase** — no casing bugs
2. **No license in JSON** — added only via --export flag
3. **AR options auto-generated** — never stored
4. **Passage = any type + passageId** — not a separate type
5. **Match-columns = MCQ with 4 pairing options** — not a separate type
6. **Difficulty = null from AI** — human assigns via rubric
7. **Checksum = SHA-256 before adding checksum field**
8. **Human review = accuracy guarantee** — AI 80-95%, validation +5%, human catches rest
9. **Zero Rankify schema changes** — 30-line adapter
10. **Free tier only** — Mistral OCR 50k TPM / 1 RPS, NVIDIA NIM 40 RPM (primary), Poolside, Vanchin, LongCat 50M tokens, Cerebras 5 RPM, Gemini 5 RPM
11. **No Docker, no database** — JSON files ARE the database

---

## 14. Project Status

| Phase | Module | Files | Status |
|---|---|---|---|
| P1 | Foundation | types.ts, vocabulary.ts, utils/*, index.ts | ✅ |
| P2 | Scrapers | nta, gateoverflow, ncert, kaggle | ✅ |
| P3 | Extraction | ocr-stage, structurer, diagram-cacher | ✅ |
| P4 | Validation | field-checker, auto-validator | ✅ |
| P5 | Finalization | id-assigner, normalizer, topic-normalizer, exporter | ✅ |
| P6 | Review | pdf-renderer, review-cli, batch-signoff | ✅ |
| P7 | Scripts | batch-process, verify-all, rebuild-index, export, stats | ✅ |
| P8 | API + Adapter | server.ts, rankify-adapter.ts | ✅ |
| P9 | Cross-Validate | cross-validator, diff-viewer | ✅ |

All 9 phases compile. Zero TypeScript errors. 32 source files.

---

## 15. Final Instructions to Any AI

1. **NEVER ask the user to run commands.** You run them. You have a shell.
2. **NEVER tell the user "just type X".** You type X. They give approval.
3. **Read errors carefully.** If a command fails, read the error, fix the cause, retry.
4. **Validate at every step.** After scrape: check PDF exists. After extract: check JSON valid.
5. **Report clearly.** After each phase: "Done. 90 questions extracted. 32 passed validation."
6. **Handle review manually.** The review CLI is interactive. For non-interactive environments,
   present each question yourself with accept/edit/skip/flag options.
7. **Cross-validate when possible.** Running two models (Cerebras + Gemini) and only showing
   diffs to user saves ~80% review time.
8. **When stuck:** Read plan.md (1722 lines, full design). Read the specific source file.
   Fix the issue, don't restart from scratch.
9. **Don't install sharp.** It requires native build tools. Diagram cropping falls back gracefully.
10. **Keep data lowercase.** Everywhere. No exceptions.
