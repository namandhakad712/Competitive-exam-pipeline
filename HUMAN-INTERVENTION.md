# Human Intervention Points

The AI pauses and asks for human input at these points:

## 1. First message — scope
Ask: *"Which exam/shift? e.g. 'jeemain 2025 22jan-shift1'. Or drop PDFs in input/ and I'll process them."*

## 2. No PDF found
If `input/` is empty and no shift specified, ask for PDFs or a shift name.

## 3. Filename can't be parsed
If `process-pdf` can't determine exam/year/shift from filename, ask for `--exam`, `--year`, `--shift` flags.

## 4. All 6 providers fail health check (`npm run test-models`)
Do NOT proceed. Ask human to check API keys in `.env`. Pipeline cannot run without at least one working provider.

## 5. Schema mismatch
If a provider returns a JSON format that doesn't match expected types, ask the human: *"Provider X returned unexpected format. Should I fix the schema or switch providers?"*

## 6. Validation errors > 50% of questions
If >50% of extracted questions fail auto-validation, pause and show sample errors. Ask: *"The output has high error rate. Should I re-run with a different provider or manually correct?"*

## 7. Review required (recommended)
After a shift is processed, suggest: *"Done 90 questions. Run 'npm run review -- --exam <X> --year <Y> --shift <Z>' to review, or 'npm run dashboard' for the web UI?"*

## 8. Critical — never fabricate
If a stage cannot complete (OCR fails, all providers error, etc.), tell the human exactly what failed. Do NOT invent questions, answers, or paper data from training memory. The human would rather see an error than corrupt data.
