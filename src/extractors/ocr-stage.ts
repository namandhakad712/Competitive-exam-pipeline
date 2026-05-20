import { readFile } from "fs/promises";
import { logger } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import type {
  OcrResult,
  EnhancedOcrResult,
  PageContent,
  MistralOcrPage,
  MistralImage,
} from "../types.js";

const MISTRAL_API = "https://api.mistral.ai/v1/ocr";

function getApiKey(): string {
  return process.env.MISTRAL_API_KEY ?? "";
}

const rateLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60_000 });

interface MistralOcrResponse {
  pages: MistralOcrPage[];
  model: string;
  document_annotation?: string;
  bbox_annotation?: string;
}

function isBilingualPage(markdown: string): boolean {
  const hindiChars = /[\u0900-\u097F]/;
  const latinChars = /[a-zA-Z]/;
  const hindiCount = (markdown.match(hindiChars) || []).length;
  const latinCount = (markdown.match(latinChars) || []).length;
  const total = hindiCount + latinCount;
  if (total === 0) return false;
  const ratio = hindiCount / total;
  return ratio > 0.1 && ratio < 0.9;
}

function callMistralOcr(
  pdfBase64: string,
  fileName: string,
  structured?: boolean,
): Promise<MistralOcrResponse> {
  return rateLimiter.call(async () => {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const body: Record<string, unknown> = {
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: `data:application/pdf;base64,${pdfBase64}`,
        },
        include_image_base64: true,
      };

      if (structured) {
        body.document_annotation_format = {
          type: "json_schema",
          json_schema: {
            name: "exam_questions",
            strict: true,
            schema: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      number: { type: "integer" },
                      text: { type: "string" },
                      options: {
                        type: "array",
                        items: { type: "string" },
                      },
                      answer: { type: "string" },
                      subject: { type: "string" },
                      diagrams: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                    required: ["number", "text"],
                  },
                },
              },
            },
          },
        };
        body.document_annotation_prompt =
          "Extract all exam questions from this PDF. For each question, extract: number, text, options (array), answer (from answer key), subject (physics/chemistry/mathematics/biology)";
        body.bbox_annotation_format = {
          type: "json_schema",
          json_schema: {
            name: "diagram_regions",
            schema: {
              type: "object",
              properties: {
                diagrams: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      image_id: { type: "string" },
                      question_number: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        };
        body.image_min_size = 100;
        body.confidence_scores_granularity = "word";
      }

      const response = await fetch(MISTRAL_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return response.json() as Promise<MistralOcrResponse>;
      }

      if (response.status === 429 && attempt < maxRetries) {
        const wait = attempt * 10_000;
        logger.warn(
          `Mistral OCR rate limited (429), retrying in ${wait / 1000}s (attempt ${attempt}/${maxRetries})`,
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `Mistral OCR API ${response.status}: ${bodyText.slice(0, 200)}`,
      );
    }

    throw new Error("Mistral OCR API rate limit exceeded after retries");
  });
}

export async function ocrPdf(filePath: string): Promise<OcrResult> {
  const key = getApiKey();
  if (!key) {
    throw new Error("MISTRAL_API_KEY environment variable not set");
  }

  logger.info(`OCR: processing ${filePath}`);
  const pdfBuffer = await readFile(filePath);
  const fileName = filePath.split(/[/\\]/).pop() ?? "document.pdf";
  const pdfBase64 = pdfBuffer.toString("base64");

  logger.info(
    `OCR: PDF size ${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB`,
  );

  const result = await callMistralOcr(pdfBase64, fileName);

  const pages: PageContent[] = [];
  const images = new Map<number, string>();

  for (const mistralPage of result.pages) {
    const pageNum = mistralPage.index + 1;
    pages.push({
      page: pageNum,
      markdown: mistralPage.markdown,
      isBilingual: isBilingualPage(mistralPage.markdown),
    });
    for (const img of mistralPage.images) {
      if (img.image_base64) {
        images.set(pageNum, img.image_base64);
      }
    }
  }

  logger.info(
    `OCR: ${pages.length} pages extracted, ${images.size} images cached`,
  );
  return { pages, images };
}

export async function enhancedOcrPdf(
  filePath: string,
): Promise<EnhancedOcrResult> {
  const key = getApiKey();
  if (!key) {
    throw new Error("MISTRAL_API_KEY environment variable not set");
  }

  logger.info(`Enhanced OCR: processing ${filePath}`);
  const pdfBuffer = await readFile(filePath);
  const fileName = filePath.split(/[/\\]/).pop() ?? "document.pdf";
  const pdfBase64 = pdfBuffer.toString("base64");

  logger.info(
    `Enhanced OCR: PDF size ${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB`,
  );

  // Call Mistral with structured annotations enabled
  const result = await callMistralOcr(pdfBase64, fileName, true);

  const pages: PageContent[] = [];
  const images = new Map<number, string>();

  for (const mistralPage of result.pages) {
    const pageNum = mistralPage.index + 1;
    pages.push({
      page: pageNum,
      markdown: mistralPage.markdown,
      isBilingual: isBilingualPage(mistralPage.markdown),
    });
    for (const img of mistralPage.images) {
      if (img.image_base64) {
        images.set(pageNum, img.image_base64);
      }
    }
  }

  // Parse structured annotation if present
  let structuredAnnotation = null;
  if (result.document_annotation) {
    try {
      structuredAnnotation = JSON.parse(result.document_annotation);
      logger.info(
        `Enhanced OCR: structured annotation parsed successfully`,
      );
    } catch {
      logger.warn(
        `Enhanced OCR: document_annotation present but not valid JSON`,
      );
    }
  }

  // Parse bbox annotation if present
  let bboxAnnotation = null;
  if (result.bbox_annotation) {
    try {
      bboxAnnotation = JSON.parse(result.bbox_annotation);
      logger.info(`Enhanced OCR: bbox annotation parsed successfully`);
    } catch {
      logger.warn(`Enhanced OCR: bbox_annotation present but not valid JSON`);
    }
  }

  logger.info(
    `Enhanced OCR: ${pages.length} pages, ${images.size} images, structured=${!!structuredAnnotation}, bbox=${!!bboxAnnotation}`,
  );

  return {
    pages,
    images,
    mistralPages: result.pages,
    structuredAnnotation,
    bboxAnnotation,
  };
}
