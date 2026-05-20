# NEXT ACTIONS - Complete the Pipeline

## 🎯 GOAL: Reach 98% Accuracy

Current: **92-95%** → Target: **98-99%**

---

## ACTION 1: Test Enhanced OCR (30 minutes)

**Why:** Verify Mistral returns structured annotations as expected

**Steps:**
1. Run the test script:
   ```bash
   npx tsx scripts/test-mistral-structured.ts
   ```

2. Check output for:
   - ✅ `document_annotation` field present
   - ✅ Questions array with number, text, options, answer
   - ✅ `bbox_annotation` field present
   - ✅ Images array with image_id, type, description

3. If successful → Proceed to Action 2
4. If failed → Debug Mistral API response

**Expected Output:**
```json
{
  "document_annotation": "{\"questions\": [...], \"answer_key_found\": true}",
  "bbox_annotation": "{\"images\": [...]}",
  "pages": [...]
}
```

---

## ACTION 2: Integrate Enhanced OCR into Main Pipeline (1 hour)

**Why:** Activate structured annotations in production

**File:** `scripts/process-pdf.ts`

**Changes:**
```typescript
// BEFORE (line ~200)
const ocrOutput = await ocrPdf(pdfPath);

// AFTER
const ocrOutput = await enhancedOcrPdf(pdfPath);

// BEFORE (line ~210)
const extraction = await extractQuestions(sourcePages, exam);

// AFTER
// Try using Mistral's structured annotation first
if (ocrOutput.structuredAnnotation) {
  logger.info("Using Mistral structured annotation");
  const sa = ocrOutput.structuredAnnotation as any;
  extraction = {
    questions: sa.questions || [],
    passages: [],
    answerKeyFound: sa.answer_key_found || false
  };
} else {
  // Fallback to AI extraction
  extraction = await extractQuestions(sourcePages, exam);
}

// BEFORE (line ~220)
await cacheDiagrams({
  questions: extraction.questions,
  images: ocrOutput.images,
  shiftDir,
});

// AFTER
await cacheDiagrams({
  questions: extraction.questions,
  images: ocrOutput.images,
  shiftDir,
  ocrResult: ocrOutput, // Pass enhanced OCR result
});
```

**Test:**
```bash
npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf"
```

---

## ACTION 3: Add Consensus Flag (1 hour)

**Why:** Enable multi-provider extraction optionally

**File:** `scripts/process-pdf.ts`

**Changes:**
```typescript
// Add to parseArgs options (line ~150)
options: {
  input: { type: "string", short: "i" },
  "answer-key": { type: "string", short: "k" },
  exam: { type: "string" },
  year: { type: "string" },
  shift: { type: "string" },
  force: { type: "boolean", short: "f" },
  consensus: { type: "boolean", short: "c" }, // NEW
  help: { type: "boolean", short: "h" },
}

// Update extraction logic (line ~210)
let extraction;
if (values.consensus) {
  logger.info("Using consensus extraction (3 providers)");
  const consensusResult = await extractWithConsensus(
    sourcePages,
    exam,
    ["nvidia", "longcat", "gemini"]
  );
  extraction = {
    questions: consensusResult.questions,
    passages: consensusResult.passages,
    answerKeyFound: consensusResult.answerKeyFound
  };
  
  // Log conflicts
  if (consensusResult.conflicts.length > 0) {
    logger.warn(`Consensus: ${consensusResult.conflicts.length} conflicts detected`);
    for (const conflict of consensusResult.conflicts) {
      logger.warn(`  Q${conflict.questionNumber}: ${conflict.reason}`);
    }
  }
} else {
  extraction = await extractQuestions(sourcePages, exam);
}
```

**Test:**
```bash
npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf" --consensus
```

---

## ACTION 4: Create Embeddings Utility (2 hours)

**Why:** Enable semantic similarity in merger

**File:** `src/utils/embeddings.ts` (NEW)

