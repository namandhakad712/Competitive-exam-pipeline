# AGENT.md — Question Pipeline Operational Manual

> Agent-agnostic. Any AI reading this can autonomously run the full pipeline.
> Every file, every command, every error pattern, every loop.
> Last updated: 2026-05-20

## ⚠️ HARD RULE #0: NEVER FABRICATE DATA

**You must actually run the pipeline. You must NOT:**

- ❌ Generate questions from your training data / memory / knowledge instead of running the real pipeline
- ❌ Output sample/example JSON as if it were real extracted data
- ❌ Silently fall back to "mock mode" or "demo mode" when APIs fail
- ❌ Skip pipeline stages and make up results
- ❌ Use any data not derived from the actual PDF + actual API calls

**If the pipeline cannot complete (all providers fail, compilation breaks, PDF not found, etc.):**
→ **Fail loudly.** Tell the user exactly what broke and what's needed to fix it.
→ Example: *"All 6 AI providers failed to respond. Check your API keys, then run `npm run test-models`."*
→ Example: *"PDF for jeemain 2025 shift 2 returned 404. This shift may not be released yet."*

**A failed run with an honest error is 1000× better than a fabricated success.** Fabricated data poisons the dataset, wastes the user's time, and erodes trust. The user would rather see a red error than green fake numbers.

---

## 2. First Contact — What to Do When User Gives API Keys

```powershell
cd .
$env:MISTRAL_API_KEY = "sk-..."
$env:NVIDIA_API_KEY = "nvapi-..."
$env:LONGCAT_API_KEY = "sk-..."
$env:POOLSIDE_API_KEY = "..."
$env:VC_API_KEY = "..."
$env:GEMINI_API_KEY = "AIzaSy..."
$env:CEREBRAS_API_KEY = "..."
npm install
```

Then ask: *"Which exam and shift? e.g. jeemain 2025 22jan-shift1"*

---

## 3. Directory — Every File by Role

