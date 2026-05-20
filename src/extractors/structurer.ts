import { logger } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import type { PageContent, PartialQuestion, Exam, Passage } from "../types.js";

// ---- API endpoints ----
const NVIDIA_API = "https://integrate.api.nvidia.com/v1/chat/completions";
const CEREBRAS_API = "https://api.cerebras.ai/v1/chat/completions";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const LONGCAT_API = "https://api.longcat.chat/openai/v1/chat/completions";
const POOLSIDE_API = "https://inference.poolside.ai/v1/chat/completions";
const VANCHIN_API = "https://vanchin.streamlake.ai/api/gateway/v1/endpoints/chat/completions";

// ---- API keys ----
const NVIDIA_KEY = process.env.NVIDIA_API_KEY ?? "";
const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY ?? "";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
const LONGCAT_KEY = process.env.LONGCAT_API_KEY ?? "";
const POOLSIDE_KEY = process.env.POOLSIDE_API_KEY ?? "";
const VANCHIN_KEY = process.env.VC_API_KEY ?? "";

// ---- Rate limiters (matching real free tier caps) ----
const nvidiaLimiter = new RateLimiter({ maxRequests: 40, windowMs: 60_000 });
const cerebrasLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });
const geminiLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });
const longcatLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });
const poolsideLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });
const vanchinLimiter = new RateLimiter({ maxRequests: 20, windowMs: 60_000 });

interface ExtractionResult {
  questions: PartialQuestion[];
  passages: Passage[];
  rawResponse: string;
  answerKeyFound: boolean;
}

// ---- Providers in priority order ----
interface Provider {
  name: string;
  key: string;
  call: (prompt: string, systemPrompt: string) => Promise<string>;
  supportsLarge: boolean;
}

// ---- Answer key detection ----
const ANSWER_KEY_PATTERNS = [
  /answer\s*key/i,
  /answer\s*:/i,
  /ans\s*\.?\s*:/i,
  /correct\s*answer/i,
  /question\s*no/i,
  /q\.?\s*no/i,
  /answer\s*table/i,
  /key\s*to\s*questions/i,
  /solution\s*key/i,
];

