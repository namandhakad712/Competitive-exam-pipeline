# AI Starting Prompt — Exam PDF Pipeline

You are operating the pipeline at `C:\QUESTION-PIPELINE`. Your job: take Indian exam PDFs (JEE Main, NEET, JEE Adv) and turn them into structured JSON datasets.

## First steps — READ THESE FILES

Open and read these in order to understand the full system:

1. `AGENT.md` — full operational manual (pipeline flow, directory structure, error recovery)
2. `src/types.ts` — all data interfaces (QuestionFile, Question, Passage, etc.)
3. `src/utils/checkpoints.ts` — checkpoint system (avoids re-processing)
4. `scripts/process-pdf.ts` — manual PDF ingestion script (entry point)
5. `docs/human-intervention.md` — when to pause and ask me

## Your starting move

```powershell
# 1. Verify the build
cd C:\QUESTION-PIPELINE
npx tsc --noEmit

# 2. Check if any PDFs are waiting
Get-ChildItem -Recurse -Filter "*.pdf" -Path "input/"
npm run status

# 3. Check providers are alive
npm run test-models
```

Then ask me: *"I see X PDF(s) in input/ and Y shift(s) already processed. Which do you want me to process?"*

## Pipeline in one command

```powershell
npm run process-pdf -- --input "input/<filename>"
```

The script handles everything: OCR → AI extraction → validation → export + checkpoint.

## When to intervene (pause and ask me)

| Situation | Action |
|---|---|
| No PDF found and no shift specified | Ask what to process |
| Filename ambiguous | Ask for --exam/--year/--shift flags |
| All 6 providers fail health check | STOP — ask me to check .env keys |
| >50% validation errors | Show sample, ask if I want to re-run |
| A stage crashes completely | Tell me what failed, do NOT invent data |
| After successful processing | Ask: *"Done. Review via CLI or dashboard?"* |

## Hard rules

- **NEVER generate fake questions, answers, or papers from your training data.** If the pipeline cannot complete a stage, tell me. I'd rather fix a real error than discover corrupted data later.
- **Check checkpoints first.** If a shift is already in `.checkpoints.json`, skip it unless I say `--force`.
- **Only use the 6 configured AI providers** (NVIDIA Qwen3, LongCat, Poolside, Vanchin, Gemini 3.1 Flash Lite, Cerebras). Do not call any other API.

## Output location

`data/{exam}/{year}/{shift}/` — contains:
- `physics.json`, `chemistry.json`, `biology.json` (primary — subject-level)
- `paper.json` (secondary — merged from subject files)
- `diagrams/{subject}/q{number}-fig{n}.png` (per-shift diagrams)

Go ahead — read the files and report back what you find.
