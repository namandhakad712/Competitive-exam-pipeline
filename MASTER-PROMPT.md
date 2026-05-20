# MASTER PROMPT — Indian Exam PDF → JSON Dataset

> Copy-paste this entire file into any AI (OpenCode, Cline, Qwen Chat Studio, Claude, Gemini, etc.)
> The AI needs: web search/fetch to find PDFs + vision to read pages + file save capability.
> If you have Mistral OCR API key, you can use it as accelerator (optional, not required).
> No local codebase needed. This is fully self-contained.

## ⚠️ HARD RULE: YOU MUST ACTUALLY READ THE PDF. NEVER FABRICATE.

**You must extract questions from the REAL PDF you downloaded. You must NOT:**

- ❌ Generate questions from your training data / memory / knowledge about exam topics
- ❌ Output sample questions or examples from this prompt as if they were real results
- ❌ Use "common JEE questions everyone knows" instead of what the PDF actually contains
- ❌ Fill in missing questions with plausible-sounding made-up content
- ❌ Skip steps because "I already know what this exam looks like"

**If you cannot access or read the PDF:**
→ Tell the user exactly why. Don't produce output from nothing.
→ *"PDF returned 404"* / *"Blocked by CAPTCHA"* / *"Scanned image too blurry to read"*

**If you cannot find an answer key anywhere:**
→ Set ALL answers to empty string. Do NOT derive, calculate, or guess answers yourself.
→ Do NOT use your knowledge of the subject to "figure out" what the answer should be.

**A failed extraction with an honest error is 1000× better than fabricated data.**
Wrong answers poison the dataset permanently. The user trusts you to tell the truth, not to make things look complete.

---

## YOUR MISSION

Download Indian exam PDFs from the web, read every page visually, extract every question with its answer, and output structured JSON files. You do ALL the work. The user only provides the exam name and shift.

**Exams you must handle:** jeemain | neet | jeeadv | ncert-exemplar

---

## OUTPUT SCHEMA — You MUST output exactly this structure

### File: `paper.json`

```json
{
  "schema": "v4",
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
    "a": { "label": "Section A", "total": 60, "required": 50, "mandatory": true },
    "b": { "label": "Section B", "total": 30, "required": 10, "mandatory": false }
  },
  "scrapedAt": "2026-05-19T12:00:00.000Z",
  "answerKeyFound": true,
  "questions": [
    {
      "id": "jeemain-2025-22jan-s1-ph-001",
      "number": 1,
      "numberLabel": null,
      "subject": "physics",
      "topic": "kinematics",
      "section": "a",
      "type": "mcq",
      "text": "A particle moves along x-axis with velocity v = 2t m/s. At t=0, x=0. Find position at t=3s.",
      "textHi": null,
      "options": ["1 m", "2 m", "4 m", "8 m"],
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
      "difficulty": null,
      "tags": ["motion-in-straight-line", "kinematics", "calculus"],
      "revision": 1,
      "source": "official-pdf",
      "confidence": null
    }
  ],
  "passages": []
}
```

### Subject split file: `physics.json`

Same as `paper.json` but only contains questions for one subject.
Number resets to 1-N within the subject file. IDs remain globally unique.

### ID scheme

```
{exam}-{year}-{shift-shorthand}-{subject-code}-{3-digit-number}

jeemain-2025-22jan-s1-ph-001
neet-2025-04may-bi-045
jeeadv-2025-p1-ch-012
ncert-exemplar-11-ph-023

Subject codes: ph / ch / ma / bi
```

Shift shorthand examples:
- "22 january shift 1" → "22jan-s1"
- "4 may" → "04may"
- "paper 1" (JEE Adv) → "p1"

---

## HOW TO FIND PDFs (web search)

### JEE Main (National Testing Agency)

Search for:
- `jeemain 2025 22 january shift 1 question paper pdf nta`
- `jeemain 2025 22 jan shift 1 paper pdf`
- `nta.ac.in jeemain 2025 question paper`

Known URL pattern: `https://jeemain.nta.nic.in/...` (varies by year)

If NTA site is down or 404: try gateoverflow.in mirrors:
- `gateoverflow.in jeemain 2025 question paper pdf`

