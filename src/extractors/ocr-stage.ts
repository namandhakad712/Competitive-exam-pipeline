import { readFile } from "fs/promises";
import { logger } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import type {
  OcrResult,
  EnhancedOcrResult,
  PageContent,
  MistralOcrPage,
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
): Promise<MistralOcrResponse> {
  return rateLimiter.call(async () => {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await fetch(MISTRAL_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: "mistral-ocr-latest",
          document: {
            type: "document_url",
            document_url: `data:application/pdf;base64,${pdfBase64}`,
          },
          include_image_base64: true,
        }),
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

function callMistralOcrWithAnnotations(
  pdfBase64: string,
  fileName: string,
): Promise<MistralOcrResponse> {
  return rateLimiter.call(async () => {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min timeout

        const response = await fetch(MISTRAL_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getApiKey()}`,
          },
          body: JSON.stringify({
            model: "mistral-ocr-latest",
            document: {
              type: "document_url",
              document_url: `data:application/pdf;base64,${pdfBase64}`,
            },
            include_image_base64: true,

            // Document annotation: extract questions as structured JSON
            document_annotation_format: {
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
                          subject: {
                            type: "string",
                            enum: [
                              "physics",
                              "chemistry",
                              "mathematics",
                              "biology",
                            ],
                          },
                          has_diagram: { type: "boolean" },
                          diagram_image_ids: {
                            type: "array",
                            items: { type: "string" },
                          },
                        },
                        required: ["number", "text"],
                      },
                    },
                    answer_key_found: { type: "boolean" },
                    answer_key_section: { type: "string" },
                  },
                  required: ["questions"],
                },
              },
            },
            document_annotation_prompt:
              "Extract all exam questions from this PDF. For each question extract the number, full text, options array, correct answer from any answer key present, and subject. If an answer key table or list is present, also set answer_key_found=true and include the answer_key_section text. Questions may have inline answer markers like [Ans: 2] or (Ans: 3) next to options.",

            // BBox annotation: describe each extracted image (diagrams, figures, tables)
            bbox_annotation_format: {
              type: "json_schema",
              json_schema: {
                name: "image_descriptions",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    images: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          image_id: { type: "string" },
                          type: {
                            type: "string",
                            enum: [
                              "diagram",
                              "figure",
                              "table",
                              "answer_key",
                              "icon",
                              "other",
                            ],
                          },
                          description: { type: "string" },
                          relates_to_question: { type: "integer" },
                          contains_answer_key: { type: "boolean" },
                        },
                        required: ["image_id", "type"],
                      },
                    },
                  },
                  required: ["images"],
                },
              },
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          return response.json() as Promise<MistralOcrResponse>;
        }

        if (response.status === 429 && attempt < maxRetries) {
          const wait = attempt * 10_000;
          logger.warn(
            `Mistral OCR annotations rate limited (429), retrying in ${wait / 1000}s (attempt ${attempt}/${maxRetries})`,
          );
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }

        const bodyText = await response.text().catch(() => "");
        throw new Error(
          `Mistral OCR API ${response.status}: ${bodyText.slice(0, 200)}`,
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          logger.warn(
            `Mistral OCR annotations timeout (attempt ${attempt}/${maxRetries})`,
          );
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          throw new Error("Mistral OCR API timeout after retries");
        }
        throw err;
      }
    }

    throw new Error("Mistral OCR API failed after retries");
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

  // Try enhanced OCR with annotations, fallback to standard if it fails
  let result: MistralOcrResponse;
  try {
    logger.info(`Enhanced OCR: attempting with structured annotations...`);
    result = await callMistralOcrWithAnnotations(pdfBase64, fileName);
  } catch (err) {
    logger.warn(
      `Enhanced OCR with annotations failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    logger.info(`Enhanced OCR: falling back to standard OCR...`);
    result = await callMistralOcr(pdfBase64, fileName);
  }

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

  // Parse document_annotation (structured questions)
  let structuredAnnotation: unknown = null;
  if (result.document_annotation) {
    try {
      structuredAnnotation = JSON.parse(result.document_annotation);
      logger.info(`Enhanced OCR: document annotation parsed successfully`);
    } catch (err) {
      logger.warn(
        `Enhanced OCR: document_annotation present but not valid JSON: ${result.document_annotation.slice(0, 200)}`,
      );
    }
  }

  // Parse bbox_annotation (diagram/image descriptions)
  let bboxAnnotation: unknown = null;
  if (result.bbox_annotation) {
    try {
      bboxAnnotation = JSON.parse(result.bbox_annotation);
      logger.info(`Enhanced OCR: bbox annotation parsed successfully`);
    } catch (err) {
      logger.warn(
        `Enhanced OCR: bbox_annotation present but not valid JSON: ${result.bbox_annotation.slice(0, 200)}`,
      );
    }
  }

  // Check if Mistral detected an answer key via document_annotation
  let answerKeyFoundFromAnnotation = false;
  if (structuredAnnotation) {
    const sa = structuredAnnotation as Record<string, unknown>;
    if (sa.answer_key_found === true) {
      answerKeyFoundFromAnnotation = true;
      logger.info(
        `Enhanced OCR: Mistral detected answer key in document annotation`,
      );
    }
  }

  // Check if Mistral detected answer key via bbox_annotation
  let answerKeyFoundFromBbox = false;
  if (bboxAnnotation) {
    const ba = bboxAnnotation as Record<string, unknown>;
    const images = ba.images as Array<Record<string, unknown>> | undefined;
    if (images) {
      const hasAnswerKey = images.some(
        (img) => img.contains_answer_key === true || img.type === "answer_key",
      );
      if (hasAnswerKey) {
        answerKeyFoundFromBbox = true;
        logger.info(
          `Enhanced OCR: Mistral detected answer key in bbox annotation`,
        );
      }
    }
  }

  logger.info(
    `Enhanced OCR: ${pages.length} pages, ${images.size} images, ` +
      `doc_annotation=${!!structuredAnnotation}, bbox_annotation=${!!bboxAnnotation}, ` +
      `answer_key_from_doc=${answerKeyFoundFromAnnotation}, answer_key_from_bbox=${answerKeyFoundFromBbox}`,
  );

  return {
    pages,
    images,
    mistralPages: result.pages,
    structuredAnnotation,
    bboxAnnotation,
    answerKeyFoundFromAnnotation,
    answerKeyFoundFromBbox,
  };
}
