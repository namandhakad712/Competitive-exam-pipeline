import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { logger } from "../utils/logger.js";
import type {
  PartialQuestion,
  Diagram,
  EnhancedOcrResult,
  MistralOcrPage,
  MistralImage,
} from "../types.js";

const NVIDIA_API = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_KEY = process.env.NVIDIA_API_KEY ?? "";

interface BboxImageEntry {
  imageId: string;
  type: string;
  description: string | null;
}

interface BboxImageEntry {
  imageId: string;
  type: string;
  description: string | null;
}

function extractOptionsFromDescription(description: string): string[] | null {
  const lines = description.split("\n").map(l => l.trim()).filter(Boolean);
  const merged = lines.join(" ");
  const optionPattern = /(?:^|[;.])\s*([A-D])[.)]\s*([^;.A]*(?:[A-Z][a-z]+[^;.A]*)*?)(?=\s*[;.]\s*[A-D][.)]\s|$)/g;
  const options: string[] = [];
  let match;
  while ((match = optionPattern.exec(merged)) !== null) {
    const opt = match[2].trim();
    if (opt.length > 1) options.push(opt);
  }
  if (options.length === 4) return options;
  const altPattern = /Option\s+([A-D])\s*[:.)]\s*([^;.]+)/gi;
  const altOptions: string[] = [];
  let altMatch;
  while ((altMatch = altPattern.exec(description)) !== null) {
    altOptions.push(altMatch[2].trim());
  }
  if (altOptions.length === 4) return altOptions;
  return null;
}

async function extractDiagramOptionsViaLLM(description: string): Promise<string[] | null> {
  if (!NVIDIA_KEY) return null;
  try {
    const response = await fetch(NVIDIA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen/qwen3-coder-480b-a35b-instruct",
        messages: [
          {
            role: "system",
            content: "Extract exactly 4 MCQ options (A, B, C, D) from the image description. Return ONLY a JSON array of 4 strings like [\"option text A\", \"option text B\", \"option text C\", \"option text D\"]. If cannot find exactly 4 options, return [].",
          },
          {
            role: "user",
            content: `Image description: ${description}\n\nExtract the 4 MCQ options:`,
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/```(?:json)?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length === 4) return parsed.map(String);
    return null;
  } catch {
    return null;
  }
}

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

  // Auto-detect diagram references in question text before caching
  autoDetectDiagrams(questions);

  // If we have enhanced OCR result, use Mistral's pre-extracted images
  if (ocrResult?.mistralPages) {
    await cacheDiagramsFromMistral(questions, ocrResult, shiftDir);
    return;
  }

  // Fallback: use old page-image approach
  await cacheDiagramsLegacy(questions, images, shiftDir);
}

function autoDetectDiagrams(questions: PartialQuestion[]): void {
  const diagramPattern = /(Figure|Fig\.?|Diagram|Graph|Circuit|shown\s+in|figure\s+\d|diagram\s+\d)/i;
  let autoDetected = 0;

  for (const q of questions) {
    if (!q.hasDiagram && q.text && diagramPattern.test(q.text)) {
      q.hasDiagram = true;
      autoDetected++;
    }
  }

  if (autoDetected > 0) {
    logger.info(`Diagram auto-detect: ${autoDetected} questions marked as having diagrams`);
  }
}

async function cacheDiagramsFromMistral(
  questions: PartialQuestion[],
  ocrResult: EnhancedOcrResult,
  shiftDir: string,
): Promise<void> {
  const mistralPages = ocrResult.mistralPages;
  let totalSaved = 0;

  // Use bbox annotation to link images to questions
  const bboxImageMap = new Map<number, BboxImageEntry[]>();
  if (ocrResult.bboxAnnotation) {
    const ba = ocrResult.bboxAnnotation as { images?: Array<{
      image_id: string;
      type: string;
      description?: string;
      relates_to_question?: number;
    }> };
    if (ba.images) {
      for (const img of ba.images) {
        if (img.relates_to_question && (img.type === "diagram" || img.type === "figure")) {
          const qNum = img.relates_to_question;
          if (!bboxImageMap.has(qNum)) {
            bboxImageMap.set(qNum, []);
          }
          bboxImageMap.get(qNum)!.push({
            imageId: img.image_id,
            type: img.type,
            description: img.description ?? null,
          });
        }
      }
    }
  }

  for (const q of questions) {
    if (!q.hasDiagram || !q.number) continue;

    const subjectDir = q.subject ?? "unknown";
    const diagDir = join(shiftDir, "diagrams", subjectDir);
    await mkdir(diagDir, { recursive: true });

    const diagramList: Diagram[] = [];

    // Try bbox annotation first (has exact image-to-question mapping)
    const bboxImages = bboxImageMap.get(q.number);
    if (bboxImages && bboxImages.length > 0) {
      for (const bi of bboxImages) {
        const image = findImageById(mistralPages, bi.imageId);
        if (!image) continue;

        const filename = `q${padNum(q.number)}-${bi.imageId}`;
        const filepath = join(diagDir, filename);

        try {
          const buffer = decodeBase64Image(image.image_base64);
          await writeFile(filepath, buffer);
          diagramList.push({
            file: `diagrams/${subjectDir}/${filename}`,
            label: bi.description || `fig. ${diagramList.length + 1}`,
            caption: bi.description || null,
          });
          totalSaved++;
        } catch (err) {
          logger.warn(
            `Diagram: failed to write ${filename}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } else {
      // Fallback: extract image refs from question text
      const imageRefs = extractImageRefs(q.text);
      if (imageRefs.length === 0) {
        logger.warn(`Diagram: Q${q.number} (${q.subject}) flagged hasDiagram but no image refs in text and no bbox mapping — not cached`);
        continue;
      }

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
    }

    if (diagramList.length > 0) {
      q.diagrams = diagramList;
    }
  }

  let optionsExtracted = 0;
  for (const q of questions) {
    if (q.hasDiagram && q.options && q.options.length === 0 && q.number) {
      const bboxImages = bboxImageMap.get(q.number);
      if (bboxImages && bboxImages.length > 0) {
        const desc = bboxImages.map(b => b.description).filter(Boolean).join(" ");
        if (desc) {
          let opts = extractOptionsFromDescription(desc);
          if (!opts) {
            opts = await extractDiagramOptionsViaLLM(desc);
          }
          if (opts && opts.length === 4) {
            q.options = opts;
            optionsExtracted++;
          }
        }
      }
    }
  }

  if (optionsExtracted > 0) {
    logger.info(`Diagram options: ${optionsExtracted} question(s) had options extracted from annotations`);
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
