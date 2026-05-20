import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { logger } from "./logger.js";
import type { Exam, Subject } from "../types.js";

const ROOT = join(process.cwd(), ".checkpoints.json");

export interface CheckpointEntry {
  exam: Exam;
  year: number;
  shift: string;
  subjects: Subject[];
  sourceFile: string;
  timestamp: string;
  totalQuestions: number;
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

export async function isProcessed(exam: Exam, year: number, shift: string): Promise<CheckpointEntry | null> {
  const data = await readAll();
  return data[makeKey(exam, year, shift)] ?? null;
}

export async function markProcessed(entry: CheckpointEntry): Promise<void> {
  const data = await readAll();
  data[makeKey(entry.exam, entry.year, entry.shift)] = entry;
  await writeAll(data);
  logger.info(`Checkpoint saved: ${entry.exam}/${entry.year}/${entry.shift}`);
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

  const lines = [`Checkpoint: ${entries.length} shift(s) processed across ${Object.keys(byExam).length} exam(s):`];
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

  console.log(`\n${"EXAM".padEnd(14)} ${"YEAR".padEnd(6)} ${"SHIFT".padEnd(12)} ${"QUESTIONS".padEnd(10)} ${"SUBJECTS".padEnd(30)} DATE`);
  console.log("-".repeat(90));
  for (const e of entries) {
    const date = e.timestamp.slice(0, 10);
    console.log(
      `${e.exam.padEnd(14)} ${String(e.year).padEnd(6)} ${e.shift.padEnd(12)} ${String(e.totalQuestions).padEnd(10)} ${(e.subjects?.join(", ") || "").padEnd(30)} ${date}`
    );
  }
  console.log(`\nTotal: ${entries.length} shift(s)\n`);
}
