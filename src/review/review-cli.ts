import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { execSync } from "child_process";
import { logger } from "../utils/logger.js";
import { formatOcrMarkdown, formatQuestionSidebar } from "./pdf-renderer.js";
import type { Question, Exam, ReviewProgress } from "../types.js";

const PROGRESS_FILE = join(process.cwd(), ".review-progress.json");
const LINE_WIDTH = 72;
const CONSOLE_HEIGHT = 30;

interface ReviewConfig {
  exam: Exam;
  year: number;
  shift: string;
  paperPath: string;
  markdownDir: string;
  questions: Question[];
}

function clearScreen(): void {
  process.stdout.write("\u001B[2J\u001B[0f");
}

function drawSplitView(left: string[], right: string[]): void {
  const splitLine = " \u2502 ";
  const maxLines = Math.max(left.length, right.length);

  let output = "";
  for (let i = 0; i < CONSOLE_HEIGHT && i < maxLines; i++) {
    const l = left[i] ?? "";
    const r = right[i] ?? "";
    const lPadded = l.padEnd(LINE_WIDTH);
    output += lPadded + splitLine + r + "\n";
  }

  process.stdout.write(output);
}

function drawFooter(status: string): void {
  const bar = "\u2500".repeat(LINE_WIDTH * 2 + 3);
  process.stdout.write(`\n${bar}\n${status}\n`);
}

function getEditor(): string {
  return process.env.EDITOR || process.platform === "win32" ? "notepad" : "vim";
}

async function editQuestion(q: Question): Promise<Question> {
  const tmpFile = join(process.cwd(), `.review-edit-${q.id ?? "temp"}.json`);
  const serialized = JSON.stringify(q, null, 2);

  try {
    await writeFile(tmpFile, serialized, "utf8");
    const editor = getEditor();
    execSync(`"${editor}" "${tmpFile}"`, { stdio: "inherit" });
    const edited = await readFile(tmpFile, "utf8");
    const parsed = JSON.parse(edited) as Question;
    return parsed;
  } finally {
    try {
      const { unlink } = await import("fs/promises");
      await unlink(tmpFile);
    } catch { /* ignore */ }
  }
}

function loadProgress(): ReviewProgress | null {
  try {
    if (!existsSync(PROGRESS_FILE)) return null;
    const raw = readFileSync(PROGRESS_FILE, "utf8");
    return JSON.parse(raw) as ReviewProgress;
  } catch {
    return null;
  }
}

import { readFileSync, writeFileSync } from "fs";

function saveProgress(progress: ReviewProgress): void {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf8");
}

function buildProgress(config: ReviewConfig): ReviewProgress {
  return {
    exam: config.exam,
    year: config.year,
    shift: config.shift,
    currentQuestion: 0,
    status: { accepted: [], edited: [], skipped: [], flagged: [] },
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

export async function startReview(config: ReviewConfig): Promise<void> {
  const { questions, markdownDir } = config;

  if (questions.length === 0) {
    logger.error("No questions to review");
    return;
  }

  let progress = loadProgress();
  if (!progress || progress.exam !== config.exam || progress.shift !== config.shift) {
    progress = buildProgress(config);
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  const renderQuestion = (index: number): void => {
    clearScreen();
    const q = questions[index];

    const rightSide = formatQuestionSidebar(q as unknown as Record<string, unknown>, LINE_WIDTH);

    const leftSide: string[] = [
      `[Question ${index + 1}/${questions.length}]`,
      "",
    ];

    const leftStatus = progress.status.accepted.includes(q.number) ? "ACCEPTED" :
      progress.status.edited.includes(q.number) ? "EDITED" :
      progress.status.skipped.includes(q.number) ? "SKIPPED" : "PENDING";

    leftSide.push(`  Status: ${leftStatus}`);
    leftSide.push("");

    const flagged = progress.status.flagged.find(f => f.number === q.number);
    if (flagged) {
      leftSide.push(`  Flagged: ${flagged.note}`);
      leftSide.push("");
    }

    leftSide.push("  [PDF markdown not available in CLI view]");
    leftSide.push("  Refer to the original PDF file at:");
    leftSide.push(`  ${config.paperPath}`);

    drawSplitView(leftSide, rightSide);

    const statusBar = [
      `[a] Accept  [e] Edit  [s] Skip  [f] Flag  [j] Prev  [k] Next  [q] Quit`,
      `${progress.status.accepted.length} accepted  ${progress.status.edited.length} edited  ${progress.status.skipped.length} skipped`,
    ].join("  |  ");
    drawFooter(statusBar);
  };

  let currentIndex = progress.currentQuestion;
  renderQuestion(currentIndex);

  const handleKey = (key: string): void => {
    const q = questions[currentIndex];

    switch (key.toLowerCase()) {
      case "a":
        if (!progress.status.accepted.includes(q.number)) {
          progress.status.accepted.push(q.number);
        }
        progress.currentQuestion = currentIndex;
        progress.lastUpdated = new Date().toISOString();
        saveProgress(progress);
        if (currentIndex < questions.length - 1) {
          currentIndex++;
          renderQuestion(currentIndex);
        }
        break;

      case "e":
        editQuestion(q).then(edited => {
          questions[currentIndex] = edited;
          if (!progress.status.edited.includes(q.number)) {
            progress.status.edited.push(q.number);
          }
          progress.currentQuestion = currentIndex;
          progress.lastUpdated = new Date().toISOString();
          saveProgress(progress);
          renderQuestion(currentIndex);
        }).catch(err => {
          logger.error(`Edit failed: ${err.message}`);
          renderQuestion(currentIndex);
        });
        break;

      case "s":
        if (!progress.status.skipped.includes(q.number)) {
          progress.status.skipped.push(q.number);
        }
        progress.currentQuestion = currentIndex;
        progress.lastUpdated = new Date().toISOString();
        saveProgress(progress);
        if (currentIndex < questions.length - 1) {
          currentIndex++;
          renderQuestion(currentIndex);
        }
        break;

      case "f":
        process.stdout.write("\nFlag note: ");
        process.stdin.once("data", (note: string) => {
          const trimmed = note.toString().trim();
          if (trimmed) {
            const existing = progress.status.flagged.findIndex(f => f.number === q.number);
            if (existing >= 0) {
              progress.status.flagged[existing].note = trimmed;
            } else {
              progress.status.flagged.push({ number: q.number, note: trimmed });
            }
            saveProgress(progress);
          }
          renderQuestion(currentIndex);
        });
        break;

      case "j":
        if (currentIndex > 0) {
          currentIndex--;
          renderQuestion(currentIndex);
        }
        break;

      case "k":
        if (currentIndex < questions.length - 1) {
          currentIndex++;
          renderQuestion(currentIndex);
        }
        break;

      case "q":
        progress.currentQuestion = currentIndex;
        progress.lastUpdated = new Date().toISOString();
        saveProgress(progress);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        logger.info(`Review saved. Progress: ${progress.status.accepted.length}/${questions.length}`);
        process.exit(0);
    }
  };

  process.stdin.on("data", (data: string) => {
    const key = data.toString().trim().toLowerCase();
    if (key.length === 1) {
      handleKey(key);
    } else if (data === "\u001B[A") {
      handleKey("j"); // up arrow = prev
    } else if (data === "\u001B[B") {
      handleKey("k"); // down arrow = next
    }
  });
}
