import { createWriteStream, existsSync } from "fs";
import { readFile, unlink } from "fs/promises";
import { get } from "https";
import { URL } from "url";
import { logger } from "./logger.js";

const PDF_MAGIC = "%PDF";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export async function downloadPdf(url: string, outputPath: string): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await downloadFile(url, outputPath);
      const isValid = await validatePdf(outputPath);
      if (isValid) {
        logger.info(`Downloaded PDF (${url}) -> ${outputPath}`);
        return;
      }
      throw new Error("Invalid PDF: missing magic bytes");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`Download attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`);
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new Error(`Failed to download ${url} after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

export async function validatePdf(filePath: string): Promise<boolean> {
  try {
    const buffer = Buffer.alloc(4);
    const fd = await import("fs/promises").then(m => m.open(filePath, "r"));
    await fd.read(buffer, 0, 4, 0);
    await fd.close();
    return buffer.toString("ascii") === PDF_MAGIC;
  } catch {
    return false;
  }
}

function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const file = createWriteStream(outputPath);

    get(
      parsedUrl,
      { headers: { "User-Agent": "question-pipeline/1.0" } },
      (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            unlink(outputPath).catch(() => {});
            resolve(downloadFile(redirectUrl, outputPath));
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          unlink(outputPath).catch(() => {});
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      }
    ).on("error", (err) => {
      file.close();
      unlink(outputPath).catch(() => {});
      reject(err);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
