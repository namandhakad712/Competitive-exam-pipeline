import { createInterface } from "readline";
import { logger } from "../utils/logger.js";
import type { PartialQuestion, Exam, PageContent } from "../types.js";
import { extractQuestions } from "./structurer.js";

export interface ReviewResponse {
  action: "continue" | "retry" | "edit" | "abort";
  fixes?: Record<string, string>; // field → new value map for sample question
}

/**
 * Format a question for human review display.
 */
function renderQuestion(q: PartialQuestion): string {
  const lines: string[] = [];
  lines.push(`\n┌─ Q${q.number} ──────────────────────────────────────`);
  lines.push(`│ Subject: ${q.subject}`);
  lines.push(`│ Type: ${q.type}`);
  lines.push(`│ Text: ${q.text.slice(0, 120)}${q.text.length > 120 ? "..." : ""}`);

  if (q.options) {
    for (let i = 0; i < q.options.length; i++) {
      lines.push(`│   (${i + 1}) ${q.options[i].slice(0, 80)}`);
    }
  }

  lines.push(`│ Answer: ${q.answer || "(empty)"}`);
  lines.push(`└──────────────────────────────────────────────`);
  return lines.join("\n");
}

function getUserInput(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("> ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Progressive review: after each chunk, show a sample question to the user
 * and let them decide whether to continue, retry with a different provider,
 * or abort.
 */
export async function progressiveExtract(
  chunks: { pages: PageContent[]; index: number }[],
  exam: Exam,
  providerChain: string[],
): Promise<PartialQuestion[]> {
  if (!process.stdin.isTTY) {
    logger.info("Progressive review: not a TTY, skipping human review");
    return extractSequential(chunks, exam, providerChain, false);
  }

  logger.info(
    `Progressive review: ${chunks.length} chunk(s), ${providerChain.length} provider(s)`,
  );

  return extractSequential(chunks, exam, providerChain, true);
}

async function extractSequential(
  chunks: { pages: PageContent[]; index: number }[],
  exam: Exam,
  providerChain: string[],
  interactive: boolean,
): Promise<PartialQuestion[]> {
  const allQuestions: PartialQuestion[] = [];
  const seenNumbers = new Set<number>();

  for (const chunk of chunks) {
    let questions: PartialQuestion[] = [];
    let providerIndex = 0;

    while (providerIndex < providerChain.length) {
      const provider = providerChain[providerIndex];
      try {
        logger.info(
          `Progressive: chunk ${chunk.index + 1}/${chunks.length} with ${provider}`,
        );
        const result = await extractQuestions(chunk.pages, exam);
        questions = result.questions;
        break;
      } catch (err) {
        logger.warn(
          `Progressive: chunk ${chunk.index + 1}, ${provider} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        providerIndex++;
      }
    }

    if (questions.length === 0) {
      logger.error(
        `Progressive: chunk ${chunk.index + 1} failed all providers`,
      );
      if (interactive) {
        const response = await promptAction(
          chunk.index + 1,
          questions,
          providerIndex,
        );
        if (response.action === "abort") {
          logger.warn("Progressive review aborted by user");
          break;
        }
      }
      continue;
    }

    if (interactive && questions.length > 0) {
      const sample = questions[Math.min(0, questions.length - 1)];
      console.log(renderQuestion(sample));

      const response = await promptAction(
        chunk.index + 1,
        questions,
        providerIndex,
      );

      if (response.action === "abort") {
        logger.warn("Progressive review aborted by user");
        break;
      }

      if (response.action === "retry" && providerIndex < providerChain.length) {
        providerIndex++;
        continue;
      }

      if (response.action === "edit" && response.fixes) {
        questions = applyFixes(questions, response.fixes);
      }
    }

    for (const q of questions) {
      if (!seenNumbers.has(q.number)) {
        seenNumbers.add(q.number);
        allQuestions.push(q);
      }
    }
  }

  logger.info(
    `Progressive review complete: ${allQuestions.length} unique questions from ${chunks.length} chunks`,
  );

  return allQuestions;
}

async function promptAction(
  chunkIndex: number,
  questions: PartialQuestion[],
  providerIndex: number,
): Promise<ReviewResponse> {
  console.log(
    `\nChunk ${chunkIndex}: ${questions.length} questions extracted`,
  );
  console.log("[c] Continue  [r] Retry (different provider)  [a] Abort");

  while (true) {
    const input = await getUserInput();
    if (input.startsWith("c")) return { action: "continue" };
    if (input.startsWith("r")) return { action: "retry" };
    if (input.startsWith("a")) return { action: "abort" };
    console.log("Invalid choice. Enter c, r, or a:");
  }
}

/**
 * Apply fixes from a sample question to all questions in a chunk.
 * Detects systematic errors (e.g., wrong answer format, wrong option numbering).
 */
function applyFixes(
  questions: PartialQuestion[],
  fixes: Record<string, string>,
): PartialQuestion[] {
  // Detect the type of fix needed
  const sampleFix = Object.entries(fixes);

  if (sampleFix.length === 0) return questions;

  const [field] = sampleFix[0];

  // If the user fixes the answer format, apply to all
  if (field === "answer") {
    const [_, correctValue] = sampleFix[0];
    return questions.map((q) => ({
      ...q,
      answer: correctValue,
    }));
  }

  // If the user fixes the options, check if the pattern applies to all
  if (field === "options" && questions.length > 1) {
    const firstOpts = questions[0].options;
    const fixedOpts = JSON.parse(fixes.options || "[]");

    if (firstOpts && fixedOpts.length > 0) {
      // Check if all questions have same pattern (e.g., all have 4 options)
      const allSameLength = questions.every(
        (q) => q.options?.length === firstOpts.length,
      );
      if (allSameLength) {
        return questions.map((q) => ({
          ...q,
          options: fixedOpts,
        }));
      }
    }
  }

  return questions;
}
