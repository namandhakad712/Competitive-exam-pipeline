#!/usr/bin/env node

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const MISTRAL_API = "https://api.mistral.ai/v1/ocr";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

async function main() {
  if (!MISTRAL_API_KEY) {
    console.error("Error: MISTRAL_API_KEY environment variable not set");
    process.exit(1);
  }

  // Find a test PDF
  const inputPath = process.argv[2];
  let pdfPath = inputPath;

  if (!pdfPath) {
    // Try to find any PDF in input directory
    const inputDir = join(process.cwd(), "input");
    if (existsSync(inputDir)) {
      const { readdir } = await import("fs/promises");
      const files = await readdir(inputDir);
      const pdf = files.find((f) => f.endsWith(".pdf"));
      if (pdf) {
        pdfPath = join(inputDir, pdf);
        console.log(`Using first PDF found: ${pdfPath}`);
      }
    }
  }

  if (!pdfPath || !existsSync(pdfPath)) {
    console.error("Usage: npx tsx scripts/test-mistral-structured.ts <path-to-pdf>");
    console.error("No PDF found. Provide a path or place a PDF in the input/ directory.");
    process.exit(1);
  }

  console.log(`\n=== Testing Mistral Structured OCR ===\n`);
  console.log(`PDF: ${pdfPath}`);
  console.log(`Size: ${(await readFile(pdfPath)).length / 1024 / 1024} MB\n`);

  const pdfBase64 = (await readFile(pdfPath)).toString("base64");

  console.log("Sending request to Mistral OCR API with structured annotations...");
  console.log("(This may take 10-30 seconds)\n");

  const response = await fetch(MISTRAL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: `data:application/pdf;base64,${pdfBase64}`,
      },
      document_annotation_format: {
        type: "json_object",
      },
      document_annotation_prompt:
        "Extract all questions as JSON array with fields: number, text, options, answer, subject",
      include_image_base64: true,
      pages: [0, 1, 2], // Test first 3 pages only
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`Mistral API error ${response.status}: ${body.slice(0, 500)}`);
    process.exit(1);
  }

  const data = await response.json();

  console.log("=== STRUCTURED ANNOTATION ===");
  if (data.document_annotation) {
    try {
      const parsed = JSON.parse(data.document_annotation);
      if (Array.isArray(parsed)) {
        console.log(`Questions array: ${parsed.length} items`);
        console.log(JSON.stringify(parsed.slice(0, 3), null, 2));
      } else if (parsed.questions) {
        console.log(`Questions field: ${parsed.questions.length} items`);
        console.log(JSON.stringify(parsed.questions.slice(0, 3), null, 2));
      } else {
        console.log("Raw annotation:");
        console.log(data.document_annotation.slice(0, 2000));
      }
    } catch {
      console.log("Raw annotation (not valid JSON):");
      console.log(data.document_annotation.slice(0, 2000));
    }
  } else {
    console.log("No document_annotation in response");
  }

  console.log("\n=== BBOX ANNOTATION ===");
  if (data.bbox_annotation) {
    console.log(data.bbox_annotation.slice(0, 2000));
  } else {
    console.log("No bbox_annotation in response");
  }

  console.log("\n=== IMAGES PER PAGE ===");
  for (const page of data.pages) {
    console.log(
      `Page ${page.index}: ${page.images?.length || 0} images`,
    );
    for (const img of page.images || []) {
      console.log(
        `  - ${img.id}: (${img.top_left_x}, ${img.top_left_y}) → (${img.bottom_right_x}, ${img.bottom_right_y}), base64: ${img.image_base64 ? img.image_base64.length + " chars" : "missing"}`,
      );
    }
  }

  console.log("\n=== MODEL ===");
  console.log(`Model: ${data.model || "unknown"}`);
  console.log(`Pages: ${data.pages?.length || 0}`);

  console.log("\n=== SUMMARY ===");
  console.log("Structured annotation:", data.document_annotation ? "YES ✓" : "NO ✗");
  console.log("BBOX annotation:", data.bbox_annotation ? "YES ✓" : "NO ✗");
  console.log("Images with base64:", data.pages?.some((p: any) => p.images?.some((i: any) => i.image_base64)) ? "YES ✓" : "NO ✗");

  console.log("\nDone!");
}

await main();
