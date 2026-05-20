import { logger } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import type { PageContent, PartialQuestion, Exam, Passage } from "../types.js";

// ---- API endpoints ----
const NVIDIA_API = "https://integrate.api.nvidia.com/v1/chat/completions";
const CEREBRAS_API = "https://api.cerebras.ai/v1/chat/completions";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const LONGCAT_API = "https://api.longcat.ai/v1/chat/completions";
const POOLSIDE_API = "https://inference.poolside.ai/v1/chat/completions";
const VANCHIN_API = "https://vanchin.streamlake.ai/api/gateway/v1/endpoints";

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
const vanchinLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });

const MAX_PAGES_CEREBRAS = 12;

interface ExtractionResult {
  questions: PartialQuestion[];
  passages: Passage[];
  rawResponse: string;
}

// ---- Providers in priority order ----
interface Provider {
  name: string;
  key: string;
  call: (prompt: string, systemPrompt: string) => Promise<string>;
  supportsLarge: boolean;
}

// ---- System prompt ----
function buildSystemPrompt(exam: Exam): string {
  return `You are an expert exam paper parser. Your job is to extract ALL questions from the given exam paper with 100% accuracy.

Exam: ${exam}

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
   - answer: the correct answer index as a string for mcq/assertion-reason, or the numeric value for nat. If unknown, set to null
   - answers: array of correct indices for msq, null otherwise
   - answerPrecision: for NAT with range, object with {type, min, max, unit}. Null otherwise
   - marks: marks for this question (usually 4)
   - negativeMarks: negative marking (usually -1, or 0 for nat)
   - passageId: set to "passage-{n}" if this question belongs to a comprehension passage, null otherwise
   - hasDiagram: true if the question has a diagram/figure
   - difficulty: null (will be assigned by human reviewer)
   - tags: array of topic-related tags
   - source: "official-pdf"

3. Answer keys are at the END of the paper. Use them to fill in the answer field.
4. If a block of text appears before multiple questions without diagrams, it's likely a passage.
5. For assertion-reason questions: set options to null. Answer is 0-3 index.
6. For numerical (NAT) questions: set options to null, negativeMarks to 0.
7. Output a valid JSON object with two keys: "questions" (array) and "passages" (array).

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

function parseExtractionResponse(raw: string): ExtractionResult {
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

  return { questions, passages, rawResponse: raw };
}

// ===================== Provider implementations =====================

async function callNvidia(prompt: string, systemPrompt: string): Promise<string> {
  return nvidiaLimiter.call(async () => {
    const response = await fetch(NVIDIA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 32000,
      }),
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

async function callCerebras(prompt: string, systemPrompt: string): Promise<string> {
  return cerebrasLimiter.call(async () => {
    const response = await fetch(CEREBRAS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CEREBRAS_KEY}`,
      },
      body: JSON.stringify({
        model: "cerebras-llama-3.3-70b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 32000,
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

async function callLongcat(prompt: string, systemPrompt: string): Promise<string> {
  return longcatLimiter.call(async () => {
    const response = await fetch(LONGCAT_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LONGCAT_KEY}`,
      },
      body: JSON.stringify({
        model: "longcat-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 32000,
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
        max_tokens: 32000,
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
        max_tokens: 32000,
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

// ===================== Main entry point =====================

export async function extractQuestions(
  pages: PageContent[],
  exam: Exam,
): Promise<ExtractionResult> {
  const systemPrompt = buildSystemPrompt(exam);
  const userPrompt = buildUserPrompt(pages);
  const isLarge = pages.length > MAX_PAGES_CEREBRAS;

  const providers: Provider[] = [
    {
      name: "NVIDIA NIM",
      key: NVIDIA_KEY,
      call: (p, s) => callNvidia(p, s),
      supportsLarge: true,
    },
    {
      name: "Cerebras",
      key: CEREBRAS_KEY,
      call: (p, s) => callCerebras(p, s),
      supportsLarge: false,
    },
    {
      name: "Gemini",
      key: GEMINI_KEY,
      call: (p, s) => callGemini(p, s),
      supportsLarge: true,
    },
    {
      name: "LongCat",
      key: LONGCAT_KEY,
      call: (p, s) => callLongcat(p, s),
      supportsLarge: true,
    },
    {
      name: "Poolside",
      key: POOLSIDE_KEY,
      call: (p, s) => callPoolside(p, s),
      supportsLarge: true,
    },
    {
      name: "Vanchin",
      key: VANCHIN_KEY,
      call: (p, s) => callVanchin(p, s),
      supportsLarge: true,
    },
  ];

  for (const provider of providers) {
    if (!provider.key) continue;
    if (isLarge && !provider.supportsLarge) {
      logger.debug(`Skipping ${provider.name} (does not support ${pages.length} pages)`);
      continue;
    }

    logger.info(`Structure: using ${provider.name} (${pages.length} pages)`);
    try {
      const raw = await provider.call(userPrompt, systemPrompt);
      return parseExtractionResponse(raw);
    } catch (err) {
      logger.warn(`${provider.name} failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  throw new Error(
    "No AI provider succeeded. Set at least one of: NVIDIA_API_KEY (40 RPM, recommended), " +
    "CEREBRAS_API_KEY (5 RPM), GEMINI_API_KEY (5 RPM), LONGCAT_API_KEY (50M tokens), " +
    "POOLSIDE_API_KEY, VC_API_KEY (Vanchin)."
  );
}