```typescript
import { logger } from "./logger.js";
import { RateLimiter } from "./rate-limiter.js";

const MISTRAL_API = "https://api.mistral.ai/v1/embeddings";
const MISTRAL_KEY = process.env.MISTRAL_API_KEY ?? "";

const rateLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60_000 });

// Cache embeddings to avoid redundant API calls
const embeddingCache = new Map<string, number[]>();

export async function embed(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase();
  
  // Check cache
  if (embeddingCache.has(key)) {
    return embeddingCache.get(key)!;
  }
  
  // Call Mistral embeddings API
  return rateLimiter.call(async () => {
    const response = await fetch(MISTRAL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MISTRAL_KEY}`
      },
      body: JSON.stringify({
        model: "mistral-embed",
        input: [text]
      })
    });
    
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Mistral Embeddings API ${response.status}: ${body.slice(0, 200)}`);
    }
    
    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };
    
    const embedding = data.data[0].embedding;
    embeddingCache.set(key, embedding);
    return embedding;
  });
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length");
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function semanticSimilarity(a: string, b: string): Promise<number> {
  const [embA, embB] = await Promise.all([embed(a), embed(b)]);
  return cosineSimilarity(embA, embB);
}
```

**Update:** `src/extractors/merger.ts`

```typescript
import { semanticSimilarity } from "../utils/embeddings.js";

// Replace textSimilarity function (line ~195)
export async function textSimilarity(a: string, b: string): Promise<number> {
  try {
    return await semanticSimilarity(a, b);
  } catch (err) {
    logger.warn(`Embeddings failed, using Jaccard: ${err}`);
    // Fallback to Jaccard
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
  }
}

// Update pickBetter to use async (line ~150)
async function pickBetter(
  a: PartialQuestion,
  aChunk: number,
  b: PartialQuestion,
  bChunk: number,
): Promise<"new" | "existing"> {
  // ... existing rules ...
  
  // Add semantic similarity check
  const similarity = await textSimilarity(a.text, b.text);
  if (similarity < 0.8) {
    // Different questions, prefer earlier chunk
    return aChunk <= bChunk ? "new" : "existing";
  }
  
  // ... rest of logic ...
}
```

**Test:**
```typescript
// scripts/test-embeddings.ts
import { embed, semanticSimilarity } from "../src/utils/embeddings.js";

async function test() {
  const sim1 = await semanticSimilarity(
    "A particle moves with velocity 2 m/s",
    "A particle has velocity of 2 m/s"
  );
  console.log("Similar texts:", sim1); // Should be > 0.9
  
  const sim2 = await semanticSimilarity(
    "A particle moves with velocity 2 m/s",
    "What is the capital of France?"
  );
  console.log("Different texts:", sim2); // Should be < 0.3
}

test();
```

---

## ACTION 5: Create Golden Dataset (2 hours)

**Why:** Ground truth for regression testing

**Steps:**

1. **Select a reference PDF:**
   - Use `input/neet-2025-04may-s1.pdf` (already in repo)
   - Or download JEE Main 2024 22jan-shift1

2. **Process it:**
   ```bash
   npm run process-pdf -- --input "input/neet-2025-04may-s1.pdf" --consensus
   ```

3. **Manually verify first 20 questions:**
   - Open the PDF
   - Open `data/neet/2025/04may-s1/physics.json`
   - Check each question:
     - ✅ Text matches PDF
     - ✅ Options match PDF
     - ✅ Answer matches answer key
     - ✅ Diagrams linked correctly

4. **Save as golden dataset:**
   ```bash
   cp data/neet/2025/04may-s1/physics.json tests/fixtures/golden-neet-2025-physics.json
   ```

5. **Create test:**
   ```typescript
   // tests/integration/golden-dataset.test.ts
   import { describe, it, expect } from "vitest";
   import { readFile } from "fs/promises";
   import { validateQuestionFile } from "../../src/validators/auto-validator.js";
   
   describe("Golden Dataset Regression", () => {
     it("matches golden NEET 2025 physics", async () => {
       const golden = JSON.parse(
         await readFile("tests/fixtures/golden-neet-2025-physics.json", "utf-8")
       );
       
       // Process the same PDF again
       const result = await processPdf("input/neet-2025-04may-s1.pdf");
       
       // Compare
       expect(result.questions.length).toBe(golden.questions.length);
       
       for (let i = 0; i < golden.questions.length; i++) {
         const g = golden.questions[i];
         const r = result.questions[i];
         
         expect(r.number).toBe(g.number);
         expect(r.text).toBe(g.text);
         expect(r.answer).toBe(g.answer);
         expect(r.options).toEqual(g.options);
       }
     });
   });
   ```

---

## ACTION 6: Run Full Pipeline Test (1 hour)

**Why:** Verify everything works end-to-end

**Test Script:** `scripts/test-full-pipeline.ts` (NEW)

