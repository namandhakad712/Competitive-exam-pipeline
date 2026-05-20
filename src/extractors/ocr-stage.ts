import { readFile } from "fs/promises";
import { logger } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import type { OcrResult, PageContent } from "../types.js";

const MISTRAL_API = "https://api.mistral.ai/v1/ocr";

function getApiKey(): string {
  return process.env.MISTRAL_API_KEY ?? "";
}

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
        logger.warn(`Mistral OCR rate limited (429), retrying in ${wait / 1000}s (attempt ${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      const body = await response.text().catch(() => "");
      throw new Error(`Mistral OCR API ${response.status}: ${body.slice(0, 200)}`);
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

  logger.info(`OCR: PDF size ${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB`);

  // Send entire PDF as one request
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

  logger.info(`OCR: ${pages.length} pages extracted, ${images.size} images cached`);
  return { pages, images };
}