```
.\
  AGENT.md              THIS FILE
  prompts/
    one-shot-prompt.md    For AI chat apps (PDF only, no diagrams)
    AI-START-COMMAND.md   Session start instructions
  docs/
    getting-started.md    Quick-start for humans
    human-intervention.md When to pause and ask
    model-limits.md       Provider rate limits
    previous-plans/       Historical design docs
  package.json            scripts: scrape, batch, process-pdf, review, signoff, verify, stats,
                           status, api, export, test-models, rebuild-index, test
  tsconfig.json
  .checkpoints.json       Auto-tracked — which shifts have been processed

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
                            Two modes:
                              - ocrPdf(): standard OCR (returns OcrResult)
                              - enhancedOcrPdf(): +structured annotations via Mistral document_annotation_format
                                with JSON schemas for exam_questions + answer_key detection + bbox_annotation.
                                Returns EnhancedOcrResult with structuredAnnotation and bboxAnnotation fields.
                                Automatically enabled in process-pdf.ts (--use-enhanced-ocr / -e).

      # ⚠️ FREE-TIER NOTE: Providers/models/limits change frequently.
      # Update structurer.ts (models + priority), rate-limiter.ts (RPM limits),
      # and test-models.ts (health checks) when something breaks.
      structurer.ts        Single-provider + distributedExtract(). Priority: NVIDIA > LongCat > Poolside > Vanchin > Gemini > Cerebras.
                            For >12 pages: splits into overlapping 15-page chunks (5-page overlap), assigns providers round-robin in
                            parallel, retries failed chunks with next provider. Results merged + deduplicated by merger.ts.
      chunker.ts           splitIntoChunks(pages, 15, 5) → overlapping page groups. Guarantees no question spans across chunks.
      merger.ts            mergeChunks() — dedup by Q number. Prefers: non-empty answer > longer options > earlier chunk.
                            textSimilarity() uses Mistral embeddings API via src/utils/embeddings.ts,
                            falls back to Jaccard word-set similarity when API unavailable.
      consensus-extractor.ts Multi-provider consensus extraction.
                            extractWithConsensus(pages, exam, providers) runs 3 providers in parallel,
                            majority-vote per field, builds ConsensusResult with confidence scores
                            (high ≥0.8, medium ≥0.5, low) and conflict detection.
                            distributedConsensusExtract() for >12-page PDFs.
      progressive-review.ts Chunk-by-chunk human-in-loop review.
                            progressiveExtract() shows sample question after each chunk,
                            prompts [c]ontinue/[r]etry/[a]bort. Falls back to non-interactive
                            when !process.stdin.isTTY.
      auto-repair.ts        validateExtraction() checks question count, missing answers, invalid option counts.
                            autoRepair() re-extracts answer key pages, repairOptions() splits merged options,
                            re-extracts with strict prompt on count mismatch.

      diagram-cacher.ts    Decodes base64 images from Mistral → PNG files.
                            Two modes:
                              - Legacy: page-level images from Mistral OCR
                              - Mistral-aware: uses pre-extracted images from enhanced OCR, links via
                                image references in markdown (findImageById()), preserves bbox coordinates.
                            Saves to: {shiftDir}/diagrams/{subject}/q{number}-fig{n}.png
                            (shiftDir = data/{exam}/{year}/{shift}/) — per-shift, not global.

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
                           3. assignIds() — subject-relative numbering
                           4. writeDataset(): writes subject JSONs FIRST (physics.json etc),
                              then paper.json SECONDARY (merged from subjects).
                           5. updateIndex() — register in data/index.json
                           Output dir: data/{exam}/{year}/{shift}/
                           Diagrams:   data/{exam}/{year}/{shift}/diagrams/{subject}/
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
                            Endpoints (live dashboard at http://localhost:3456/dashboard):
                              GET  /api/v1/events              — SSE real-time stream (status, logs, files, review)
                              GET  /api/v1/pipeline/status     — Current pipeline state + last 100 logs
                              GET  /api/v1/pipeline/stages     — List all available stages
                              POST /api/v1/pipeline/run        — Trigger a pipeline stage (scrape, extract, etc.)
                              POST /api/v1/pipeline/custom     — Run any shell command (output streams live via SSE)
                              POST /api/v1/pipeline/stop       — Kill running process
                              POST /api/v1/review/start        — Start human review session
                              GET  /api/v1/review/current      — Get current review question
                              POST /api/v1/review/action       — Accept / edit / skip / flag a question
                              POST /api/v1/review/cancel       — Cancel review session
                              GET  /api/v1/files/list          — Real file listing from data/ with metadata
                              GET  /api/v1/files/tree          — Full directory tree
                              GET  /api/v1/questions           — Query questions (existing)
                              GET  /api/v1/questions/count     — Question count (existing)
                              GET  /api/v1/exams               — Exam list (existing)
                              GET  /api/v1/stats               — Dataset statistics (existing)
                              GET  /api/v1/diagrams/:path      — Serve diagram images (existing)
                              GET  /dashboard                  — Serves dashboard.html UI
                            CORS open (Access-Control-Allow-Origin: *)

    utils/
      pdf-downloader.ts    Downloads PDF with retry (3x), validates PDF magic bytes (%PDF),
                            parallel downloads via Promise.all. DownloadProgress callback.

      rate-limiter.ts    Queue + window-based throttling. Configs:
                             Mistral OCR: 60 req/min (1 RPS enforcement),
                             NVIDIA Qwen3 Coder 480B: 40 req/min,
                             LongCat Flash Lite: 30 req/min,
                             Poolside Laguna M.1: 30 req/min,
                             Vanchin KAT-Coder: 20 req/min,
                              Gemini 3.1 Flash Lite: 15 req/min (250k TPM, 500 RPD),
                             Cerebras GPT-OSS-120B: 5 req/min (30k TPM)
                             Queue + window-based throttling. RateLimiter class.

      embeddings.ts        Mistral embeddings API client.
                            embed(text) → number[] with rate limiting (60 req/min) and LRU cache.
                            cosineSimilarity(a, b) → number (dot product / magnitude product).
                            semanticSimilarity(a, b) → number (embeds both texts, compares).
                            Used by merger.ts for semantic deduplication.

      metrics.ts           Accuracy tracking against golden dataset.
                            computeMetrics(extracted, golden) → MetricsReport with per-field accuracy.
                            compareProviders(results) → inter-provider agreement matrix.
                            saveMetric() / loadMetrics() for historical comparison.
                            getAccuracyTrends() across all runs.

      checkpoints.ts       Stage-level tracking (ocr/extract/diagrams/validate/export).
                            saveStageCache() / loadStageCache() for intermediate results.
                            getResumePoint() for failure resume.

      hash-utils.ts        SHA-256 via crypto.subtle. Functions:
                              computeChecksum(data: string): string
                              verifyChecksum(data: string, expected: string): boolean

      logger.ts            Structured logging: info, warn, error, debug.
                            Respects LOG_LEVEL env var (debug|info|warn|error).

      integrity.ts         Walks data/ and verifies SHA-256 checksums on all paper.json files.
                            Returns: { totalFiles, passed, failed, missing }
                            Verify every time before accepting a dataset as clean.


```

