import { readFile } from "fs/promises";
import { logger } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import type { OcrResult, PageContent } from "../types.js";

const MISTRAL_API = "https://api.mistral.ai/v1/ocr";
const API_KEY = process.env.MISTRAL_API_KEY ?? "";
const CHUNK_SIZE_BYTES = 3.5 * 1024 * 1024;

const rateLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60_000 });

interface MistralOcrPage {
  index: number;
  markdown: string;
  images: Array<{
    id: string;
    image_base64: string;
  }>;
}

interface MistralOcrResponse {
  pages: MistralOcrPage[];
  model: string;
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

function callMistralOcr(pdfBase64: string, fileName: string): Promise<MistralOcrResponse> {
  return rateLimiter.call(async () => {
    const response = await fetch(MISTRAL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          document_url: `data:application/pdf;name=${encodeURIComponent(fileName)};base64,${pdfBase64}`,
        },
        include_image_base64: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Mistral OCR API ${response.status}: ${body.slice(0, 200)}`);
    }

    return response.json() as Promise<MistralOcrResponse>;
  });
}

function splitIntoChunks(pdfBuffer: Buffer, maxChunkSize: number): Buffer[] {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < pdfBuffer.length; offset += maxChunkSize) {
    chunks.push(pdfBuffer.subarray(offset, offset + maxChunkSize));
  }
  return chunks;
}

export async function ocrPdf(filePath: string): Promise<OcrResult> {
  if (!API_KEY) {
    throw new Error("MISTRAL_API_KEY environment variable not set");
  }

  logger.info(`OCR: processing ${filePath}`);
  const pdfBuffer = await readFile(filePath);
  const fileName = filePath.split(/[/\\]/).pop() ?? "document.pdf";

  const pages: PageContent[] = [];
  const images = new Map<number, string>();
  let globalPageIndex = 0;

  const chunks = splitIntoChunks(pdfBuffer, CHUNK_SIZE_BYTES);
  logger.info(`OCR: split into ${chunks.length} chunk(s)`);

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const pdfBase64 = chunk.toString("base64");

    logger.info(`OCR: sending chunk ${ci + 1}/${chunks.length}`);
    const result = await callMistralOcr(pdfBase64, fileName);

    for (const mistralPage of result.pages) {
      const pageNum = globalPageIndex + mistralPage.index + 1;

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

    globalPageIndex += result.pages.length;
  }

  logger.info(`OCR: ${pages.length} pages extracted, ${images.size} images cached`);
  return { pages, images };
}
