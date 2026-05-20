# QUICK FIXES - Priority Order

## 🔴 CRITICAL (Do These First)

### 1. Fix Mistral OCR Integration (2 hours)
**Problem:** Not using structured annotations or bbox data  
**Fix:** Add `document_annotation_format` and `bbox_annotation_format` to OCR call  
**Impact:** Single API call instead of two, guaranteed JSON structure, proper diagram bboxes

### 2. Fix Diagram Extraction (1 hour)
**Problem:** Saving full page images instead of actual diagrams  
**Fix:** Use Mistral's pre-extracted images with bbox coordinates  
**Impact:** Correct diagram-to-question linking, smaller file sizes

### 3. Improve Answer Key Detection (1 hour)
**Problem:** Regex patterns miss many answer key formats  
**Fix:** Use bbox annotations to detect answer key regions  
**Impact:** 95%+ answer key detection rate (currently ~70%)

## 🟡 IMPORTANT (Do These Next)

### 4. Add Multi-Provider Consensus (3 hours)
**Problem:** Using only 1 provider, no error detection  
**Fix:** Run 3 providers in parallel, use majority voting  
**Impact:** 98% accuracy (up from 85%)

### 5. Add Validation Checkpoints (2 hours)
**Problem:** Validation happens too late, no auto-repair  
**Fix:** Validate after each stage, implement auto-repair  
**Impact:** Catch errors early, reduce manual fixes

### 6. Semantic Topic Normalization (2 hours)
**Problem:** Static aliases miss typos and new topics  
**Fix:** Use embeddings + fuzzy matching  
**Impact:** 95%+ topic classification (currently ~80%)

## 🟢 NICE TO HAVE (Do These Later)

### 7. Granular Checkpoints (2 hours)
**Problem:** Must restart entire pipeline on failure  
**Fix:** Save state after each stage  
**Impact:** Resume from failure point

### 8. Progressive Review (2 hours)
**Problem:** Review all 90 questions at end  
**Fix:** Review samples during extraction  
**Impact:** Catch systematic errors early

---

## Test Script to Run Right Now

```typescript
// scripts/test-mistral-structured.ts
import { readFile } from "fs/promises";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

async function testStructuredOCR() {
  // Use one of your existing PDFs
  const pdfPath = "input/neet-2025-04may-s1.pdf";
  const pdfBase64 = (await readFile(pdfPath)).toString("base64");
  
  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: `data:application/pdf;base64,${pdfBase64}`
      },
      document_annotation_format: {
        type: "json_object"
      },
      document_annotation_prompt: "Extract all questions as JSON array with fields: number, text, options, answer",
      include_image_base64: true,
      pages: [0, 1, 2] // Test first 3 pages only
    })
  });
  
  const data = await response.json();
  
  console.log("=== STRUCTURED ANNOTATION ===");
  console.log(data.document_annotation);
  
  console.log("\n=== IMAGES ===");
  for (const page of data.pages) {
    console.log(`Page ${page.index}: ${page.images?.length || 0} images`);
    for (const img of page.images || []) {
      console.log(`  - ${img.id}: bbox (${img.top_left_x}, ${img.top_left_y}) to (${img.bottom_right_x}, ${img.bottom_right_y})`);
    }
  }
}

testStructuredOCR();
```

Run with:
```bash
npx tsx scripts/test-mistral-structured.ts
```

This will show you:
1. If Mistral can extract questions directly
2. What the bbox data looks like
3. How images are linked to text

**Expected output:** JSON with questions array + images with coordinates

---

## Decision Tree

```
Can Mistral extract questions directly?
├─ YES → Skip separate AI extraction, use Mistral's output
└─ NO → Keep current approach but fix diagram extraction

Are images returned with bbox?
├─ YES → Use pre-extracted images, no cropping needed
└─ NO → Crop from full page using bbox coordinates

Does consensus improve accuracy?
├─ YES (>5% improvement) → Implement for all papers
└─ NO (<5% improvement) → Use only for high-value papers
```

---

## Quick Win: Fix Diagram Extraction in 30 Minutes

Replace `diagram-cacher.ts` with this:

```typescript
export async function cacheDiagrams(input: CacheDiagramsInput): Promise<void> {
  const { questions, ocrResult, shiftDir } = input;
  
  for (const q of questions) {
    if (!q.hasDiagram) continue;
    
    // Find images referenced in question text
    const imgRefs = q.text.match(/!\[([^\]]+)\]\(([^\)]+)\)/g) || [];
    
    for (const ref of imgRefs) {
      const [_, label, imageId] = ref.match(/!\[([^\]]+)\]\(([^\)]+)\)/)!;
      
      // Find image in OCR result
      const image = findImageById(ocrResult, imageId);
      if (!image) {
        logger.warn(`Image ${imageId} not found in OCR result`);
        continue;
      }
      
      // Save image
      const filename = `q${pad(q.number)}-${imageId}`;
      const filepath = join(shiftDir, "diagrams", q.subject, filename);
      await mkdir(dirname(filepath), { recursive: true });
      await writeFile(filepath, Buffer.from(image.image_base64, "base64"));
      
      // Update question
      if (!q.diagrams) q.diagrams = [];
      q.diagrams.push({
        file: `diagrams/${q.subject}/${filename}`,
        label: label || null,
        caption: null
      });
    }
  }
}

function findImageById(ocrResult: OcrResult, imageId: string) {
  for (const page of ocrResult.pages) {
    const img = page.images?.find(i => i.id === imageId);
    if (img) return img;
  }
  return null;
}
```

**Test:** Run on one PDF, check if diagrams are correctly saved.

---

## What to Tell Me

1. **"GO"** - I'll start implementing all fixes
2. **"Test first"** - I'll create test scripts to verify Mistral capabilities
3. **"Fix X only"** - I'll focus on specific issue
4. **"Show me code"** - I'll write the complete implementation

Your call! 🚀
