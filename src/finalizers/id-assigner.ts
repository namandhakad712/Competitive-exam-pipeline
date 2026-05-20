import type { Exam, Subject } from "../types.js";
import { subjectCodes } from "../vocabulary.js";

const TOMBSTONE = new Set<string>();

function shortenShift(shift: string): string {
  if (shift.length <= 15) return shift;
  const hash = shift.split("").reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
  const short = Math.abs(hash).toString(36).substring(0, 8);
  return short;
}

function extractFromPath(shift: string): string {
  const lower = shift.toLowerCase().trim();

  if (lower.includes("shift1") || lower.includes("-s1") || lower.endsWith("s1")) {
    const date = lower.replace(/shift1|-s1|s1/g, "").replace(/-+/g, "").trim();
    return `${date}-s1`;
  }
  if (lower.includes("shift2") || lower.includes("-s2") || lower.endsWith("s2")) {
    const date = lower.replace(/shift2|-s2|s2/g, "").replace(/-+/g, "").trim();
    return `${date}-s2`;
  }
  if (lower.includes("paper1") || lower.includes("-p1")) return "p1";
  if (lower.includes("paper2") || lower.includes("-p2")) return "p2";

  const numericShift = lower.match(/(\d+)/);
  if (numericShift) return `s${numericShift[1]}`;

  return shortenShift(lower);
}

function getSubjectCode(subject: Subject): string {
  return subjectCodes[subject] ?? "xx";
}

export function generateId(
  exam: Exam,
  year: number | null,
  shift: string | null,
  subject: Subject,
  number: number,
): string {
  const shiftShort = shift ? extractFromPath(shift) : "na";
  const yearStr = year ?? 0;
  const subCode = getSubjectCode(subject);
  const numPad = String(number).padStart(3, "0");
  return `${exam}-${yearStr}-${shiftShort}-${subCode}-${numPad}`;
}

export function assignIds(
  questions: Array<{ subject: Subject; number: number }>,
  exam: Exam,
  year: number | null,
  shift: string | null,
): string[] {
  const ids: string[] = [];

  for (const q of questions) {
    let id = generateId(exam, year, shift, q.subject, q.number);

    if (TOMBSTONE.has(id)) {
      let counter = 1;
      while (TOMBSTONE.has(`${id}-r${counter}`)) {
        counter++;
      }
      id = `${id}-r${counter}`;
    }

    ids.push(id);
  }

  return ids;
}

export function tombstoneId(id: string): void {
  TOMBSTONE.add(id);
}

export function isTombstoned(id: string): boolean {
  return TOMBSTONE.has(id);
}