### JEE Advanced

Search: `jee advanced 2024 question paper pdf`
Official: `https://jeeadv.ac.in/`

### NEET UG

Search: `neet 2024 question paper pdf nta`

### NCERT Exemplar

Search: `ncert exemplar class 11 physics pdf`
Official: `https://ncert.nic.in/textbook.php`

---

## EXECUTION FLOW

### Step 1: Find & Download the PDF

Use web search to find the exam paper PDF. Download it. Read it visually page by page.

**If PDF is not directly downloadable** (e.g., Google Drive, Dropbox):
- Use web fetch to try downloading
- If blocked, search for alternate mirrors
- Tell the user if you cannot access it

### Step 2: Read Every Page Visually

**HOW TO READ THE PDF — use your vision capability.**
Open the PDF in your vision model and read every page like a human would. Do NOT use external OCR APIs unless explicitly stated below.

**CRITICAL — Answer key detection first:**
Before extracting questions, scan the ENTIRE PDF for an answer key. Look for:
- "Answer Key", "ANSWER KEY", "Answer key" heading
- "Ans:", "Ans :", "Answer:" columns
- Numbered list at the very end of the PDF matching question numbers
- A table with question numbers and answer letters/numbers

If NO answer key is found, you MUST set `answer: ""` (empty string) for ALL questions. Do NOT invent, guess, or derive answers yourself. Wrong answers are worse than missing answers — they silently poison the dataset.

If an answer key IS found, read it carefully and match each answer to the correct question number. Note that answer keys often have multi-digit numbers that may wrap across lines.

Go through EVERY page of the PDF:
- Read all questions
- Read ALL text including the answer key (usually at the end)
- Note any diagrams, tables, or figures
- Note the section structure (Section A, B, etc.)
- Note the marking scheme (marks correct, marks incorrect)

**Critical: Time-travel backfill**
- The answer key is usually on the LAST page(s)
- Read the entire PDF first, including the answer key
- Match answers to questions by number
- Backfill answer fields for questions seen earlier

**⚠️ PDF reading troubleshooting:**
- PDF won't render? → Try fetching via direct URL vs. Google Drive vs. mirror site
- Scanned/image-only PDF? → Use your vision to read each page image-by-image
- Pages are rotated? → Mentally rotate; the content is still there
- Blurry text? → Search for a cleaner copy or tell user
- Can't access PDF at all? → Tell user the exact error (blocked, 404, CAPTCHA)

**🔄 Optional: Mistral OCR accelerator (if you have API access)**
If you have a Mistral API key, you can send the PDF to `https://api.mistral.ai/v1/ocr` for automatic text extraction instead of reading visually. POST the PDF as base64 in `document[].base64`. Response includes per-page markdown + embedded images. Then parse that markdown into JSON. Rate limit: 60 req/min, 50k tokens/min.

**⚠️ PDF reading troubleshooting:**
- PDF won't render? → Try fetching via direct URL vs. Google Drive vs. mirror site
- Scanned/image-only PDF? → Use your vision to read each page image-by-image
- Pages are rotated? → Mentally rotate; the content is still there
- Blurry text? → Search for a cleaner copy or tell user
- Can't access PDF at all? → Tell user the exact error (blocked, 404, CAPTCHA)

### Step 3: Extract to JSON

Now structure everything you read into the JSON schema above. Do this using your own text processing capability — no external APIs needed. You have all the information from reading the PDF visually. Simply organize it into the specified JSON format.

| Field | How to determine |
|---|---|
| `type` | MCQ (4 options), MSQ (multiple correct), NAT (numeric), assertion-reason |
| `subject` | Which subject section it appears in |
| `topic` | What concept it tests (use controlled vocabulary below) |
| `options` | The 4-6 choices listed |
| `answer` | From answer key: MCQ = index string "0"-"3", NAT = numeric string |
| `answers` | MSQ: array of correct indices, sorted ascending |
| `negativeMarks` | 0 for NAT questions |
| `section` | "a" or "b" (JEE Main) or "section-1"/"section-2" |
| `hasDiagram` | true if question references a diagram/figure |
| `passageId` | If question refers to a common passage, create passage ID |

### Step 4: Save the Files

Create these files:

