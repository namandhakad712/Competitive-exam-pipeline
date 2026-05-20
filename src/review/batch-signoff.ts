import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { logger } from "../utils/logger.js";
import type { Exam, ReviewProgress, VerificationStatus } from "../types.js";

const PROGRESS_FILE = join(process.cwd(), ".review-progress.json");

interface SignoffConfig {
  exam: Exam;
  year: number;
  shift: string;
  reviewer?: string;
}

interface ExamMetadata {
  exam: Exam;
  sourceUrls: Record<string, string>;
  verificationStatus: Record<string, VerificationStatus>;
  scrapedAt: string;
  lastUpdated: string;
}

function loadProgress(): ReviewProgress | null {
  try {
    if (!existsSync(PROGRESS_FILE)) return null;
    const raw = require("fs").readFileSync(PROGRESS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function signoffShift(config: SignoffConfig): Promise<boolean> {
  const { exam, year, shift, reviewer } = config;

  const progress = loadProgress();
  if (!progress) {
    logger.error("No review progress found. Run review first.");
    return false;
  }

  if (progress.exam !== exam || progress.shift !== shift) {
    logger.error(`Progress mismatch: expected ${exam}/${shift}, found ${progress.exam}/${progress.shift}`);
    return false;
  }

  const totalReviewed = progress.status.accepted.length + progress.status.edited.length;
  const totalQuestions = totalReviewed + progress.status.skipped.length;

  if (progress.status.skipped.length > 0) {
    logger.warn(`${progress.status.skipped.length} question(s) still skipped. Signoff marks them as needs-review.`);
  }

  if (totalReviewed === 0) {
    logger.error("No questions accepted or edited. Cannot signoff.");
    return false;
  }

  const DATA_DIR = join(process.cwd(), "data");
  const metadataPath = join(DATA_DIR, exam, "metadata.json");

  let metadata: ExamMetadata;
  try {
    const existing = await readFile(metadataPath, "utf8");
    metadata = JSON.parse(existing);
  } catch {
    metadata = {
      exam,
      sourceUrls: {},
      verificationStatus: {},
      scrapedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }

  const shiftKey = `${year}-${shift}`;

  if (progress.status.skipped.length > 0) {
    metadata.verificationStatus[shiftKey] = "needs-review";
  } else {
    metadata.verificationStatus[shiftKey] = "verified";
  }

  if (reviewer) {
    const reviewMetaPath = join(DATA_DIR, exam, String(year), shift, ".review-meta.json");
    await mkdir(dirname(reviewMetaPath), { recursive: true });
    await writeFile(
      reviewMetaPath,
      JSON.stringify({
        reviewer,
        signedOffAt: new Date().toISOString(),
        acceptedCount: progress.status.accepted.length,
        editedCount: progress.status.edited.length,
        skippedCount: progress.status.skipped.length,
        flaggedCount: progress.status.flagged.length,
      }, null, 2),
      "utf8",
    );
  }

  metadata.lastUpdated = new Date().toISOString();
  await mkdir(dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  const status = metadata.verificationStatus[shiftKey];
  logger.info(`Signoff complete: ${exam}/${year}/${shift} -> ${status}`);
  logger.info(`Accepted: ${progress.status.accepted.length}, Edited: ${progress.status.edited.length}, Skipped: ${progress.status.skipped.length}`);

  return true;
}
