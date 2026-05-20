import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { Stats } from "fs";
import { logger } from "./logger.js";
import { computeChecksum } from "./hash-utils.js";
import type { IntegrityReport, IntegrityEntry } from "../types.js";

export async function verifyDatasetChecksum(filePath: string): Promise<IntegrityEntry> {
  try {
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    const expectedHash: string | null = data.checksum ?? null;

    const computedHash = computeChecksum(data);

    if (expectedHash && computedHash === expectedHash) {
      return { filePath, status: "passed", expectedHash, actualHash: computedHash };
    }
    if (!expectedHash) {
      return { filePath, status: "missing", expectedHash: null, actualHash: computedHash };
    }
    return { filePath, status: "failed", expectedHash, actualHash: computedHash };
  } catch (err) {
    return {
      filePath,
      status: "failed",
      expectedHash: null,
      actualHash: null,
    };
  }
}

export async function verifyAllDatasets(dataDir: string): Promise<IntegrityReport> {
  const report: IntegrityReport = {
    totalFiles: 0,
    passed: 0,
    failed: 0,
    missing: 0,
    results: [],
  };

  async function walk(dir: string): Promise<void> {
    const entries = await readdirSafe(dir);
    if (!entries) return;

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = await statSafe(fullPath);
      if (!stat) continue;

      if (stat.isDirectory()) {
        await walk(fullPath);
      } else if (entry.endsWith(".json") && entry !== "metadata.json") {
        const result = await verifyDatasetChecksum(fullPath);
        report.results.push(result);
        report.totalFiles++;
        if (result.status === "passed") report.passed++;
        else if (result.status === "failed") report.failed++;
        else report.missing++;
      }
    }
  }

  await walk(dataDir);

  if (report.failed > 0) {
    logger.warn(`Integrity: ${report.failed} file(s) failed checksum verification`);
    for (const r of report.results) {
      if (r.status === "failed") {
        logger.warn(`  FAILED: ${r.filePath}`);
      }
    }
  }

  logger.info(
    `Integrity: ${report.passed}/${report.totalFiles} passed, ` +
    `${report.failed} failed, ${report.missing} missing checksums`
  );

  return report;
}

async function readdirSafe(dir: string): Promise<string[] | null> {
  try {
    const { readdir } = await import("fs/promises");
    return await readdir(dir);
  } catch {
    return null;
  }
}

async function statSafe(p: string): Promise<Stats | null> {
  try {
    const { stat } = await import("fs/promises");
    return await stat(p);
  } catch {
    return null;
  }
}

export function addChecksumToFile<T extends Record<string, unknown>>(data: T): T & { checksum: string } {
  const checksum = computeChecksum(data);
  return { ...data, checksum };
}