```typescript
import { enhancedOcrPdf } from "../src/extractors/ocr-stage.js";
import { extractWithConsensus } from "../src/extractors/consensus-extractor.js";
import { cacheDiagrams } from "../src/extractors/diagram-cacher.js";
import { validateQuestionFile } from "../src/validators/auto-validator.js";
import { exportDataset, writeDataset } from "../src/finalizers/exporter.js";
import { logger } from "../src/utils/logger.js";

async function testFullPipeline() {
  const pdfPath = "input/neet-2025-04may-s1.pdf";
  
  logger.info("=== FULL PIPELINE TEST ===");
  
  // Stage 1: Enhanced OCR
  logger.info("Stage 1: Enhanced OCR");
  const ocrResult = await enhancedOcrPdf(pdfPath);
  logger.info(`  ✓ ${ocrResult.pages.length} pages`);
  logger.info(`  ✓ Structured annotation: ${!!ocrResult.structuredAnnotation}`);
  logger.info(`  ✓ Bbox annotation: ${!!ocrResult.bboxAnnotation}`);
  
  // Stage 2: Consensus Extraction
  logger.info("Stage 2: Consensus Extraction");
  const consensus = await extractWithConsensus(
    ocrResult.pages,
    "neet",
    ["nvidia", "longcat", "gemini"]
  );
  logger.info(`  ✓ ${consensus.questions.length} questions`);
  logger.info(`  ✓ ${consensus.conflicts.length} conflicts`);
  logger.info(`  ✓ Answer key found: ${consensus.answerKeyFound}`);
  
  // Stage 3: Diagram Caching
  logger.info("Stage 3: Diagram Caching");
  await cacheDiagrams({
    questions: consensus.questions,
    images: ocrResult.images,
    shiftDir: "data/neet/2025/test",
    ocrResult
  });
  const withDiagrams = consensus.questions.filter(q => q.diagrams?.length);
  logger.info(`  ✓ ${withDiagrams.length} questions with diagrams`);
  
  // Stage 4: Validation
  logger.info("Stage 4: Validation");
  const file = await exportDataset({
    exam: "neet",
    year: 2025,
    shift: "test",
    paper: null,
    subjects: ["physics", "chemistry", "biology"],
    duration: 200,
    marksCorrect: 4,
    marksIncorrect: -1,
    marksUnanswered: 0,
    sections: {},
    questions: consensus.questions,
    passages: consensus.passages,
    answerKeyFound: consensus.answerKeyFound
  });
  
  const validation = validateQuestionFile(file, "data");
  const errors = validation.filter(v => !v.valid);
  logger.info(`  ✓ ${validation.length - errors.length}/${validation.length} questions valid`);
  
  if (errors.length > 0) {
    logger.warn(`  ⚠ ${errors.length} validation errors`);
    for (const err of errors.slice(0, 5)) {
      logger.warn(`    Q${err.index + 1}: ${err.flags[0]?.message}`);
    }
  }
  
  logger.info("=== TEST COMPLETE ===");
  logger.info(`Accuracy estimate: ${((validation.length - errors.length) / validation.length * 100).toFixed(1)}%`);
}

testFullPipeline().catch(console.error);
```

**Run:**
```bash
npx tsx scripts/test-full-pipeline.ts
```

---

## 📊 SUCCESS METRICS

After completing these actions, you should see:

- ✅ Enhanced OCR returns structured annotations
- ✅ Consensus extraction runs with 3 providers
- ✅ Diagrams correctly linked to questions
- ✅ Embeddings working for semantic similarity
- ✅ Golden dataset created and passing
- ✅ Full pipeline test passing with >95% accuracy

---

## 🚨 TROUBLESHOOTING

### If Mistral structured annotation fails:
- Check API key is valid
- Verify PDF is not password-protected
- Try with smaller PDF (first 3 pages only)
- Check Mistral API status

### If consensus extraction fails:
- Check all 3 provider API keys
- Try with single provider first
- Check rate limits

### If embeddings fail:
- Verify Mistral embeddings API is available
- Check rate limits (60 req/min)
- Use fallback Jaccard similarity

---

## ⏱️ TIME ESTIMATE

- Action 1: 30 min
- Action 2: 1 hour
- Action 3: 1 hour
- Action 4: 2 hours
- Action 5: 2 hours
- Action 6: 1 hour

**Total: 7.5 hours** to reach 98% accuracy

---

## 🎯 FINAL GOAL

After these actions:
- **Accuracy: 98%+**
- **Fully automated pipeline**
- **Regression testing in place**
- **Production-ready**

Ready to start? Pick an action and let's go! 🚀
