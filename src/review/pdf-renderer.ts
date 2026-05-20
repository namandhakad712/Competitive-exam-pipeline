import { readFile } from "fs/promises";
import { join } from "path";
import { logger } from "../utils/logger.js";

interface RenderedPage {
  page: number;
  lines: string[];
}

const MAX_LINES = 60;
const LINE_WIDTH = 72;

function center(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
}

function wrapLine(text: string, width: number): string[] {
  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= width) {
      lines.push(remaining);
      break;
    }

    let breakAt = remaining.lastIndexOf(" ", width);
    if (breakAt <= 0) breakAt = width;
    lines.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt + 1);
  }

  return lines;
}

export function formatOcrMarkdown(markdown: string, pageNum: number): string[] {
  const result: string[] = [];
  const divider = "\u2500".repeat(LINE_WIDTH);

  result.push(divider);
  result.push(center(`Page ${pageNum}`, LINE_WIDTH));
  result.push(divider);

  const rawLines = markdown.split("\n");
  let lineCount = 0;

  for (const rawLine of rawLines) {
    if (lineCount >= MAX_LINES) {
      result.push(center("... (truncated)", LINE_WIDTH));
      break;
    }

    const trimmed = rawLine.trimEnd();
    if (trimmed.length === 0) {
      result.push("");
      lineCount++;
      continue;
    }

    const wrapped = wrapLine(trimmed, LINE_WIDTH);
    for (const w of wrapped) {
      if (lineCount >= MAX_LINES) break;
      result.push(w);
      lineCount++;
    }
  }

  return result;
}

export async function renderPdfPages(
  markdownDir: string,
  pageNumbers: number[],
): Promise<RenderedPage[]> {
  const pages: RenderedPage[] = [];

  for (const pageNum of pageNumbers) {
    const filePath = join(markdownDir, `page-${pageNum}.md`);
    try {
      const content = await readFile(filePath, "utf8");
      const lines = formatOcrMarkdown(content, pageNum);
      pages.push({ page: pageNum, lines });
    } catch {
      logger.warn(`PDF render: page ${pageNum} markdown not found at ${filePath}`);
      pages.push({
        page: pageNum,
        lines: [`[Page ${pageNum} not available]`],
      });
    }
  }

  return pages;
}

export function formatQuestionSidebar(q: Record<string, unknown>, width: number): string[] {
  const lines: string[] = [];
  const divider = "\u2500".repeat(width);

  lines.push(divider);
  lines.push(`  ID: ${q.id ?? "(no id)"}`);
  lines.push(`  #${q.number ?? "?"}  |  ${q.subject ?? "?"}  |  ${q.type ?? "?"}  |  ${q.topic ?? "?"}`);
  lines.push(divider);

  const text = (q.text as string) ?? "";
  const wrapped = wrapLine(text, width - 4);
  for (const w of wrapped) {
    lines.push(`  ${w}`);
  }

  if (q.options && Array.isArray(q.options)) {
    const opts = q.options as string[];
    lines.push("");
    for (let i = 0; i < opts.length; i++) {
      const label = `(${i + 1})`;
      const optWrapped = wrapLine(`${label} ${opts[i]}`, width - 4);
      for (const w of optWrapped) {
        lines.push(`  ${w}`);
      }
    }
  }

  if (q.answer) {
    lines.push("");
    lines.push(`  Answer: ${q.answer}`);
  }

  if (q.passageId) {
    lines.push(`  [Passage: ${q.passageId}]`);
  }

  return lines;
}