function hasAnswerKey(text: string): boolean {
  for (const pattern of ANSWER_KEY_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function stripAllAnswers(questions: PartialQuestion[]): PartialQuestion[] {
  return questions.map(q => ({
    ...q,
    answer: "",
    answers: null,
    answerPrecision: null,
  }));
}

// ---- System prompt ----
function buildSystemPrompt(exam: Exam, answerKeyDetected: boolean): string {
  const answerKeyInstruction = answerKeyDetected
    ? "An answer key IS present at the end of this paper. Use it to fill in the answer field for every question. Match answers to question numbers carefully."
    : "CRITICAL: NO answer key was found in this paper. Set answer to empty string for ALL questions. Do NOT invent or guess any answers. Wrong answers are worse than missing answers.";

  return `You are an expert exam paper parser. Your job is to extract ALL questions from the given exam paper with 100% accuracy.

Exam: ${exam}

${answerKeyInstruction}

Rules:
1. Extract EVERY question on the paper. Do not skip any.
2. For each question, output a JSON object with these fields:
   - number: question number as it appears
   - numberLabel: sub-question label like "1(a)" or null
   - subject: one of: physics, chemistry, mathematics, biology
   - topic: the topic name (e.g., kinematics, chemical-bonding, trigonometry)
   - section: section identifier like "a", "b", "section-1" or null
   - type: one of: mcq, msq, nat, assertion-reason
   - text: full question text
   - textHi: Hindi translation if present in the PDF, otherwise null
   - options: array of option strings. null for nat and assertion-reason types
   - answer: set based on answer key (see above). If NO answer key found, ALWAYS set to empty string ""
   - answers: array of correct indices for msq, null otherwise
   - answerPrecision: for NAT with range, object with {type, min, max, unit}. Null otherwise
   - marks: marks for this question (usually 4)
   - negativeMarks: negative marking (usually -1, or 0 for nat)
   - passageId: set to "passage-{n}" if this question belongs to a comprehension passage, null otherwise
   - hasDiagram: true if the question has a diagram/figure
   - difficulty: null (will be assigned by human reviewer)
   - tags: array of topic-related tags
   - source: "official-pdf"

3. Answer keys are at the END of the paper. Read to the last page before filling answers.
4. NEVER invent or guess an answer. If you are unsure, set answer to "".
5. If a block of text appears before multiple questions without diagrams, it's likely a passage.
6. For assertion-reason questions: set options to null.
7. For numerical (NAT) questions: set options to null, negativeMarks to 0.
8. Output a valid JSON object with two keys: "questions" (array) and "passages" (array).

Respond ONLY with the JSON. No explanation, no markdown formatting.`;
}

function buildUserPrompt(pages: PageContent[]): string {
  let text = "Here is the exam paper content:\n\n";
  for (const page of pages) {
    text += `--- Page ${page.page} ---\n`;
    text += page.markdown;
    text += "\n\n";
  }
  text += "\n--- END OF PAPER ---\n";
  text += "Extract all questions as JSON now.";
  return text;
}

function parseExtractionResponse(raw: string, answerKeyDetected: boolean): ExtractionResult {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/```(?:json)?\n?/g, "").trim();
  }

  const parsed = JSON.parse(cleaned);
  const questions: PartialQuestion[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.questions)
      ? parsed.questions
      : [];

  const passages: Passage[] = Array.isArray(parsed.passages)
    ? parsed.passages
    : [];

  const safeQuestions = answerKeyDetected ? questions : stripAllAnswers(questions);

  if (!answerKeyDetected && questions.length > 0) {
    const hadAnswers = questions.some(q => q.answer && q.answer !== "");
    if (hadAnswers) {
      logger.warn(`Answer key NOT found in PDF. Stripped ${questions.filter(q => q.answer && q.answer !== "").length} hallucinated answers.`);
    }
  }

  return { questions: safeQuestions, passages, rawResponse: raw, answerKeyFound: answerKeyDetected };
}

// ===================== Provider implementations =====================
// Ordered by priority: speed + output capacity + rate limits

async function callNvidia(prompt: string, systemPrompt: string): Promise<string> {
  return nvidiaLimiter.call(async () => {
    const response = await fetch(NVIDIA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-ai/deepseek-v4-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 64000,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`NVIDIA API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

async function callLongcat(prompt: string, systemPrompt: string): Promise<string> {
  return longcatLimiter.call(async () => {
    const response = await fetch(LONGCAT_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LONGCAT_KEY}`,
      },
      body: JSON.stringify({
        model: "LongCat-Flash-Lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 256000,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`LongCat API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

async function callPoolside(prompt: string, systemPrompt: string): Promise<string> {
  return poolsideLimiter.call(async () => {
    const response = await fetch(POOLSIDE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${POOLSIDE_KEY}`,
      },
      body: JSON.stringify({
        model: "poolside/laguna-m.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 64000,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Poolside API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

async function callVanchin(prompt: string, systemPrompt: string): Promise<string> {
  return vanchinLimiter.call(async () => {
    const response = await fetch(VANCHIN_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VANCHIN_KEY}`,
      },
      body: JSON.stringify({
        model: "ep-8jt098-1774548880917375225",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 64000,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Vanchin API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

async function callGemini(prompt: string, systemPrompt: string): Promise<string> {
  return geminiLimiter.call(async () => {
    const response = await fetch(`${GEMINI_API}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: systemPrompt + "\n\n" + prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 32000,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Gemini API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  });
}

async function callCerebras(prompt: string, systemPrompt: string): Promise<string> {
  return cerebrasLimiter.call(async () => {
    const response = await fetch(CEREBRAS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CEREBRAS_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_completion_tokens: 32000,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Cerebras API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

// ===================== Main entry point =====================

export async function extractQuestions(
  pages: PageContent[],
  exam: Exam,
): Promise<ExtractionResult> {
  const userPrompt = buildUserPrompt(pages);
  const answerKeyDetected = hasAnswerKey(userPrompt);
  const systemPrompt = buildSystemPrompt(exam, answerKeyDetected);

  if (!answerKeyDetected) {
    logger.warn("No answer key detected in PDF. All answers will be set to empty.");
  } else {
    logger.info("Answer key detected. Answers will be extracted from PDF.");
  }

  const providers: Provider[] = [
    // 1 — NVIDIA DeepSeek V4 Flash: 40 RPM, 1M context, 64K output, fastest
    {
      name: "NVIDIA DeepSeek V4 Flash",
      key: NVIDIA_KEY,
      call: (p, s) => callNvidia(p, s),
      supportsLarge: true,
    },
    // 2 — LongCat Flash Lite: 30 RPM, 256K max output, 50M free tokens/day
    // Best for massive 180-question papers needing large output
    {
      name: "LongCat Flash Lite",
      key: LONGCAT_KEY,
      call: (p, s) => callLongcat(p, s),
      supportsLarge: true,
    },
    // 3 — Poolside Laguna M.1: 30 RPM, 131K context, free preview
    {
      name: "Poolside",
      key: POOLSIDE_KEY,
      call: (p, s) => callPoolside(p, s),
      supportsLarge: true,
    },
    // 4 — Vanchin KAT-Coder: 20 RPM, 2M TPM
    {
      name: "Vanchin KAT-Coder",
      key: VANCHIN_KEY,
      call: (p, s) => callVanchin(p, s),
      supportsLarge: true,
    },
    // 5 — Gemini 2.5 Flash: 5 RPM, 250K TPM, 20 RPD — stable fallback
    {
      name: "Gemini 2.5 Flash",
      key: GEMINI_KEY,
      call: (p, s) => callGemini(p, s),
      supportsLarge: true,
    },
    // 6 — Cerebras: 5 RPM, 30K TPM — last resort, very rate-limited
    {
      name: "Cerebras",
      key: CEREBRAS_KEY,
      call: (p, s) => callCerebras(p, s),
      supportsLarge: false,
    },
  ];

  const isLarge = pages.length > 12;

  for (const provider of providers) {
    if (!provider.key) continue;
    if (isLarge && !provider.supportsLarge) {
      logger.debug(`Skipping ${provider.name} (does not support ${pages.length} pages)`);
      continue;
    }

    logger.info(`Structure: using ${provider.name} (${pages.length} pages)`);
    try {
      const raw = await provider.call(userPrompt, systemPrompt);
      return parseExtractionResponse(raw, answerKeyDetected);
    } catch (err) {
      logger.warn(`${provider.name} failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  throw new Error(
    "No AI provider succeeded. Set at least one of: NVIDIA_API_KEY (40 RPM, recommended), " +
    "LONGCAT_API_KEY (256K output, 50M tokens), POOLSIDE_API_KEY, VC_API_KEY (Vanchin), " +
    "GEMINI_API_KEY, CEREBRAS_API_KEY."
  );
}