---

## 4. Pipeline Loop — The Agent Must Execute This

This is the core loop. You do ALL of these steps. User only provides API keys and approval.

### Step 1: Install & Verify

```powershell
cd .
npm install
# Verify tsconfig compiles:
npx tsc --noEmit
# If errors, fix them first. Never proceed with broken build.
```

### Step 2: Scrape

```powershell
# First, check if already processed:
npm run status
```

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

Two options:

**Option A — Web Dashboard (recommended):**
Start the API server, then open the dashboard:
```powershell
npm run api
# Open http://localhost:3456/dashboard in browser
# Click "Review" button → enter exam/year/shift → review questions with accept/edit/skip/flag
```

**Option B — Manual CLI review:**
Run the CLI review tool:

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
npm run status
```

Report back to user: *"JEE Main 2025 22jan-shift1: 90 questions verified, 0 errors, 3 diagrams. Dataset ready at data/jeemain/2025/22jan-shift1/"*

---

## 5. Alternative Input: Manual PDF Processing

When the official NTA site has separate question paper + answer key PDFs — or you have a PDF from a 3rd party (Allen, Esaral, Add247, etc.) — use manual input mode.

### Where to get good PDFs

| Source | Answer key included? | Quality |
|---|---|---|
| **Allen / Esaral / Add247** | ✅ Yes — embedded at end of PDF | High — already has solutions |
| **Official NTA site** | ❌ No — separate answer key PDF | Medium — need to merge |
| **gateoverflow.in** | ✅ Usually yes | Medium — mirror quality |

### How to process a PDF manually

```powershell
# Single PDF with answer key embedded (Allen, Esaral, Add247, Gateoverflow):
npm run process-pdf -- --input "C:/path/to/JEE-Main-2025-22Jan-Shift-1.pdf"

# PDF + separate answer key PDF (official NTA):
npm run process-pdf -- --input "C:/path/to/question-paper.pdf" --answer-key "C:/path/to/answer-key.pdf"

# If filename doesn't match expected patterns, specify manually:
npm run process-pdf -- --input "my-paper.pdf" --exam jeemain --year 2025 --shift "22jan-s1"

# Enhanced OCR with structured annotations (default on):
npm run process-pdf -- --input "paper.pdf" --use-enhanced-ocr

# Multi-provider consensus extraction (3 providers in parallel):
npm run process-pdf -- --input "paper.pdf" --use-consensus

# Full power: consensus + enhanced OCR:
npm run process-pdf -- --input "paper.pdf" -c -e
```

### Filename patterns the parser understands

| Pattern | Parsed as |
|---|---|
| `JEE-Main-2025-22-Jan-Shift-1.pdf` | jeemain, 2025, "22jan-s1" |
| `neet-2024-04-may.pdf` | neet, 2024, "04may-s1" |
| `jee-advanced-2024-paper-1.pdf` | jeeadv, 2024, "p1" |
| `NCERT-Exemplar-11-Physics.pdf` | ncert-exemplar, class 11 |

If parsing fails, the script tells you and asks for `--exam`, `--year`, `--shift` flags.

### How separate answer key PDFs work

1. Question paper PDF → Mistral OCR → markdown
2. Answer key PDF → Mistral OCR → markdown
3. Both markdown texts are **merged** (answer key appended to questions)
4. Merged text → AI extraction (structurer finds the answer key naturally)
5. Pipeline completes as normal

This means **official NTA PDFs work too** — just provide both files.

### Drop PDFs in `input/` folder

Put any PDF in `.\input\` and reference it:
```powershell
npm run process-pdf -- --input "input/Allen-JEE-2025-22Jan.pdf"
```

### Where output goes

Same as normal pipeline: `data/{exam}/{year}/{shift}/paper.json`

### Checkpoint system — no double processing

After a shift is processed successfully, a checkpoint is recorded in `.checkpoints.json`.
Running the same shift again will skip it unless you pass `--force`:

```powershell
# see what's been processed
npm run status

# reprocess an existing shift
npm run process-pdf -- --input "input/paper.pdf" --force
```

Example `npm run status` output:

```
EXAM           YEAR   SHIFT        QUESTIONS  SUBJECTS                      DATE
jeemain        2025   22jan-s1     90         physics, chemistry, mathematics 2026-05-20
neet           2024   04may-s1     200        physics, chemistry, biology     2026-05-19

