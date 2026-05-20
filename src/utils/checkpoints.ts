import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { logger } from "./logger.js";
import type { Exam, Subject } from "../types.js";

const ROOT = join(process.cwd(), ".checkpoints.json");
const CACHE_DIR = join(process.cwd(), "data", ".cache");

export type StageName =
  | "ocr"
  | "extract"
  | "diagrams"
  | "validate"
  | "export";

export interface StageInfo {
  status: "pending" | "completed" | "failed";
  output?: string;
  error?: string;
  timestamp?: string;
}

export interface CheckpointEntry {
  exam: Exam;
  year: number;
  shift: string;
  subjects: Subject[];
  sourceFile: string;
  timestamp: string;
  totalQuestions: number;
  stages: Record<StageName, StageInfo>;
}

interface CheckpointData {
  [key: string]: CheckpointEntry;
}

function makeKey(exam: Exam, year: number, shift: string): string {
  return `${exam}/${year}/${shift}`;
}

async function readAll(): Promise<CheckpointData> {
  if (!existsSync(ROOT)) return {};
  try {
    const raw = await readFile(ROOT, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeAll(data: CheckpointData): Promise<void> {
  await writeFile(ROOT, JSON.stringify(data, null, 2), "utf-8");
}

async function getCachePath(stage: StageName): Promise<string> {
  const dir = join(CACHE_DIR, stage);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function isProcessed(
  exam: Exam,
  year: number,
  shift: string,
): Promise<CheckpointEntry | null> {
  const data = await readAll();
  const entry = data[makeKey(exam, year, shift)];
  if (!entry) return null;

  // Backward compatibility: old entries without stages field
  if (!entry.stages) {
    entry.stages = {
      ocr: { status: "completed", timestamp: entry.timestamp },
      extract: { status: "completed", timestamp: entry.timestamp },
      diagrams: { status: "completed", timestamp: entry.timestamp },
      validate: { status: "completed", timestamp: entry.timestamp },
      export: { status: "completed", timestamp: entry.timestamp },
    };
  }

  return entry;
}

export async function markProcessed(entry: CheckpointEntry): Promise<void> {
  const data = await readAll();
  data[makeKey(entry.exam, entry.year, entry.shift)] = entry;
  await writeAll(data);
  logger.info(
    `Checkpoint saved: ${entry.exam}/${entry.year}/${entry.shift}`,
  );
}

export async function saveStageCache<T>(
  key: string,
  stage: StageName,
  data: T,
): Promise<string> {
  const cacheDir = await getCachePath(stage);
  const filename = `${key.replace(/[/\\]/g, "-")}-${stage}.json`;
  const filepath = join(cacheDir, filename);
  await writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
  return filepath;
}

export async function loadStageCache<T>(
  key: string,
  stage: StageName,
): Promise<T | null> {
  const cacheDir = await getCachePath(stage);
  const filename = `${key.replace(/[/\\]/g, "-")}-${stage}.json`;
  const filepath = join(cacheDir, filename);
  if (!existsSync(filepath)) return null;
  try {
    const raw = await readFile(filepath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getStageStatus(
  exam: Exam,
  year: number,
  shift: string,
  stage: StageName,
): Promise<StageInfo | null> {
  const entry = await isProcessed(exam, year, shift);
  if (!entry?.stages) return null;
  return entry.stages[stage] ?? null;
}

export async function updateStage(
  exam: Exam,
  year: number,
  shift: string,
  stage: StageName,
  status: StageInfo["status"],
  output?: string,
  error?: string,
): Promise<void> {
  const key = makeKey(exam, year, shift);
  const data = await readAll();
  const existing = data[key];

  if (!existing) {
    // Create new entry with just this stage
    const newEntry: CheckpointEntry = {
      exam,
      year,
      shift,
      subjects: [],
      sourceFile: "",
      timestamp: new Date().toISOString(),
      totalQuestions: 0,
      stages: {
        ocr: { status: "pending" },
        extract: { status: "pending" },
        diagrams: { status: "pending" },
        validate: { status: "pending" },
        export: { status: "pending" },
        [stage]: {
          status,
          output,
          error,
          timestamp: new Date().toISOString(),
        },
      },
    };
    data[key] = newEntry;
  } else {
    if (!existing.stages) {
      existing.stages = {
        ocr: { status: "pending" },
        extract: { status: "pending" },
        diagrams: { status: "pending" },
        validate: { status: "pending" },
        export: { status: "pending" },
      };
    }
    existing.stages[stage] = {
      status,
      output,
      error,
      timestamp: new Date().toISOString(),
    };
    existing.timestamp = new Date().toISOString();
    data[key] = existing;
  }

  await writeAll(data);
  logger.info(
    `Stage ${stage} → ${status} for ${exam}/${year}/${shift}`,
  );
}

export async function getResumePoint(
  exam: Exam,
  year: number,
  shift: string,
): Promise<{ stage: StageName; cachePath: string | null } | null> {
  const entry = await isProcessed(exam, year, shift);
  if (!entry?.stages) return null;

  const stageOrder: StageName[] = [
    "ocr",
    "extract",
    "diagrams",
    "validate",
    "export",
  ];

  for (const stage of stageOrder) {
    const info = entry.stages[stage];
    if (!info || info.status === "pending" || info.status === "failed") {
      // Resume from this stage
      // Check if previous stage has cached output
      const prevIndex = stageOrder.indexOf(stage) - 1;
      if (prevIndex >= 0) {
        const prevStage = stageOrder[prevIndex];
        const prevInfo = entry.stages[prevStage];
        if (prevInfo?.output) {
          return { stage, cachePath: prevInfo.output };
        }
      }
      return { stage, cachePath: null };
    }
  }

  // All stages completed
  return null;
}

export async function listProcessed(): Promise<CheckpointEntry[]> {
  const data = await readAll();
  return Object.values(data).sort((a, b) => {
    if (a.exam !== b.exam) return a.exam.localeCompare(b.exam);
    if (a.year !== b.year) return b.year - a.year;
    return a.shift.localeCompare(b.shift);
  });
}

export async function getSummary(): Promise<string> {
  const entries = await listProcessed();
  if (entries.length === 0) return "No shifts processed yet.";

  const byExam: Record<string, { count: number; years: Set<number> }> = {};
  for (const e of entries) {
    if (!byExam[e.exam]) byExam[e.exam] = { count: 0, years: new Set() };
    byExam[e.exam].count++;
    byExam[e.exam].years.add(e.year);
  }

  const lines = [
    `Checkpoint: ${entries.length} shift(s) processed across ${Object.keys(byExam).length} exam(s):`,
  ];
  for (const [exam, info] of Object.entries(byExam).sort()) {
    const years = [...info.years].sort((a, b) => b - a);
    lines.push(`  ${exam}: ${info.count} shift(s) (${years.join(", ")})`);
  }
  return lines.join("\n");
}

export async function main(): Promise<void> {
  await printTable();
}

export async function printTable(): Promise<void> {
  const entries = await listProcessed();
  if (entries.length === 0) {
    console.log("No shifts processed yet.");
    return;
  }

  console.log(
    `\n${"EXAM".padEnd(14)} ${"YEAR".padEnd(6)} ${"SHIFT".padEnd(12)} ${"QUESTIONS".padEnd(10)} ${"SUBJECTS".padEnd(30)} DATE`,
  );
  console.log("-".repeat(90));
  for (const e of entries) {
    const date = e.timestamp.slice(0, 10);
    console.log(
      `${e.exam.padEnd(14)} ${String(e.year).padEnd(6)} ${e.shift.padEnd(12)} ${String(e.totalQuestions).padEnd(10)} ${(e.subjects?.join(", ") || "").padEnd(30)} ${date}`,
    );
  }
  console.log(`\nTotal: ${entries.length} shift(s)\n`);
}
