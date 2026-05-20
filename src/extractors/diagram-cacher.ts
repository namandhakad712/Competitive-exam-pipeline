import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { logger } from "../utils/logger.js";
import type {
  PartialQuestion,
  Diagram,
  EnhancedOcrResult,
  MistralOcrPage,
} from "../types.js";

interface CacheDiagramsInput {
  questions: PartialQuestion[];
  images: Map<number, string>;
  shiftDir: string;
  ocrResult?: EnhancedOcrResult;
}

function padNum(n: number): string {
  return String(n).padStart(3, "0");
}

function decodeBase64Image(base64: string): Buffer {
  const cleaned = base64.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(cleaned, "base64");
}

function findImageById(
  pages: MistralOcrPage[],
  imageId: string,
): { id: string; top_left_x: number; top_left_y: number; bottom_right_x: number; bottom_right_y: number; image_base64: string } | null {
  for (const page of pages) {
    const img = page.images?.find((i) => i.id === imageId);
    if (img) return img;
  }
  return null;
}

function extractImageRefs(text: string): Array<{ label: string | null; filename: string; full: string }> {
  const refs: Array<{ label: string | null; filename: string; full: string }> = [];
  const pattern = /!\[([^\]]*)\]\(([^\)]+)\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    refs.push({
      label: match[1] || null,
      filename: match[2],
      full: match[0],
    });
  }
  return refs;
}

function extractLabel(text: string, imageId: string): string | null {
  const pattern = new RegExp(
    `(Figure|Fig\\.?|Diagram|Diag\\.?)\\s*(\\d+)[^!]*!\\[[^\\]]*\\]\\(${escapeRegex(imageId)}\\)`,
    "i",
  );
  const match = text.match(pattern);
  return match ? match[0] : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCaption(text: string, imageId: string): string | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(imageId)) {
      if (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (next.length > 5 && next.length < 200) {
          return next;
        }
      }
    }
  }
  return null;
}

export async function cacheDiagrams(input: CacheDiagramsInput): Promise<void> {
  const { questions, images, shiftDir, ocrResult } = input;

  // If we have enhanced OCR result, use Mistral's pre-extracted images
  if (ocrResult?.mistralPages) {
    await cacheDiagramsFromMistral(questions, ocrResult.mistralPages, shiftDir);
    return;
  }

  // Fallback: use old page-image approach
  await cacheDiagramsLegacy(questions, images, shiftDir);
}

async function cacheDiagramsFromMistral(
  questions: PartialQuestion[],
  mistralPages: MistralOcrPage[],
  shiftDir: string,
): Promise<void> {
  let totalSaved = 0;

  for (const q of questions) {
    if (!q.hasDiagram || !q.number) continue;

    const imageRefs = extractImageRefs(q.text);
    if (imageRefs.length === 0) continue;

    const subjectDir = q.subject ?? "unknown";
    const diagDir = join(shiftDir, "diagrams", subjectDir);
    await mkdir(diagDir, { recursive: true });

    const diagramList: Diagram[] = [];

    for (const ref of imageRefs) {
      const image = findImageById(mistralPages, ref.filename);
      if (!image) {
        logger.warn(
          `Diagram: image ${ref.filename} not found in OCR result for Q${q.number}`,
        );
        continue;
      }

      const filename = `q${padNum(q.number)}-${ref.filename}`;
      const filepath = join(diagDir, filename);
      await mkdir(dirname(filepath), { recursive: true });

      try {
        const buffer = decodeBase64Image(image.image_base64);
        await writeFile(filepath, buffer);
        diagramList.push({
          file: `diagrams/${subjectDir}/${filename}`,
          label: extractLabel(q.text, ref.filename) || ref.label || null,
          caption: extractCaption(q.text, ref.filename),
        });
        totalSaved++;
      } catch (err) {
        logger.warn(
          `Diagram: failed to write ${filename}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (diagramList.length > 0) {
      q.diagrams = diagramList;
    }
  }

  logger.info(
    `Diagram cache (Mistral): ${totalSaved} diagram(s) saved for ${questions.filter((q) => q.diagrams?.length).length} question(s)`,
  );
}

async function cacheDiagramsLegacy(
  questions: PartialQuestion[],
  images: Map<number, string>,
  shiftDir: string,
): Promise<void> {
  let totalSaved = 0;

  for (const q of questions) {
    if (!q.hasDiagram || !q.number) continue;

    const subjectDir = q.subject ?? "unknown";
    const diagDir = join(shiftDir, "diagrams", subjectDir);
    await mkdir(diagDir, { recursive: true });

    const diagramList: Diagram[] = [];
    let figIndex = 1;

    // Check if question text references images
    const imageRefs = extractImageRefs(q.text);
    if (imageRefs.length > 0) {
      for (const ref of imageRefs) {
        // We don't have Mistral page data, use first available image
        if (images.size > 0) {
          const pageNum = Array.from(images.keys())[0];
          const pageImageBase64 = images.get(pageNum)!;
          const fileName = `q${padNum(q.number)}-fig${figIndex}.png`;
          const filePath = join(diagDir, fileName);

          try {
            const buffer = decodeBase64Image(pageImageBase64);
            await writeFile(filePath, buffer);
            diagramList.push({
              file: `diagrams/${subjectDir}/${fileName}`,
              label: ref.label || `fig. ${figIndex}`,
              caption: null,
            });
            figIndex++;
            totalSaved++;
          } catch (err) {
            logger.warn(
              `Diagram: failed to write ${fileName}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    } else if (images.size > 0) {
      // Legacy fallback: save first page image
      const firstPage = Array.from(images.keys())[0];
      const pageImageBase64 = images.get(firstPage)!;
      const fileName = `q${padNum(q.number)}-fig${figIndex}.png`;
      const filePath = join(diagDir, fileName);

      try {
        const buffer = decodeBase64Image(pageImageBase64);
        await writeFile(filePath, buffer);
        diagramList.push({
          file: `diagrams/${subjectDir}/${fileName}`,
          label: `fig. ${figIndex}`,
          caption: null,
        });
        figIndex++;
        totalSaved++;
      } catch (err) {
        logger.warn(
          `Diagram: failed to write ${fileName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      logger.warn(
        `Diagram: question ${q.number} hasDiagram=true but no images available`,
      );
    }

    q.diagrams = diagramList.length > 0 ? diagramList : null;
  }

  const totalDiagrams = questions.reduce(
    (sum, q) => sum + (q.diagrams?.length ?? 0),
    0,
  );
  logger.info(
    `Diagram cache (legacy): ${totalDiagrams} diagram(s) saved for ${questions.filter((q) => q.hasDiagram).length} question(s)`,
  );
}