```
data/{exam}/{year}/{shift}/paper.json
data/{exam}/{year}/{shift}/physics.json
data/{exam}/{year}/{shift}/chemistry.json
data/{exam}/{year}/{shift}/mathematics.json
data/{exam}/{year}/{shift}/biology.json    (NEET only)
data/{exam}/{year}/{shift}/diagrams/{subject}/q{3digit}-fig{n}.png   (if any)
```

---

## TOPIC VOCABULARY (Controlled)

Use these topic names. If a question doesn't match any, use "general-{subject}".

### Physics topics
- electrostatics, current-electricity, magnetic-effects, electromagnetic-induction, alternating-currents, optics, ray-optics, wave-optics, modern-physics, dual-nature, atoms, nuclei, semiconductors, communication-systems, kinematics, laws-of-motion, work-energy-power, rotational-motion, gravitation, mechanical-properties-solids, mechanical-properties-fluids, thermal-properties, thermodynamics, kinetic-theory, oscillations, waves, electromagnetic-waves, general-physics

### Chemistry topics
- mole-concept, atomic-structure, chemical-bonding, states-of-matter, thermodynamics-chemistry, equilibrium, redox, hydrogen, s-block, p-block, d-block, f-block, coordination-compounds, environmental-chemistry, metallurgy, organic-chemistry-basics, hydrocarbons, haloalkanes, alcohols-phenols-ethers, aldehydes-ketones, carboxylic-acids, amines, biomolecules, polymers, chemistry-in-everyday-life, electrochemistry, chemical-kinetics, surface-chemistry, solid-state, solutions, general-chemistry

### Mathematics topics
- sets, relations, complex-numbers, quadratic-equations, permutations-combinations, binomial-theorem, sequences-series, matrices, determinants, vectors, 3d-geometry, linear-programming, probability, statistics, trigonometry, trigonometric-functions, inverse-trigonometry, limits, continuity, differentiability, application-derivatives, indefinite-integrals, definite-integrals, differential-equations, coordinate-geometry, straight-lines, circles, conic-sections, mathematical-reasoning, general-mathematics

### Biology topics (NEET only)
- diversity-living-world, structural-organization-plants, structural-organization-animals, cell-unit-life, cell-cycle, plant-physiology, photosynthesis, respiration-plants, plant-growth, human-physiology, digestion, breathing, body-fluids, excretion, locomotion, neural-control, chemical-coordination, reproduction-organisms, sexual-reproduction-flowering-plants, human-reproduction, reproductive-health, principles-inheritance, molecular-basis-inheritance, evolution, health-disease, food-production, biotechnology, organisms-populations, ecosystem, biodiversity, environmental-issues, general-biology

---

## CRITICAL: ANTI-HALLUCINATION RULE

**This rule covers TWO forms of fabrication — both equally forbidden:**

### 1. NEVER invent an answer.
If the PDF has no answer key, every `answer` field must be `""` (empty string). A question with a wrong answer is WORSE than a question with no answer — it poisons the entire dataset. Human reviewers need to see empty answers so they know to fill them in.

### 2. NEVER invent a question.
Every question in your output must come directly from the actual PDF you read. Do NOT add:
- Questions you remember from similar exams
- Questions that "seem like they should be there"
- Questions from your training data about this topic
- Any content not present in the specific PDF you downloaded

**If the PDF has no answer key → ALL answers = ""**
**If the PDF is missing pages or illegible → extract what you can, mark the gap, tell the user**
**If you cannot read the PDF at all → output nothing, explain to user**

This is not optional. It is the most important rule in this document.

---

## QUESTION TYPE RULES

### MCQ (Multiple Choice — Single Correct)
- `options`: string[], length 3-5
- `answer`: 0-based index string, e.g. "0", "1", "2", "3"
- `answers`: null
- `options`: null
- `negativeMarks`: usually -1 (JEE Main) or 0 (NEET)

### MSQ (Multiple Select Questions)
- `options`: string[], length 4-6
- `answers`: sorted array of correct indices, e.g. ["1", "3"]
- `answer`: concatenated string like "1,3" or first answer (use best judgment)
- `options`: null

