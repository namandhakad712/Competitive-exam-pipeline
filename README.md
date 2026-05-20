# question-pipeline

> **Batch pipeline for Indian exam question extraction and JSON dataset generation**  
> Automatically downloads PDFs, performs OCR, extracts questions via multi-AI consensus, validates, and exports structured datasets.

<p align="center">
  <img src="https://img.shields.io/badge/status-production-green" alt="Status">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node">
  <img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-CC%20BY%204.0-lightgrey" alt="License">
  <img src="https://img.shields.io/badge/dependencies-0%20runtime-brightgreen" alt="Zero Runtime Dependencies">
  <img src="https://img.shields.io/badge/coverage-32%20files%20%7C%200%20errors-success" alt="Build">
</p>

---

## Table of Contents

- [What is Question-Pipeline?](#what-is-question-pipeline)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Supported Exams](#supported-exams)
- [Tech Stack](#tech-stack)
- [Directory Structure](#directory-structure)
- [Pipeline Flow — Detailed](#pipeline-flow--detailed)
- [JSON Schema](#json-schema)
- [AI Provider System](#ai-provider-system)
- [Installation & Setup](#installation--setup)
- [Usage — CLI Commands](#usage--cli-commands)
- [Web Dashboard](#web-dashboard)
- [API Reference](#api-reference)
- [Human Review Workflow](#human-review-workflow)
- [Cross-Validation System](#cross-validation-system)
- [Anti-Hallucination Design](#anti-hallucination-design)
- [ID Scheme](#id-scheme)
- [Topic Vocabulary](#topic-vocabulary)
- [Validation — 32 Automated Checks](#validation--32-automated-checks)
- [Error Handling & Self-Healing](#error-handling--self-healing)
- [Model Limits & Rate Limiting](#model-limits--rate-limiting)
- [Testing](#testing)
- [Project Status](#project-status)
- [Environment Variables](#environment-variables)
- [Design Decisions](#design-decisions)

---

## What is Question-Pipeline?

**Question-Pipeline** is a fully automated, zero-dependency Node.js/TypeScript system that transforms Indian exam PDFs (JEE Main, NEET, JEE Advanced, NCERT Exemplar) into high-quality structured JSON datasets.

The pipeline handles the entire lifecycle:

```
Raw PDF  →  OCR  →  AI Extraction (6 providers)  →  Multi-Provider Consensus  →  
Validation (32 checks)  →  Normalization  →  Export →  Human Review →  Sign-off
```

It is designed as both an **autonomous AI-driven system** (any AI agent can run it end-to-end) and a **developer-managed pipeline** (CLI + REST API + web dashboard).

The project was born from a simple observation: high-quality structured exam data is essential for EdTech platforms, tutoring apps, and AI training, yet extracting it from PDFs reliably at scale remains a hard unsolved problem. Question-Pipeline solves this with a **multi-provider consensus architecture**, **anti-hallucination safeguards**, and a **human-in-the-loop review system**.

### Why This Exists

Indian exam PDFs are messy:
- No standardized format across years or exam bodies
- Answer keys are sometimes embedded, sometimes separate, sometimes missing entirely
- Bilingual papers (Hindi/English) with mixed layouts
- Diagrams embedded as images with no alt text
- Handwritten annotations in scanned PDFs

Manual extraction doesn't scale. Pure AI extraction hallucinates. Question-Pipeline bridges the gap with a **defense-in-depth** approach.

---

## Key Features

| Feature | Description |
|---|---|
| **Multi-Provider AI Extraction** | 6 AI providers ranked by reliability; runs top 3 in parallel for consensus |
| **Zero Runtime Dependencies** | Pure Node.js built-ins (`fetch`, `http`, `crypto`, `fs`) — no Express, no MongoDB, no Docker |
| **Mistral AI OCR** | High-accuracy PDF-to-markdown with embedded image extraction |
| **Multi-Provider Consensus** | Majority-vote per field across 3 parallel AI providers with confidence scoring |
| **32 Automated Validations** | Per-type field checks, structural integrity, topic normalization, checksums |
| **Auto-Repair** | Detects missing answers, merged options, count mismatches and re-extracts intelligently |
| **Human Review CLI + Dashboard** | Interactive terminal review (vim-like keys) + web dashboard with SSE live updates |
| **Cross-Validation** | Compare two providers, generate HTML diff reports, review only disagreements |
| **REST API + SSE** | Native HTTP server with real-time event streaming, file browsing, and pipeline control |
| **Checkpoint Resume** | Every stage is checkpointed — resume from any failure |
| **Anti-Hallucination by Design** | Never fabricates data; fails loudly with honest errors |
| **Topic Normalization** | 250+ aliases → controlled vocabulary, with Levenshtein + cosine similarity fallback |
| **LaTeX Normalization** | 60+ LaTeX-to-Unicode mappings, OCR ligature fixes |
| **Bilingual Support** | `textHi` field for Hindi/English NEET papers |
| **Rankify Adapter** | Zero-schema-change adapter for Rankify platform |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        QUESTION-PIPELINE                                 │
│                                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │ SCRAPERS │    │  INPUT   │    │   API    │    │  WEB DASHBOARD   │   │
│  │          │    │  FOLDER  │    │ SERVER   │    │                  │   │
│  │ NTA      │    │  input/  │    │ port 3456│    │ dashboard.html   │   │
│  │ GateOver │───▶│          │───▶│          │───▶│ pipeline-canvas  │   │
│  │ NCERT    │    │ *.pdf    │    │ REST+SSE │    │ flow-v2.html     │   │
│  │ Kaggle   │    │          │    │          │    │                  │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                    CORE PIPELINE                                  │    │
│  │                                                                   │    │
│  │  ┌──────┐    ┌──────┐    ┌──────────┐    ┌──────────┐           │    │
│  │  │ OCR  │───▶│CHUNK │───▶│ EXTRACT  │───▶│  MERGE   │           │    │
│  │  │Mistral│   │15pg+5│    │6 Providers│   │Dedup+Pick│           │    │
│  │  │  API  │    │overlap│   │Distributed│   │  Best    │           │    │
│  │  └──────┘    └──────┘    └──────────┘    └──────────┘           │    │
│  │       │                                              │          │    │
│  │       ▼                                              ▼          │    │
│  │  ┌──────────┐                                    ┌──────────┐   │    │
│  │  │ DIAGRAM  │                                    │ CONSENSUS│   │    │
│  │  │ CACHER   │                                    │ 3 Par-   │   │    │
│  │  │ PNG base64│                                   │ allel AI │   │    │
│  │  └──────────┘                                    │ + Vote   │   │    │
│  │                                                   │          │   │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────┴────┐    │    │
│  │  │VALIDATE  │──▶│ AUTO-   │──▶│ FINALIZE │──▶│  EXPORT  │    │    │
│  │  │32 Checks │  │ REPAIR   │  │ Normalize │   │ paper.json│   │    │
│  │  │          │  │ Re-extract│ │ Assign IDs │   │ subjects/ │   │    │
│  │  │          │  │ Fix opts  │ │ Checksums  │   │ index.json│   │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └───────────┘    │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────┐  ┌─────────────────────────┐   │
│  │         HUMAN REVIEW                 │  │   CROSS-VALIDATION      │   │
│  │                                      │  │                         │   │
│  │  ┌──────────┐  ┌───────────────┐    │  │  ┌────────┐  ┌────────┐ │   │
│  │  │REVIEW CLI│  │ BATCH SIGNOFF │    │  │  │PROVIDER│  │PROVIDER│ │   │
│  │  │j/k/a/e/s│  │ verified flag  │    │  │  │   A    │  │   B    │ │   │
│  │  │   f/q   │  │               │    │  │  └───┬────┘  └───┬────┘ │   │
│  │  └──────────┘  └───────────────┘    │  │      └────┬──────┘      │   │
│  │                                      │  │           ▼             │   │
│  │                                      │  │    ┌────────────┐      │   │
│  │                                      │  │    │ HTML DIFF  │      │   │
│  │                                      │  │    │ REPORT     │      │   │
│  │                                      │  │    └────────────┘      │   │
│  └─────────────────────────────────────┘  └─────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                        DATA LAYER                                 │    │
│  │                                                                   │    │
│  │  data/                                                             │    │
│  │  ├── index.json          ← Master registry of all datasets        │    │
│  │  ├── jeemain/2025/22jan-s1/                                       │    │
│  │  │   ├── paper.json      ← Merged (all subjects)                  │    │
│  │  │   ├── physics.json    ← Subject file (numbers reset to 1)      │    │
│  │  │   ├── chemistry.json                                           │    │
│  │  │   ├── mathematics.json                                         │    │
│  │  │   └── diagrams/       ← Extracted PNG images                   │    │
│  │  ├── .checkpoints.json   ← Stage-level progress tracking          │    │
│  │  └── .tombstones.json    ← Removed IDs (never reused)             │    │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Stages in Detail

```
STAGE 1: SCRAPE ──────────────────────────────────────────────────────
  Input:  Exam name, year, shift number(s)
  Action: Download PDF from NTA official site / Gateoverflow / NCERT
  Output: PDF file path in data/{exam}/raw/
  Retry:  3x on failure
  Fallback: Gateoverflow mirrors when NTA 404s

STAGE 2: OCR ─────────────────────────────────────────────────────────
  Input:  PDF file path
  Action: POST to Mistral AI OCR API (mistral-ocr-latest)
          Auto-detects bilingual pages (Hindi/English ratio check)
          For PDFs >3.5MB: split and re-OCR
  Output: Per-page markdown + base64 embedded images
  Ratelimit: 60 req/min, exponential backoff on 429
  Two modes:
    - Standard: plain OCR → markdown
    - Enhanced: +structured annotations + bounding boxes (--use-enhanced-ocr)

STAGE 3: CHUNK ───────────────────────────────────────────────────────
  Input:  OCR pages array
  Action: Split into overlapping 15-page chunks with 5-page overlap
          Guarantees: no question spans across chunk boundaries
  Output: Array of chunk markdown strings
  Used:   For PDFs >12 pages (distributed extraction)

STAGE 4: EXTRACT (AI) ────────────────────────────────────────────────
  Input:  Chunk markdown + exam metadata
  Action: 
    - For ≤12 pages: single-provider extraction (NVIDIA Qwen3 Coder 480B)
    - For >12 pages: distributed across providers round-robin
    - For consensus mode: 3 providers in parallel
  Providers: Poolside (7) > LongCat Lite (6) > NVIDIA Qwen (5) > 
             LongCat Chat (3) > Gemini (2) > Cerebras (1) > Vanchin (0)
  Output: PartialQuestion[] structured by AI
  
STAGE 5: MERGE ───────────────────────────────────────────────────────
  Input:  Multiple ChunkResult[] from overlapping chunks or providers
  Action: Deduplicate by question number
          Selection priority:
            1. Completeness score (more filled fields)
            2. Non-empty answer > empty answer
            3. Longer options > shorter
            4. Provider reliability ranking
            5. Earlier chunk index
          Uses Mistral embeddings API for semantic similarity
          Falls back to Jaccard word-set similarity
  Output: Merged PartialQuestion[] with passages

STAGE 5b: CONSENSUS (Parallel) ───────────────────────────────────────
  Input:  OCR pages (when --use-consensus flag)
  Action: Run Poolside + LongCat Lite + NVIDIA Qwen3 Coder in parallel
          Each provider independently extracts questions from same pages
          Majority-vote per field across 3 results
          Conflict detection when agreement < 2/3
  Confidence: high (≥0.8), medium (≥0.5), low (<0.5)
  Output: ConsensusResult with confidence scores + conflict list

STAGE 6: DIAGRAM CACHE ───────────────────────────────────────────────
  Input:  OCR result with base64 images
  Action: Decode base64 → save as PNG files
  Output: data/{exam}/{year}/{shift}/diagrams/{subject}/q{num}-fig{n}.png

STAGE 7: VALIDATE ────────────────────────────────────────────────────
  Input:  Question[] array
  Action: 32 automated checks (see validation section)
  Per-type rules:
    - MCQ: 3-5 options, answer is 0-based index
    - MSQ: 4-6 options, answers sorted, ≥1 correct
    - NAT: options=null, negativeMarks=0, answer numeric
    - Assertion-Reason: options=null, answer in "0"|"1"|"2"|"3"
  Output: ValidationResult with passed/failed/warnings count

STAGE 7b: AUTO-REPAIR ───────────────────────────────────────────────
  Triggers: question count mismatch, missing answers, merged options
  Actions: Re-extract answer key pages, split merged options,
           re-extract with strict prompt on count mismatch

STAGE 8: FINALIZE ────────────────────────────────────────────────────
  Input:  PartialQuestion[] + metadata
  Actions:
    1. normalizeText() — LaTeX→Unicode, OCR ligature fixes
    2. normalizeTopic() — free-form → controlled vocabulary
    3. assignIds() — globally unique IDs with tombstone tracking
    4. build QuestionFile wrapper
    5. compute SHA-256 checksum
    6. write subject JSON files FIRST (physics.json etc.)
    7. write paper.json SECONDARY (merged from subjects)
    8. update data/index.json master registry
  Output: Structured JSON files on disk

STAGE 9: REVIEW ──────────────────────────────────────────────────────
  Input:  Exported QuestionFile
  Action: Human reviews each question
  Keys: a=accept, e=edit, s=skip, f=flag, j/k=navigate, q=quit
  Supports: Resume from saved progress (.review-progress.json)
  Sign-off: Mark shift as verified / needs-review

STAGE 10: CROSS-VALIDATE ─────────────────────────────────────────────
  Input:  Two QuestionFile from different providers
  Action: Compare field-by-field, find agreements and disagreements
  Output: HTML diff report
  Benefit: Review only 5-15 disagreements instead of 90 questions
```

---

## Supported Exams

| Exam | Code | Subjects | Duration | Marking | Sections |
|---|---|---|---|---|---|
| **JEE Main** | `jeemain` | physics, chemistry, mathematics | 180 min | +4 / -1 / 0 | Section A (20 mandatory), Section B (10/5 optional) |
| **NEET UG** | `neet` | physics, chemistry, biology | 200 min | +4 / -1 / 0 | Section A (100 mandatory), Section B (100 mandatory) |
| **JEE Advanced** | `jeeadv` | physics, chemistry, mathematics | 180 min | +4 / -1 / 0 | Section 1-3 (variable per year) |
| **NCERT Exemplar** | `ncert-exemplar` | physics, chemistry, mathematics, biology | varies | varies | Chapter-wise |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 18+ (native `fetch`, `http`, `crypto`) |
| **Language** | TypeScript 5.7 — strict mode, ES2022 target |
| **Module System** | ES Modules (`"type": "module"`) |
| **Compiler** | `tsc` + `tsx` for direct execution |
| **Testing** | Vitest 4.1.7 |
| **OCR** | Mistral AI OCR API (`mistral-ocr-latest`) |
| **AI Providers** | NVIDIA Qwen3 Coder 480B, LongCat Flash Lite, Poolside Laguna M.1, Vanchin KAT-Coder, Gemini 3.1 Flash Lite, Cerebras GPT-OSS-120B |
| **Database** | JSON files on disk (no Docker, no SQL, no MongoDB) |
| **Server** | Native `http` module (no Express/Fastify) |
| **Human Review** | Terminal CLI (`readline-sync`) + Web Dashboard |
| **Platform** | Windows (PowerShell 5.1) / Linux / macOS |

### Zero Runtime Dependencies

The project intentionally has **zero runtime npm dependencies**. Every API call uses Node.js built-in `fetch()`. The HTTP server uses the native `http` module. File operations use `fs/promises`. The only `devDependencies` are TypeScript tooling:

```
typescript    — compilation
vitest        — test runner
@types/node   — type definitions
readline-sync — CLI review input (only dev dependency at runtime)
```

---

## Directory Structure

```
C:\QUESTION-PIPELINE\
│
├── package.json                # Project manifest, 11 npm scripts
├── tsconfig.json               # TypeScript: strict, ES2022, NodeNext
├── vitest.config.ts            # Vitest test runner config
├── .env.example                # API key template (7 providers)
├── .env                        # Actual API keys (gitignored)
├── .gitignore
├── .checkpoints.json           # Auto-tracked processing state
│
├── AGENT.md                    # 821-line operational manual for AI agents
├── MASTER-PROMPT.md            # Self-contained prompt (no codebase needed)
├── USER-START-HERE.md          # Quick-start for humans
├── model-limits.md             # Provider rate limits reference
│
├── input/                      # Drop PDFs here for manual processing
│   ├── neet-2025-04may-s1.pdf
│   ├── neet-2026-2006.md
│   └── ...
│
├── data/                       # OUTPUT: All JSON datasets + diagrams
│   ├── index.json              # Master index of all processed datasets
│   ├── .checkpoints.json       # Stage-level checkpoint tracking
│   ├── neet/
│   │   └── 2025/
│   │       └── 04may-s1/
│   │           ├── paper.json        # Full merged paper (all subjects)
│   │           ├── physics.json      # Subject-level (numbers reset to 1)
│   │           ├── chemistry.json
│   │           ├── biology.json
│   │           └── diagrams/         # Per-shift diagram images
│   │               ├── physics/
│   │               └── chemistry/
│   └── ...
│
├── src/                        # SOURCE CODE
│   ├── index.ts                # CLI entry point — command router
│   ├── types.ts                # ALL TypeScript interfaces (canonical schema)
│   ├── vocabulary.ts           # 250+ topic aliases, controlled tags, normalization
│   │
│   ├── scrapers/               # PDF downloaders
│   │   ├── nta-scraper.ts      # NTA official site (JEE Main / NEET)
│   │   ├── gateoverflow-scraper.ts  # Gateoverflow mirrors (JEE Adv, JEE Main)
│   │   ├── ncert-scraper.ts    # NCERT Exemplar Class 11/12
│   │   └── kaggle-importer.ts  # Import existing Kaggle datasets
│   │
│   ├── extractors/             # Core extraction pipeline
│   │   ├── ocr-stage.ts        # Mistral OCR (standard + enhanced)
│   │   ├── chunker.ts          # Split large PDFs into overlapping chunks
│   │   ├── structurer.ts       # Single-provider AI extraction
│   │   ├── consensus-extractor.ts  # Multi-provider consensus (3 in parallel)
│   │   ├── merger.ts           # Merge overlapping chunk results
│   │   ├── diagram-cacher.ts   # Decode/save diagram images from OCR
│   │   ├── auto-repair.ts      # Auto-detect and fix extraction issues
│   │   └── progressive-review.ts   # Chunk-by-chunk human-in-loop
│   │
│   ├── validators/
│   │   ├── field-checker.ts    # Per-type field validation
│   │   └── auto-validator.ts   # 32 automated validation checks
│   │
│   ├── finalizers/
│   │   ├── id-assigner.ts      # Global unique ID generation
│   │   ├── normalizer.ts       # LaTeX→Unicode, OCR ligature fixes
│   │   ├── topic-normalizer.ts # Map free-form topics to controlled vocabulary
│   │   └── exporter.ts         # Write JSON files, compute checksums, update index
│   │
│   ├── cross-validate/
│   │   ├── cross-validator.ts  # Compare two model outputs, generate diff report
│   │   └── diff-viewer.ts      # HTML diff viewer
│   │
│   ├── review/
│   │   ├── pdf-renderer.ts     # Terminal-based question renderer
│   │   ├── review-cli.ts       # Interactive terminal review
│   │   └── batch-signoff.ts    # Mark shifts as verified/needs-review
│   │
│   ├── api/
│   │   └── server.ts           # Native http server (port 3456), SSE, dashboard
│   │
│   ├── adapters/
│   │   └── rankify-adapter.ts  # Convert to Rankify platform format
│   │
│   └── utils/
│       ├── logger.ts           # Structured logging (debug/info/warn/error)
│       ├── rate-limiter.ts     # Queue + window-based API throttling
│       ├── checkpoints.ts      # Stage-level progress tracking for resume
│       ├── embeddings.ts       # Mistral embeddings API + semantic similarity
│       ├── hash-utils.ts       # SHA-256 checksum computation
│       ├── integrity.ts        # Walk data/ and verify checksums
│       ├── metrics.ts          # Accuracy tracking against golden datasets
│       └── pdf-downloader.ts   # Download PDF with retry + validation
│
├── scripts/                    # Executable scripts (via npm run)
│   ├── process-pdf.ts          # Main entry for manual PDF processing
│   ├── batch-process.ts        # Process all PDFs in input/
│   ├── test-models.ts          # Health check for all AI providers
│   ├── test-mistral-structured.ts  # Test Mistral structured annotations
│   ├── test-full-pipeline.ts   # End-to-end pipeline test
│   ├── verify-all.ts           # Verify all processed datasets
│   ├── rebuild-index.ts        # Regenerate index.json from disk
│   ├── export-for-opensource.ts  # Export with license for sharing
│   └── stats.ts                # Print dataset statistics
│
├── tests/                      # Test suites
│   ├── unit/
│   │   ├── merger.test.ts
│   │   ├── consensus.test.ts
│   │   ├── auto-repair.test.ts
│   │   ├── chunker.test.ts
│   │   └── topic-normalizer.test.ts
│   ├── integration/
│   │   └── golden-dataset.test.ts
│   └── fixtures/
│       └── golden-jeemain-sample.json
│
├── dashboard.html              # Web dashboard UI
├── pipeline-canvas.html        # Pipeline visualization
├── pipeline-flow-v2.html       # Pipeline flow diagram
│
└── previous-plans/             # Historical design documents
    ├── PLAN.md
    ├── PLAN_V2.md
    ├── PLAN_V3.md
    └── PLAN_V4.md
```

### File Role Summary

| Path | Role |
|---|---|
| `src/types.ts` | **The Schema** — all interfaces, enums, literals. Schema version `"v4"`. |
| `src/vocabulary.ts` | **Controlled Vocabulary** — 250+ aliases, 4 subject tag lists, multi-strategy normalization |
| `src/scrapers/*` | **PDF Downloaders** — NTA official, Gateoverflow mirrors, NCERT, Kaggle import |
| `src/extractors/ocr-stage.ts` | **OCR Engine** — Mistral AI OCR with rate limiting, bilingual detection, enhanced mode |
| `src/extractors/chunker.ts` | **PDF Chunker** — 15-page overlapping chunks, no question-spanning guarantees |
| `src/extractors/structurer.ts` | **AI Structurer** — Single-provider + distributed extraction with provider priority chain |
| `src/extractors/consensus-extractor.ts` | **Consensus Engine** — 3 parallel providers, majority-vote, confidence scoring |
| `src/extractors/merger.ts` | **Chunk Merger** — Dedup with multi-criteria scoring, semantic similarity |
| `src/extractors/auto-repair.ts` | **Self-Healing** — Detects/fixes missing answers, merged options, count mismatches |
| `src/validators/auto-validator.ts` | **32-Check Validator** — IDs, types, options, diagrams, passages, topics, Unicode |
| `src/finalizers/exporter.ts` | **Output Generator** — Normalize, assign IDs, write files, compute checksums |
| `src/review/review-cli.ts` | **Human Review** — Interactive terminal with vim-like keys, progress save/resume |
| `src/api/server.ts` | **API Server** — Native http, REST endpoints, SSE streaming, file serving |
| `src/utils/rate-limiter.ts` | **Rate Limiter** — Queue + sliding window, per-provider configs |
| `src/utils/embeddings.ts` | **Embeddings** — Mistral embeddings API with LRU cache, cosine similarity |
| `src/adapters/rankify-adapter.ts` | **Rankify Adapter** — 30-line zero-change adapter for Rankify platform |

---

## JSON Schema

### `QuestionFile` — Top-Level Wrapper

```typescript
interface QuestionFile {
  schema: string;           // "v4"
  exam: string;             // "jeemain" | "neet" | "jeeadv" | "ncert-exemplar"
  year: number | null;
  shift: string | null;     // "22jan-s1", "04may", "p1"
  paper: string | null;
  subjects: string[];       // ["physics", "chemistry", "mathematics"]
  total: number;            // Total question count
  duration: number;         // Exam duration in minutes
  marksCorrect: number;     // e.g. 4
  marksIncorrect: number;   // e.g. -1
  marksUnanswered: number;  // e.g. 0
  sections: Record<string, SectionConfig>;
  scrapedAt: string;        // ISO 8601
  answerKeyFound: boolean;
  checksum: string;         // SHA-256 (computed before this field is added)
  questions: Question[];
  passages: Passage[];
}
```

### `Question` — Individual Question

```typescript
interface Question {
  id: string;               // "jeemain-2025-22jan-s1-ph-001"
  number: number;           // 1-N within subject file
  numberLabel: string|null; // "1(a)", "1(b)" for JEE Advanced sub-questions
  subject: string;          // "physics" | "chemistry" | "mathematics" | "biology"
  topic: string;            // Controlled vocabulary
  section: string | null;   // "a", "b", "section-1", etc.
  type: "mcq" | "msq" | "nat" | "assertion-reason";
  text: string;             // Question text (English)
  textHi: string | null;    // Hindi text (NEET bilingual)
  options: string[] | null; // 3-5 for MCQ, 4-6 for MSQ, null for NAT/AR
  answer: string;           // MCQ: "0"-"3". NAT: numeric. AR: "0"-"3"
  answers: string[] | null; // MSQ: sorted indices ["1","3"]
  answerPrecision: { type: "exact" | "integer-range" | "decimal-range"; min?: number; max?: number; unit?: string } | null;
  marks: number;
  negativeMarks: number;    // 0 for NAT
  passageId: string | null;
  solution: string | null;
  solutionFormat: "plain" | "html" | "markdown" | "latex" | null;
  hasDiagram: boolean;
  diagrams: Diagram[] | null;
  difficulty: "easy" | "medium" | "hard" | null;
  tags: string[];           // Controlled vocabulary tags
  revision: number;         // Starts at 1, increments on edit
  source: "official-pdf" | "reconstructed" | "imported-kaggle" | "imported-dataset";
  confidence: "high" | "medium" | "low" | null;
}
```

### `Passage` — Passage-Based Questions

```typescript
interface Passage {
  id: string;
  text: string;
  textHi: string | null;
  diagrams: Diagram[] | null;
  questions: string[];       // Question IDs that reference this passage
}
```

### `SectionConfig` — Exam Section Structure

```typescript
interface SectionConfig {
  label: string;            // "Section A"
  total: number;            // Total questions in section
  required: number;         // Questions to attempt
  mandatory: boolean;       // Must attempt?
}
```

### Output Structure on Disk

```
data/{exam}/{year}/{shift}/
├── physics.json              ← PRIMARY: questions[1-N] for physics
├── chemistry.json            ← PRIMARY: questions[1-N] for chemistry
├── mathematics.json          ← PRIMARY: questions[1-N] for mathematics
├── biology.json              ← PRIMARY: NEET only
├── paper.json                ← SECONDARY: merged from all subject files
└── diagrams/
    ├── physics/
    │   ├── q001-fig1.png
    │   └── ...
    ├── chemistry/
    └── biology/
```

Subject files are written **FIRST** with question numbers reset to 1-N within each subject. `paper.json` is built **SECONDARY** by merging subject files. IDs remain globally unique across all files.

---

## AI Provider System

### Provider Ranking (by extraction reliability)

```
Rank  Provider            Model                  RPM   Context   Daily Free
────────────────────────────────────────────────────────────────────────────
 7    Poolside            Laguna M.1            100    131K      Unlimited
 6    LongCat (Lite)      Flash-Lite             30    256K      50M tokens
 5    NVIDIA (Qwen)       Qwen3 Coder 480B       40    262K      2,400 RPD
 4    NVIDIA (Mistral)    Mistral-Large-3        40    262K      2,400 RPD
 3    LongCat (Chat)      Flash-Chat             30    256K      500K tokens
 2    Gemini              3.1 Flash Lite         15      1M      500 RPD
 1    Cerebras            GPT-OSS-120B            5     65K      2,400 RPD
 0    Vanchin             KAT-Coder-Air-V1       20      2M      28,800 RPD
```

### How Extraction Works

**Single-Provider Mode (`structurer.ts`):**
- Tries providers in ranking order
- If primary fails → next provider (auto-failover)
- For PDFs >12 pages: splits into 15-page overlapping chunks, distributes across providers round-robin in parallel, merges results

**Consensus Mode (`consensus-extractor.ts`, `--use-consensus`):**
- Runs Poolside + LongCat Lite + NVIDIA Qwen3 Coder in **parallel** on the same pages
- Each provider independently extracts questions
- Per-question, per-field **majority vote** (2/3 agreement)
- Confidence scoring: high (≥0.8), medium (≥0.5), low (<0.5)
- Conflict detection with detailed report for human resolution

**Distributed Extraction (PDFs >12 pages):**
- `splitIntoChunks(pages, chunkSize=15, overlap=5)` → overlapping groups
- Each chunk assigned to different providers
- Results merged via `mergeChunks()` with dedup and quality scoring

### Answer Key Detection

The system automatically detects answer keys using 12 regex patterns:
- `answer key` / `answer :` / `ans:` headings
- Numbered answer tables
- Answer columns in question lists
- Roman numeral patterns

When detected: answers are extracted from the key and matched by question number.
When NOT detected: ALL answers set to empty string (anti-hallucination rule).

---

## Installation & Setup

### Prerequisites

- Node.js 18+ (for native `fetch`)
- npm
- At minimum: **Mistral AI API key** (for OCR)

### 1. Clone & Install

```powershell
cd C:\QUESTION-PIPELINE
npm install
npx tsc --noEmit      # Verify compilation — must pass with 0 errors
```

### 2. Set API Keys

Copy `.env.example` to `.env` and add your keys:

```env
MISTRAL_API_KEY=sk-...           # Required for OCR
NVIDIA_API_KEY=nvapi-...         # Optional — primary extraction
LONGCAT_API_KEY=sk-...           # Optional — 50M tokens/day free
POOLSIDE_API_KEY=...             # Optional — unlimited free
VC_API_KEY=...                   # Optional — Vanchin KAT-Coder
GEMINI_API_KEY=AIzaSy...         # Optional — 500 RPD
CEREBRAS_API_KEY=...             # Optional — fallback
```

Or set them as environment variables:

```powershell
$env:MISTRAL_API_KEY = "sk-..."
$env:NVIDIA_API_KEY = "nvapi-..."
```

### 3. Verify Connectivity

```powershell
npm run test-models
# Tests all configured providers and reports which are reachable
```

---

## Usage — CLI Commands

### Quick Start: Process a PDF

```powershell
# Drop a PDF in input/ folder, then:
npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf"

# With multi-provider consensus (3 providers in parallel):
npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf" --use-consensus

# With enhanced OCR (structured annotations):
npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf" -e

# Full power: consensus + enhanced OCR:
npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf" -c -e

# PDF + separate answer key PDF (official NTA):
npm run process-pdf -- --input "question.pdf" --answer-key "answer-key.pdf"
```

### All Commands

```powershell
# ─── SETUP ──────────────────────────────────────────────────────────
npm install                        # Install dev dependencies
npx tsc --noEmit                   # Verify TypeScript compilation

# ─── SCRAPING ───────────────────────────────────────────────────────
npm run scrape -- --exam jeemain --year 2025 --shifts 2
npm run scrape -- --exam neet --year 2024
npm run scrape -- --exam jeeadv --year 2024

# ─── FULL PIPELINE ──────────────────────────────────────────────────
npm run batch -- --exam jeemain --year 2025 --shift 22jan-s1

# ─── MANUAL PDF PROCESSING ──────────────────────────────────────────
npm run process-pdf -- --input "input/paper.pdf"
npm run process-pdf -- --input "input/paper.pdf" --use-consensus
npm run process-pdf -- --input "input/paper.pdf" -c -e

# ─── INDIVIDUAL STAGES ──────────────────────────────────────────────
npx tsx src/extractors/ocr-stage.ts --input data/jeemain/raw/file.pdf --output data/jeemain/ocr/
npx tsx src/extractors/structurer.ts --input data/jeemain/ocr/file.json --output data/jeemain/extracted/
npx tsx src/extractors/diagram-cacher.ts --input data/jeemain/ocr/file.json
npx tsx src/validators/auto-validator.ts --path data/jeemain/2025/22jan-s1/
npx tsx src/finalizers/exporter.ts --exam jeemain --year 2025 --shift 22jan-s1

# ─── REVIEW ─────────────────────────────────────────────────────────
npm run review -- --exam jeemain --year 2025 --shift 22jan-s1
npm run signoff -- --exam jeemain --year 2025 --shift 22jan-s1 --status verified

# ─── VERIFICATION ───────────────────────────────────────────────────
npm run verify                      # Verify all dataset checksums
npm run rebuild-index               # Regenerate data/index.json
npm run stats                       # Print dataset statistics
npm run status                      # Show checkpoint table

# ─── API SERVER ─────────────────────────────────────────────────────
npm run api                         # Start on http://localhost:3456

# ─── CROSS-VALIDATION ──────────────────────────────────────────────
npx tsx src/extractors/structurer.ts --model cerebras --input ... --output cerebras.json
npx tsx src/extractors/structurer.ts --model gemini --input ... --output gemini.json
npx tsx src/cross-validate/cross-validator.ts --a cerebras.json --b gemini.json

# ─── EXPORT ─────────────────────────────────────────────────────────
npm run export -- --license cc-by-4.0 --output ./export

# ─── TESTING ────────────────────────────────────────────────────────
npm run test                        # Run all Vitest tests
npm run test-mistral -- "input/paper.pdf"  # Test Mistral structured annotations
npm run test-full-pipeline -- "input/paper.pdf"  # End-to-end test
```

### Filename Pattern Recognition

The `process-pdf` script automatically parses exam/year/shift from filenames:

| Filename Pattern | Parsed As |
|---|---|
| `JEE-Main-2025-22-Jan-Shift-1.pdf` | jeemain, 2025, `22jan-s1` |
| `neet-2024-04-may.pdf` | neet, 2024, `04may-s1` |
| `jee-advanced-2024-paper-1.pdf` | jeeadv, 2024, `p1` |
| `NCERT-Exemplar-11-Physics.pdf` | ncert-exemplar, class 11 |

If parsing fails, the script asks for `--exam`, `--year`, `--shift` flags.

### Checkpoint System

After processing, a checkpoint is recorded in `.checkpoints.json`. Running the same shift again will skip it unless `--force` is passed:

```powershell
npm run process-pdf -- --input "input/paper.pdf" --force
npm run status   # Shows what's been processed
```

---

## Web Dashboard

Start the API server and open the dashboard:

```powershell
npm run api
# Open http://localhost:3456/dashboard
```

### Dashboard Features

| Feature | Description |
|---|---|
| **Live Pipeline Control** | Run stages (scrape, OCR, extract, validate, finalize, verify, stats) with one click |
| **Custom Commands** | Run any shell command with live SSE streaming output |
| **Real-Time Logs** | See logs stream via Server-Sent Events as pipeline runs |
| **File Browser** | Browse `data/` directory tree interactively |
| **Question Browser** | Query questions by exam, year, shift, subject, type |
| **Review Interface** | Accept/edit/skip/flag questions with keyboard shortcuts |
| **Pipeline Status** | Current stage, running time, last 100 log entries |
| **Stats Dashboard** | Total questions, by exam/subject/type, diagram count, verification rate |

### Dashboard UI Files

| File | Description |
|---|---|
| `dashboard.html` | Main web dashboard (pipeline control, review, file browser, stats) |
| `pipeline-canvas.html` | Pipeline visualization (canvas-based flow diagram) |
| `pipeline-flow-v2.html` | Pipeline flow diagram (v2, detailed stage view) |

---

## API Reference

The API server runs on port 3456 (configurable via `PORT` env). CORS is fully open.

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/events` | SSE real-time stream (status, logs, files, review) |
| `GET` | `/api/v1/pipeline/status` | Current pipeline state + last 100 logs |
| `GET` | `/api/v1/pipeline/stages` | List all available pipeline stages |
| `POST` | `/api/v1/pipeline/run` | Trigger a pipeline stage |
| `POST` | `/api/v1/pipeline/custom` | Run any shell command (output streams live via SSE) |
| `POST` | `/api/v1/pipeline/stop` | Kill running process |
| `POST` | `/api/v1/review/start` | Start human review session |
| `GET` | `/api/v1/review/current` | Get current review question |
| `POST` | `/api/v1/review/action` | Accept / edit / skip / flag a question |
| `POST` | `/api/v1/review/cancel` | Cancel review session |
| `GET` | `/api/v1/files/list` | Real file listing from `data/` with metadata |
| `GET` | `/api/v1/files/tree` | Full directory tree of `data/` |
| `GET` | `/api/v1/questions` | Query questions (filter by exam, year, subject, type) |
| `GET` | `/api/v1/questions/count` | Question count summary |
| `GET` | `/api/v1/exams` | List all exams in the dataset |
| `GET` | `/api/v1/stats` | Dataset statistics |
| `GET` | `/api/v1/diagrams/:path` | Serve diagram images |
| `GET` | `/dashboard` | Web dashboard UI |

### SSE Events

The server pushes real-time events via Server-Sent Events:

| Event | Data | When |
|---|---|---|
| `status` | `{ stage, status, startedAt, finishedAt }` | Pipeline state changes |
| `log` | `{ ts, type, msg }` | New log entry (max 500 in history) |
| `review` | `{ action, questionId }` | Review action performed |
| `file-change` | `{ path, action }` | File created/deleted in `data/` |

---

## Human Review Workflow

### CLI Review (`npm run review`)

Interactive terminal with vim-like keyboard shortcuts:

```
Keys:
  a  = Accept question
  e  = Edit question (opens $EDITOR)
  s  = Skip question (come back later)
  f  = Flag question (with note)
  j  = Next question
  k  = Previous question
  q  = Quit (save progress)
```

**Question display format:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  Question 12 of 90                    ID: jeemain-2025-22jan-s1-ph-012│
│  Subject: physics   Type: mcq         Topic: electrostatics          │
│  Section: a         Marks: 4          Negative: -1                   │
├──────────────────────────────────────────────────────────────────────┤
│  Two point charges +q and -q are placed at a distance d apart.      │
│  The electric field at the midpoint is:                              │
│                                                                      │
│  Options:                                                            │
│    0: Zero                                                           │
│    1: 2kq/d² directed towards +q                                     │
│    2: 2kq/d² directed towards -q                                     │
│    3: 4kq/d² directed towards -q                                     │
│                                                                      │
│  AI Answer: 2 (index 2)                                              │
│                                                                      │
│  [a]ccept  [e]dit  [s]kip  [f]lag  [j]next  [k]prev  [q]uit        │
└──────────────────────────────────────────────────────────────────────┘
```

**Progress persistence:** Review progress is saved to `.review-progress.json` automatically. You can quit and resume later.

### Batch Sign-Off

After all questions reviewed:

```powershell
npm run signoff -- --exam jeemain --year 2025 --shift 22jan-s1 --status verified
```

### Web Dashboard Review

The web dashboard provides a GUI version of the review interface with the same actions (accept/edit/skip/flag) plus mouse navigation.

---

## Cross-Validation System

Phase 9 of the project — designed to reduce human review time by 80%.

### How It Works

1. Run TWO different AI providers on the same OCR output
2. Cross-validator compares each field of each question
3. Matched questions (80-95%) → auto-accepted
4. Disagreements only → presented to human for resolution
5. `buildConsensus()` merges results with human resolutions

```powershell
# Run two providers
npx tsx src/extractors/structurer.ts --model cerebras --input ocr.json --output cerebras.json
npx tsx src/extractors/structurer.ts --model gemini --input ocr.json --output gemini.json

# Cross-validate
npx tsx src/cross-validate/cross-validator.ts --a cerebras.json --b gemini.json

# Opens HTML report with diff viewer
```

### Diff Report (HTML)

The generated HTML report shows:
- Side-by-side comparison of each question
- Color-coded fields (green = match, red = disagreement)
- Agreement percentage per field and overall
- Confidence scores for each provider
- Quick navigation to disagreements only

This reduces review workload from 90 questions to typically 5-15 disagreements.

---

## Anti-Hallucination Design

The system has a **zero-tolerance policy toward fabricated data**, embedded at every level:

### Core Rule

> **NEVER fabricate pipeline output. If the pipeline fails at any stage, tell the user the exact failure. Do NOT generate fake paper.json from your training data, do NOT fill gaps with "common questions everyone knows." A loud honest error is worth 1000× more than silent corrupted data.**

### Implementation

| Safeguard | Where | Description |
|---|---|---|
| No answer key → empty answers | `consensus-extractor.ts` | If answer key not detected, ALL answers forced to empty string |
| Answer key detection | `consensus-extractor.ts` | 12 regex patterns verify key presence before extraction |
| Source tracking | `types.ts` | Every question tagged with source (`official-pdf`, `reconstructed`, etc.) |
| Confidence scoring | `consensus-extractor.ts` | Multi-provider agreement → confidence field |
| Field-level validation | `auto-validator.ts` | 32 checks catch impossible/invalid data |
| Validation: FATAL checks | `auto-validator.ts` | If no answer key found but answers exist → all cleared |
| Checkpoint system | `checkpoints.ts` | Never re-extract — always resume from last real state |
| Revision tracking | `types.ts` | Every question has `revision` field, incremented on edit |
| Tombstone IDs | `id-assigner.ts` | Removed IDs never reused — no stale data |
| Integrity verification | `integrity.ts` | SHA-256 checksums on all output files |
| Provider diversity | `structurer.ts` | Auto-failover between 6+ providers — no single point of hallucination |
| Human review gate | `review-cli.ts` | Every question requires human acceptance before sign-off |

### Agent Protocol

The `AGENT.md` (821 lines) and `MASTER-PROMPT.md` (575 lines) both begin with the HARD RULE against fabrication. Any AI agent running the pipeline is explicitly instructed to:

1. Actually run the pipeline (not simulate it)
2. Never generate questions from training data
3. Never fall back to "mock mode" when APIs fail
4. Never skip pipeline stages
5. Fail loudly with exact error messages

---

## ID Scheme

### Format

```
{exam}-{year}-{shift-shorthand}-{subject-code}-{3-digit-number}
```

### Examples

| ID | Meaning |
|---|---|
| `jeemain-2025-22jan-s1-ph-001` | JEE Main 2025, 22 Jan Shift 1, Physics, Q1 |
| `neet-2025-04may-bi-045` | NEET 2025, 04 May, Biology, Q45 |
| `jeeadv-2025-p1-ch-012` | JEE Advanced 2025, Paper 1, Chemistry, Q12 |
| `ncert-exemplar-11-ph-023` | NCERT Exemplar Class 11, Physics, Q23 |

### Subject Codes

| Subject | Code |
|---|---|
| physics | `ph` |
| chemistry | `ch` |
| mathematics | `ma` |
| biology | `bi` |

### Shift Shorthand

| Original | Shorthand |
|---|---|
| "22 january shift 1" | `22jan-s1` |
| "4 may" | `04may` |
| "paper 1" (JEE Adv) | `p1` |

### Tombstone Tracking

Removed IDs are tracked in `data/.tombstones.json` and **never reused**. This ensures that any external references to a specific ID remain stable.

### Numbering

- Within each **subject file**: numbers reset to 1-N (first physics question = number 1)
- Within `paper.json`: numbers are the original question numbers from the paper
- Within **aggregate files** (across shifts): numbers reset again
- **IDs** are always globally unique regardless of context

---

## Topic Vocabulary

### Controlled Vocabulary by Subject

**Physics (32 tags):**
`kinematics`, `newtons-laws`, `friction`, `work-energy-power`, `rotational-motion`, `gravitation`, `fluid-mechanics`, `properties-of-matter`, `thermal-physics`, `thermodynamics`, `kinetic-theory`, `oscillations`, `waves`, `electrostatics`, `capacitance`, `current-electricity`, `magnetic-effects`, `electromagnetic-induction`, `alternating-current`, `electromagnetic-waves`, `ray-optics`, `wave-optics`, `modern-physics`, `atoms`, `nuclei`, `semiconductors`, `communication-systems`, `experimental-physics`, `units-and-dimensions`, `vectors`, `error-analysis`, `measurement`

**Chemistry (32 tags):**
`mole-concept`, `atomic-structure`, `periodic-classification`, `chemical-bonding`, `states-of-matter`, `chemical-thermodynamics`, `equilibrium`, `redox-reactions`, `hydrogen`, `s-block`, `p-block`, `organic-chemistry`, `hydrocarbons`, `environmental-chemistry`, `solid-state`, `solutions`, `electrochemistry`, `chemical-kinetics`, `surface-chemistry`, `metallurgy`, `d-block`, `coordination-compounds`, `halogen-derivatives`, `alcohols-phenols-ethers`, `aldehydes-ketones`, `carboxylic-acids`, `amines`, `biomolecules`, `polymers`, `chemistry-in-everyday-life`, `analytical-chemistry`, `nuclear-chemistry`, `green-chemistry`

**Mathematics (27 tags):**
`sets`, `relations-and-functions`, `trigonometry`, `inverse-trigonometry`, `matrices`, `determinants`, `continuity-and-differentiability`, `application-of-derivatives`, `integrals`, `application-of-integrals`, `differential-equations`, `vector-algebra`, `three-d-geometry`, `linear-programming`, `probability`, `binomial-theorem`, `sequences-and-series`, `complex-numbers`, `quadratic-equations`, `permutations-and-combinations`, `statistics`, `mathematical-reasoning`, `limits`, `number-theory`, `graph-theory`, `inequalities`, `logarithms`, `modulus-function`, `greatest-integer-function`

**Biology (18 tags):**
`diversity-in-living-world`, `plant-kingdom`, `animal-kingdom`, `morphology-of-flowering-plants`, `anatomy-of-flowering-plants`, `cell-biology`, `biomolecules-biology`, `plant-physiology`, `human-physiology`, `reproduction`, `genetics`, `evolution`, `human-health-and-disease`, `biotechnology`, `ecology`, `microbiology`, `immunology`, `bioinformatics`

### Topic Normalization Strategy

When AI extracts a free-form topic string, the system normalizes it through 4 layers:

1. **Exact match** (fast path) — check against 250+ aliases
2. **Fuzzy match** — Levenshtein distance ≤ 2
3. **Semantic similarity** — word-vector cosine similarity (threshold 0.3)
4. **Fallback** — `"general-{subject}"` if no match

**Example alias mappings:**
```
"nlm"           → "newtons-laws"
"aod"           → "application-of-derivatives"
"emi"           → "electromagnetic-induction"
"thermo"        → "thermodynamics"
"rotation"      → "rotational-motion"
"biotech"       → "biotechnology"
"motion in 1d"  → "kinematics"
"redox"         → "redox-reactions"
```

### Tag Validation

`isValidTag(subject, tag)` checks if a tag belongs to the controlled vocabulary for that subject. Max 5 tags per question.

---

## Validation — 32 Automated Checks

The auto-validator (`src/validators/auto-validator.ts`) runs 32 checks on every question:

| # | Check | Severity |
|---|---|---|
| 1 | ID present | error |
| 2 | ID format (lowercase alphanumeric + hyphens) | error |
| 3 | Number is positive integer | error |
| 4 | Subject is valid enum value | error |
| 5 | Type is valid enum value | error |
| 6 | Text is not empty | error |
| 7 | Text has no placeholders (`[image]`, `[figure]`, etc.) | warning |
| 8 | MCQ: options count 3-5 | error |
| 9 | MCQ: no duplicate options | error |
| 10 | MCQ: answer is valid index string | error |
| 11 | MSQ: options count 4-6 | error |
| 12 | MSQ: answers array sorted, ≥1 | error |
| 13 | NAT: options is null | error |
| 14 | NAT: negativeMarks is 0 | error |
| 15 | NAT: answer is numeric | error |
| 16 | Assertion-Reason: options is null | error |
| 17 | Assertion-Reason: answer in "0"\|"1"\|"2"\|"3" | error |
| 18 | No HTML/script tags in text | warning |
| 19 | Text Unicode is valid (no garbled characters) | warning |
| 20 | Diagram file exists on disk when hasDiagram=true | error |
| 21 | Diagram references follow naming convention | warning |
| 22 | passageId references valid entry in passages array | error |
| 23 | tags follow controlled vocabulary | warning |
| 24 | ID format matches `{exam}-{year}-{shift}-{subject}-{3digit}` | error |
| 25 | No duplicate IDs across dataset | error |
| 26 | source is valid enum value | error |
| 27 | confidence is valid when set | warning |
| 28 | difficulty is valid when set | warning |
| 29 | solutionFormat is valid when set | warning |
| 30 | marks is positive number | error |
| 31 | revision is positive integer | warning |
| 32 | Maximum 5 tags per question | warning |

### Per-Type Validation Rules

**MCQ (Multiple Choice — Single Correct):**
- `options`: string[], length 3-5
- `answer`: 0-based index string (e.g. "0", "1", "2", "3")
- `answers`: null
- `negativeMarks`: usually -1 (JEE Main) or 0 (NEET)

**MSQ (Multiple Select Questions):**
- `options`: string[], length 4-6
- `answers`: sorted array of correct indices (e.g. `["1", "3"]`)
- `answer`: concatenated string like `"1,3"` or first answer
- No `null` options

**NAT (Numerical Answer Type):**
- `options`: null
- `answer`: numeric string (e.g. `"4"`, `"2.5"`)
- `negativeMarks`: MUST be 0
- `answerPrecision`: set if decimal places or range specified

**Assertion-Reason:**
- `options`: null (auto-generated by display layer)
- `answer`: one of `"0"`, `"1"`, `"2"`, `"3"`
  - `"0"` = Both A and R are true, R is correct explanation of A
  - `"1"` = Both A and R are true, R is NOT correct explanation of A
  - `"2"` = A is true but R is false
  - `"3"` = A is false but R is true

---

## Error Handling & Self-Healing

### Common Scenarios and Automatic Recovery

| Symptom | Likely Cause | Automatic Fix |
|---|---|---|
| 404 on scrape | URL pattern changed or shift not released | Try gateoverflow mirror, or report to user |
| PDF >3.5MB | Large file | Auto-split and re-OCR in parallel |
| Mistral OCR timeout | API rate limit | Exponential backoff (rate-limiter handles) |
| Mistral returns empty | Scanned/image-only PDF | Proceed with empty pages; still extract what's possible |
| AI JSON parse fails | Markdown-wrapped JSON | Strip ```json fences, retry parse |
| AI returns 0 questions | Context window exceeded | Split into smaller chunks, retry |
| AI returns garbage | Unclear instructions | Re-prompt with stricter schema |
| Missing answers | Answer key page missed | Auto-repair re-extracts answer key pages |
| Merged options | AI concatenated options | `repairOptions()` splits them intelligently |
| Count mismatch | Extracted ≠ expected | Re-extract with strict prompt about count |
| Invalid topic | Unknown topic string | Run topic-normalizer → fallback to `general-{subject}` |
| Missing required field | AI omitted field | Auto-validator detects, exporter fills defaults |
| Checksum mismatch | File modified after export | Re-run exporter |
| Port 3456 busy | Previous server instance | Kill process: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3456).OwningProcess` |

### Checkpoint Resume

Every pipeline stage writes checkpoints to `.checkpoints.json`. On failure:

1. Read `.checkpoints.json` to find last successful stage
2. Resume from next stage without redoing completed work
3. Use `--force` to override and reprocess

### Fatal Errors (No Automatic Recovery)

These situations trigger a halt and explicit user notification:
- All 6 AI providers fail (no extraction possible)
- Compilation errors (`tsc --noEmit` fails)
- PDF is password-protected
- Mistral OCR returns no pages at all
- Answer key PDF doesn't match question paper

---

## Model Limits & Rate Limiting

### Per-Provider Rate Limits

| Provider | Model | RPM | Context | Daily Free | Notes |
|---|---|---|---|---|---|
| **Mistral OCR** | mistral-ocr-latest | 60 req/min | — | 50K TPM | OCR only, 1 RPS enforcement |
| **NVIDIA** | Qwen3 Coder 480B | 40 | 262K | 2,400 RPD | Primary extraction, 35B active params |
| **NVIDIA** | Mistral-Large-3 | 40 | 262K | 2,400 RPD | Multimodal, 675B MoE |
| **NVIDIA** | Llama-4 Maverick | 40 | 1M | 2,400 RPD | Multimodal, 400B MoE |
| **LongCat Lite** | Flash-Lite | 30 | 256K | 50M tokens/day | Best for bulk processing |
| **LongCat Chat** | Flash-Chat | 30 | 256K | 500K tokens/day | General purpose |
| **Poolside** | Laguna M.1 | 30/100 | 131K | Unlimited | Free preview |
| **Vanchin** | KAT-Coder-Air-V1 | 20 | 2M | 28,800 RPD | Code validation |
| **Gemini** | 3.1 Flash Lite | 15 | 1M | 500 RPD | Validation, 250K TPM |
| **Cerebras** | GPT-OSS-120B | 5 | 65K | 2,400 RPD | Fallback, 30K TPM |

### Rate Limiter Architecture

The `RateLimiter` class (`src/utils/rate-limiter.ts`) uses a **queue + sliding window** approach:

1. All API calls are queued
2. Timestamps of recent requests are maintained in a sliding window
3. When window is full, new requests wait until oldest timestamp expires
4. Exponential backoff on HTTP 429 responses
5. Per-provider instances with independent windows

```typescript
const nvidiaLimiter = new RateLimiter({ maxRequests: 40, windowMs: 60_000 });
const longcatLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });
const poolsideLimiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });
const geminiLimiter = new RateLimiter({ maxRequests: 15, windowMs: 60_000 });
```

---

## Testing

### Unit Tests

| Test File | What It Tests |
|---|---|
| `tests/unit/merger.test.ts` | Chunk dedup, pickBetter logic, semantic similarity |
| `tests/unit/consensus.test.ts` | Majority vote, confidence scoring, conflict detection |
| `tests/unit/auto-repair.test.ts` | Missing answer detection, option splitting, count fix |
| `tests/unit/chunker.test.ts` | Overlapping chunk boundaries, no question-spanning |
| `tests/unit/topic-normalizer.test.ts` | Exact match, fuzzy match, semantic fallback |

### Integration Tests

| Test File | What It Tests |
|---|---|
| `tests/integration/golden-dataset.test.ts` | End-to-end against known golden dataset |

### Run Tests

```powershell
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test-mistral      # Test Mistral structured annotations
npm run test-full-pipeline  # Full end-to-end pipeline test
npm run test-models       # Test all AI provider connectivity
```

### Test Fixtures

`tests/fixtures/golden-jeemain-sample.json` contains a known-correct dataset used for integration testing.

---

## Project Status

All 9 phases are complete with zero TypeScript compilation errors across 32 source files.

| Phase | Module | Files | Status |
|---|---|---|---|
| P1 | Foundation | `types.ts`, `vocabulary.ts`, `utils/*`, `index.ts` | ✅ Complete |
| P2 | Scrapers | `nta-scraper.ts`, `gateoverflow-scraper.ts`, `ncert-scraper.ts`, `kaggle-importer.ts` | ✅ Complete |
| P3 | Extraction | `ocr-stage.ts`, `structurer.ts`, `consensus-extractor.ts`, `chunker.ts`, `merger.ts`, `diagram-cacher.ts`, `auto-repair.ts`, `progressive-review.ts` | ✅ Complete |
| P4 | Validation | `field-checker.ts`, `auto-validator.ts` | ✅ Complete |
| P5 | Finalization | `id-assigner.ts`, `normalizer.ts`, `topic-normalizer.ts`, `exporter.ts` | ✅ Complete |
| P6 | Review | `pdf-renderer.ts`, `review-cli.ts`, `batch-signoff.ts` | ✅ Complete |
| P7 | Scripts | `batch-process.ts`, `verify-all.ts`, `rebuild-index.ts`, `export-for-opensource.ts`, `stats.ts` | ✅ Complete |
| P8 | API + Adapter | `server.ts`, `rankify-adapter.ts` | ✅ Complete |
| P9 | Cross-Validate | `cross-validator.ts`, `diff-viewer.ts` | ✅ Complete |

### Current Dataset

The pipeline has been used to process NEET papers spanning 2006-2026, with verified results in `data/neet/2023/06jun-s1/`.

---

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MISTRAL_API_KEY` | ✅ Yes | — | Mistral AI OCR and embeddings |
| `NVIDIA_API_KEY` | ❌ No | — | NVIDIA NIM (Qwen3 Coder 480B, primary) |
| `LONGCAT_API_KEY` | ❌ No | — | LongCat Flash Lite (50M tokens/day free) |
| `POOLSIDE_API_KEY` | ❌ No | — | Poolside Laguna M.1 (unlimited free) |
| `VC_API_KEY` | ❌ No | — | Vanchin KAT-Coder-Air-V1 |
| `GEMINI_API_KEY` | ❌ No | — | Gemini 3.1 Flash Lite (500 RPD) |
| `CEREBRAS_API_KEY` | ❌ No | — | Cerebras GPT-OSS-120B (fallback) |
| `KAGGLE_USERNAME` | ❌ No | — | Kaggle API username |
| `KAGGLE_KEY` | ❌ No | — | Kaggle API key |
| `EDITOR` | ❌ No | `notepad` | Editor for review edit mode |
| `LOG_LEVEL` | ❌ No | `info` | `debug` \| `info` \| `warn` \| `error` |
| `PORT` | ❌ No | `3456` | API server port |

---

## Design Decisions

1. **All lowercase** — no casing bugs anywhere in the system
2. **No license in JSON** — added only via `--export` flag
3. **AR options auto-generated** — never stored, generated by display layer
4. **Passage = any type + passageId** — passage is a relationship, not a separate question type
5. **Match-columns = MCQ with 4 pairing options** — not a separate type
6. **Difficulty = null from AI** — human assigns via rubric, never guessed by AI
7. **Checksum = SHA-256 before adding checksum field** — self-verifying files
8. **Human review = accuracy guarantee** — AI achieves 80-95%, validation adds 5%, human catches the rest
9. **Zero Rankify schema changes** — 30-line adapter, no coupling
10. **Free tier only** — all providers have free tiers, no paid API required
11. **No Docker, no database** — JSON files ARE the database. Portable, inspectable, git-able
12. **Subject files written FIRST** — `paper.json` is secondary merge, not primary
13. **Tombstone IDs** — removed IDs never reused; external references stay valid
14. **Anti-hallucination by architecture** — not just documentation, enforced in code
15. **Checkpoints at every stage** — never redo completed work on failure
16. **SSE for real-time updates** — no polling, no WebSocket dependency

---

## Glossary

| Term | Definition |
|---|---|
| **MCQ** | Multiple Choice Question — single correct answer from 3-5 options |
| **MSQ** | Multiple Select Question — ≥1 correct answers from 4-6 options |
| **NAT** | Numerical Answer Type — numeric answer, no options |
| **AR** | Assertion-Reason — two statements, choose relationship between them |
| **SSE** | Server-Sent Events — HTTP-based real-time streaming |
| **RPD** | Requests Per Day |
| **RPM** | Requests Per Minute |
| **TPM** | Tokens Per Minute |
| **Shift** | A specific exam session (e.g., "22 Jan Shift 1") |
| **Consensus** | Multi-provider agreement with majority voting |
| **Golden Dataset** | A human-verified correct dataset used as ground truth |
| **Tombstone** | Record of a deleted ID to prevent reuse |
| **NTA** | National Testing Agency — conducts JEE Main and NEET |
| **Gateoverflow** | Community mirror site for exam PDFs |

---

> **Question-Pipeline** — From PDF to structured dataset, with honest errors and zero fabrication.