Total: 2 shift(s)
```

---

## 6. Agent Review Loop (Alternative — Phase 9 Cross-Validation)

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
| GPT returns garbage | Unclear instructions | Re-prompt with stricter schema, verify output against PDF |
| Validator errors on type | AI assigned wrong type | Correct type based on answer structure |
| Validator errors on topic | Unknown topic string | Run topic-normalizer, fallback to general-{subject} |
| Exporter crashes | Missing required field | Find missing field, add default value, retry |
| Review CLI hangs | stdin not interactive | Fall back to manual review loop (agent presents each q) |
| Checksum mismatch | File modified after export | Re-run exporter, ensure no concurrent writes |
| `npm run api` port busy | Port 3456 in use | Kill process: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3456).OwningProcess` |
| **ALL providers fail** | All 6 AI APIs down or keys expired | **Tell user. Do NOT fabricate data. Do NOT fall back to training data. Stop.** |

**⚠️ NEVER fabricate pipeline output.** If you cannot run a stage, say so. Do NOT generate fake paper.json from your knowledge — the user would rather see an error than corrupt data.

---

## 7. Known Limitations (Don't Waste Time On)

1. **Sharp native module** — Optional. Diagram cropping works without it (returns uncropped).
   Don't install sharp via npm — it needs native build tools on Windows. Uncropped is fine.
2. **Bilingual NEET papers** — `textHi` field is populated only when Mistral detects Hindi.
   If `textHi` is null, that's fine — some NEET papers are English-only.
3. **Kaggle import datasets** — confidence=low. These need human review even more than AI-extracted.
4. **Gateoverflow JEE Main 2023** — Mirrors only. Some shifts may be missing.
5. **Assertion-reason options** — NEVER stored in JSON. Generated on-the-fly by display layer.
6. **Match-columns** — Stored as MCQ with 4 pairing options. This matches JEE Advanced format exactly.

---

## 8. Environment Variables Reference

```powershell
$env:MISTRAL_API_KEY             # Required for OCR
$env:NVIDIA_API_KEY              # Optional — 40 RPM, Qwen3 Coder 480B, preferred primary extraction
$env:LONGCAT_API_KEY             # Optional — 30 RPM, 256K output, best for large papers
$env:POOLSIDE_API_KEY            # Optional — 30 RPM, 131K ctx, requires enable_thinking=false
$env:VC_API_KEY                  # Optional — 20 RPM, Vanchin KAT-Coder
$env:CEREBRAS_API_KEY            # Optional — 5 RPM, last resort (max_completion_tokens not max_tokens)
$env:GEMINI_API_KEY              # Optional — 15 RPM · 500 RPD
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
cd .
npm install
npx tsc --noEmit                     # Verify compilation

# Scrape
npm run scrape -- --exam jeemain --year 2025 --shifts 2
npm run scrape -- --exam neet --year 2024
npm run scrape -- --exam jeeadv --year 2024

# Full pipeline (scrape + OCR + extract + finalize)
npm run batch -- --exam jeemain --year 2025 --shift 22jan-shift1

# Process PDF manually with enhanced OCR and consensus
npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf"
npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf" --use-consensus   # 3-provider consensus
npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf" -c -e             # consensus + enhanced OCR

# Test Mistral structured annotations (check if API returns correct format)
npm run test-mistral -- "input/neet-2025-04may-s1.pdf"

# Full pipeline test (end-to-end verification)
npm run test-full-pipeline -- "input/neet-2025-04may-s1.pdf"

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
9. **Free tier only** — Mistral OCR 50k TPM / 1 RPS, NVIDIA Qwen3 Coder 480B 40 RPM / 262K ctx (primary), LongCat Flash Lite 30 RPM / 256K output / 50M tokens (best for big papers), Poolside Laguna M.1 30 RPM / 131K ctx (enable_thinking=false), Vanchin KAT-Coder 20 RPM / 2M TPM, Gemini 3.1 Flash Lite 15 RPM / 500 RPD, Cerebras gpt-oss-120b 5 RPM / 65K ctx (max_completion_tokens)
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
| P8 | API | server.ts | ✅ |
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
8. **When stuck:** Read docs/previous-plans/PLAN.md (1722 lines, full design). Read the specific source file.
   Fix the issue, don't restart from scratch.
9. **Don't install sharp.** It requires native build tools. Diagram cropping falls back gracefully.
10. **Keep data lowercase.** Everywhere. No exceptions.
11. **⚠️ HARD RULE: NEVER fabricate pipeline output.** If the pipeline fails at any stage (all 6 providers down, compilation broken, PDF unreachable), tell the user the exact failure. Do NOT generate fake paper.json from your training data, do NOT fill gaps with "common questions everyone knows." A loud honest error is worth 1000× more than silent corrupted data.