### NAT (Numerical Answer Type)
- `options`: null
- `answer`: numeric string, e.g. "4", "2.5"
- `negativeMarks`: MUST be 0
- `answerPrecision`: set if the question specifies decimal places or range

### Assertion-Reason
- `options`: null (auto-generated by display layer)
- `answer`: one of "0", "1", "2", "3"
- AR mapping:
  - "0" = Both A and R are true, R is correct explanation of A
  - "1" = Both A and R are true, R is NOT correct explanation of A
  - "2" = A is true but R is false
  - "3" = A is false but R is true

### Passage-Based Questions
- Create a Passage object with a unique ID
- Each question referencing it gets `passageId`
- Passage text goes in `passages[]` array

### Match the Columns (JEE Advanced)
- Store as type: "mcq" with 4 pairing options
- Each option is a complete pairing string like "A→P, B→Q, C→R, D→S"

---

## OUTPUT RULES

1. **ALL LOWERCASE** — exam names, dirs, file names, IDs, field values. No exceptions.
2. **IDs** — every question gets a unique ID: `{exam}-{year}-{shift}-{subject}-{3digit}`
3. **Subject files** — number resets to 1-N. e.g., first physics question = number 1
4. **Aggregate files** — `all-physics.json` across shifts: number resets again. IDs stay unique.
5. **Difficulty = null** — never guess difficulty. Human assigns later.
6. **source** = `"official-pdf"` for directly downloaded, `"reconstructed"` if from a mirror
7. **tags** — use controlled vocabulary from the topic list above. Max 5 tags per question.
8. **Checksum** — Compute SHA-256 of the JSON string BEFORE adding the checksum field.
   Steps: serialize → hash → add checksum field → serialize final.
9. **scrapedAt** — ISO 8601 timestamp of when you downloaded it.

---

## VALIDATION — Self-Check Before Saving

Before saving any file, verify:

- [ ] Every MCQ has 3-5 options
- [ ] Every MCQ answer is a 0-based index string ("0"-"3")
- [ ] Every NAT has negativeMarks = 0
- [ ] Every NAT answer is numeric
- [ ] No HTML tags in question text
- [ ] No placeholder text like "[image]", "[figure]", "[Diagram]"
- [ ] No empty question text
- [ ] All passageIds reference valid entries in passages array
- [ ] All IDs follow the scheme exactly
- [ ] Total questions count matches paper.total
- [ ] Subject counts sum to total
- [ ] All text is properly encoded (no garbled Unicode)
- [ ] Answers are consistent with answer key
- [ ] All answers are empty string if answerKeyFound=false
- [ ] **FATAL CHECK: If no answer key was found, ALL answers must be empty string. If any question has a non-empty answer despite no key, delete every answer immediately.**
- [ ] **FATAL CHECK: Every single question in your output came from the actual PDF you downloaded. None came from your memory, training data, or examples in this prompt. If you cannot truthfully say this, delete the entire output and restart.**

**If any FATAL CHECK fails, do NOT save the file. Fix the root cause first.**

---

## WHAT TO OUTPUT TO USER

After saving all files, give this summary:

```
✅ {exam} {year} {shift}: {N} questions extracted
   {subject} {count} | {subject} {count} | ...
   {N} diagrams saved
   All files at: data/{exam}/{year}/{shift}/
```

If something went wrong:
```
❌ {description of what failed}
   {what you tried}
   {what user needs to do}
```

---

## EDGE CASES

### PDF is image-only (scanned)
- Use your vision capabilities to read each scanned page
- Extract text manually from the images
- If you can't read it, tell the user "scanned PDF, cannot extract reliably"

### Answer key is missing from the PDF
- Search for answer key separately: "{exam} {year} {shift} answer key"
- If found, use it to fill answers
- If not found, set answer to "" and flag for user

### Questions span multiple pages
- Read adjacent pages to capture the full question
- Diagrams on page 3, question text on page 2 → combine them

### Hindi/English bilingual (NEET)
- Both languages present. Extract both into `text` (English) and `textHi` (Hindi)
- If English portion is missing, text = textHi (and vice versa)

### JEE Advanced has sub-questions (1(a), 1(b))
- Each sub-question is a separate Question entry
- Set `numberLabel` to "1(a)", "1(b)" etc.
- Set `number` to the parent question number

