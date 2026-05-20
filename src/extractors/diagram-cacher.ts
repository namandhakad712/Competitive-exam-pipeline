import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { logger } from "../utils/logger.js";
import type { PartialQuestion, Diagram, CropCoords } from "../types.js";

interface CacheDiagramsInput {
  questions: PartialQuestion[];
  images: Map<number, string>;
  outputDir: string;
  cropCoords?: Map<string, CropCoords>;
}

function padNum(n: number): string {
  return String(n).padStart(3, "0");
}

function decodeBase64Image(base64: string): Buffer {
  const cleaned = base64.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(cleaned, "base64");
}

export async function cacheDiagrams(input: CacheDiagramsInput): Promise<void> {
  const { questions, images, outputDir, cropCoords } = input;

  for (const q of questions) {
    if (!q.hasDiagram || !q.number) continue;

    const subjectDir = q.subject ?? "unknown";
    const diagDir = join(outputDir, "diagrams", subjectDir);
    await mkdir(diagDir, { recursive: true });

    const diagramList: Diagram[] = [];
    let figIndex = 1;

    const imageKey = `${q.number}`;
    const coords = cropCoords?.get(imageKey);

    if (coords && images.has(coords.page)) {
      const pageImageBase64 = images.get(coords.page)!;
      const croppedBuffer = await cropImage(pageImageBase64, coords);
      const fileName = `q${padNum(q.number)}-fig${figIndex}.png`;
      const filePath = join(diagDir, fileName);
      await writeFile(filePath, croppedBuffer);
      diagramList.push({
        file: `diagrams/${subjectDir}/${fileName}`,
        label: `fig. ${figIndex}`,
        caption: null,
      });
      figIndex++;
    } else if (images.size > 0) {
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
      } catch (err) {
        logger.warn(`Diagram: failed to write ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.warn(`Diagram: question ${q.number} hasDiagram=true but no images available`);
    }

    q.diagrams = diagramList.length > 0 ? diagramList : null;
  }

  const totalDiagrams = questions.reduce((sum, q) => sum + (q.diagrams?.length ?? 0), 0);
  logger.info(`Diagram cache: ${totalDiagrams} diagram(s) saved for ${questions.filter(q => q.hasDiagram).length} question(s)`);
}

async function cropImage(
  base64: string,
  coords: CropCoords,
): Promise<Buffer> {
  const buffer = decodeBase64Image(base64);

  const sharpPath = join(process.cwd(), "node_modules", "sharp");
  try {
    const sharpMod = await import(/* @vite-ignore */ sharpPath) as {
      default: (input: Buffer) => {
        extract: (opts: { left: number; top: number; width: number; height: number }) => {
          png: () => { toBuffer: () => Promise<Buffer> };
        };
      };
    };
    const cropped = await sharpMod.default(buffer)
      .extract({
        left: Math.round(coords.x),
        top: Math.round(coords.y),
        width: Math.round(coords.width),
        height: Math.round(coords.height),
      })
      .png()
      .toBuffer();
    return cropped;
  } catch {
    return buffer;
  }
}