### Diagram references
- If question says "see figure" or has a diagram
- Set `hasDiagram: true`
- Save the diagram image if you can access/extract it
- Reference it in `diagrams: [{ file: "q003-fig1.png", label: null, caption: null }]`

---

## COMPLETE EXAMPLES

### JEE Main 2025 Shift 1 (MCQ)

Input page shows:
```
Section A
1. A particle moves along x-axis with velocity v = 2t m/s. At t=0, x=0. Find position at t=3s.
(1) 1 m  (2) 2 m  (3) 4 m  (4) 8 m
```

Answer key at end: `1 2`

Output:
```json
{
  "id": "jeemain-2025-22jan-s1-ph-001",
  "number": 1,
  "subject": "physics",
  "topic": "kinematics",
  "section": "a",
  "type": "mcq",
  "text": "A particle moves along x-axis with velocity v = 2t m/s. At t=0, x=0. Find position at t=3s.",
  "options": ["1 m", "2 m", "4 m", "8 m"],
  "answer": "1",
  "marks": 4,
  "negativeMarks": -1,
  "tags": ["kinematics", "motion-in-straight-line"],
  "revision": 1,
  "source": "official-pdf",
  "difficulty": null,
  "confidence": null
}
```

### NEET 2024 (Bilingual)

Input page shows Hindi and English text. Output:
```json
{
  "text": "Which of the following is a vector quantity?",
  "textHi": "निम्नलिखित में से कौन सी सदिश राशि है?",
  "options": ["Speed", "Velocity", "Mass", "Distance"],
  "answer": "1",
  "type": "mcq",
  "subject": "physics",
  "topic": "kinematics"
}
```

### JEE Advanced 2024 (MSQ)

```json
{
  "type": "msq",
  "options": ["Statement 1", "Statement 2", "Statement 3", "Statement 4"],
  "answers": ["0", "2"],
  "answer": "0,2",
  "negativeMarks": -2
}
```

### JEE Advanced (Assertion-Reason)

```json
{
  "type": "assertion-reason",
  "options": null,
  "answer": "1"
}
```

### JEE Advanced (Match Columns — stored as MCQ)

```json
{
  "type": "mcq",
  "options": [
    "A→P, B→Q, C→R, D→S",
    "A→Q, B→P, C→S, D→R",
    "A→R, B→S, C→P, D→Q",
    "A→S, B→R, C→Q, D→P"
  ],
  "answer": "0"
}
```

### NAT with Precision

```json
{
  "type": "nat",
  "options": null,
  "answer": "2.5",
  "negativeMarks": 0,
  "answerPrecision": { "type": "decimal-range", "min": 2.49, "max": 2.51, "unit": "m" }
}
```

---

## FILE SAVE INSTRUCTIONS

Save files with these exact paths relative to your working directory:

```
data/{exam}/{year}/{shift}/paper.json
data/{exam}/{year}/{shift}/physics.json
data/{exam}/{year}/{shift}/chemistry.json
data/{exam}/{year}/{shift}/mathematics.json
data/{exam}/{year}/{shift}/biology.json
data/index.json                      # Master index of all datasets
```

Each subject file contains ALL questions for that subject with number reset to 1-N.

`data/index.json` format:
```json
{
  "version": 1,
  "datasets": [
    {
      "exam": "jeemain",
      "year": 2025,
      "shift": "22jan-shift1",
      "subjects": ["physics", "chemistry", "mathematics"],
      "total": 90,
      "answerKeyFound": true,
      "verified": false,
      "checksum": "sha256hex..."
    }
  ]
}
```

---

## FINAL REMINDER

- You are replacing a complex TypeScript pipeline. Be thorough.
- Read EVERY page of the PDF. Don't skip the answer key.
- Every field matters. Don't leave fields null unless the schema allows it.
- If you're unsure about an answer, flag it rather than guessing.
- **HARD RULE: If you didn't read it from the PDF, don't put it in the output.** No training data, no memory, no examples from this prompt.
- **HARD RULE: If you cannot complete the task, say so. Do NOT fabricate results.**
- All lowercase. Always.
- User can paste this file into you and say "go" — nothing else needed.
