import { logger } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import type {
  PageContent,
  PartialQuestion,
  Exam,
  Passage,
  ProviderName,
  ConsensusCandidate,
  Conflict,
  ConsensusResult,
  Confidence,
} from "../types.js";
import { splitIntoChunks, chunkToMarkdown } from "./chunker.js";
import { mergeChunks } from "./merger.js";
import type { ChunkResult } from "./merger.js";

// ---- API endpoints ----
const NVIDIA_API = "https://integrate.api.nvidia.com/v1/chat/completions";
const LONGCAT_API = "https://api.longcat.chat/openai/v1/chat/completions";
const POOLSIDE_API = "https://inference.poolside.ai/v1/chat/completions";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ---- API keys ----
const NVIDIA_KEY = process.env.NVIDIA_API_KEY ?? "";
const LONGCAT_KEY = process.env.LONGCAT_API_KEY ?? "";
const POOLSIDE_KEY = process.env.POOLSIDE_API_KEY ?? "";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";

// ---- Rate limiters ----
const nvidiaLimiter = new RateLimiter({ maxRequests: 40, windowMs: 60_000 });
const longcatLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });
const longcatChatLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });
const poolsideLimiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });
const geminiLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });

// ---- Provider ranking (higher = more reliable for extraction) ----
const PROVIDER_RANK: Record<ProviderName, number> = {
  poolside: 7,           // Unlimited + 131K context
  "longcat-lite": 6,     // 50M tokens/day + 256K context
  "nvidia-qwen": 5,      // 2,400 RPD + 262K context
  nvidia: 5,             // same as nvidia-qwen
  longcat: 4,            // legacy alias for longcat-lite
  "nvidia-mistral": 4,   // 2,400 RPD + multimodal
  "longcat-chat": 3,     // 500K tokens/day
  gemini: 2,             // 20 RPD (validation only)
  cerebras: 1,           // 2,400 RPD (fallback)
  vanchin: 0,            // 28,800 RPD (code validation)
};

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
  /\[?\s*(?:ans|answer)\s*\.?\s*:\s*\]?/i,
  /\[?\s*(?:ans|answer)\s*\.?\s*\]?\s*[:.\-]\s*\d+/i,
  /\(?\s*(?:ans|answer)\s*\.?\s*\)?\s*[:.\-]\s*\d+/i,
  /(?:\|\s*(?:q|no|question|ans|answer)\s*\|){2,}/i,
  /(?:^|\n)\s*\d{1,3}\s+[a-dA-D]\s*(?:\n|$)/m,
  /\d+\s*\(\s*[1-4]\s*\)/,
];

function hasAnswerKey(text: string): boolean {
  for (const pattern of ANSWER_KEY_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

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
   - textHi: Hindi translation if present, otherwise null
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
4. Answers can also appear inline like [Ans: 2], (Ans: 3), {Ans: 1} next to question options.
5. Answer keys may be in table format with columns for question number and answer.
6. NEVER invent or guess an answer. If you are unsure, set answer to "".
7. If a block of text appears before multiple questions without diagrams, it's likely a passage.
8. For assertion-reason questions: set options to null.
9. For numerical (NAT) questions: set options to null, negativeMarks to 0.
10. Output a valid JSON object with two keys: "questions" (array) and "passages" (array).

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

function parseExtractionResponse(
  raw: string,
  answerKeyDetected: boolean,
): { questions: PartialQuestion[]; passages: Passage[] } {
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

  const safeQuestions = answerKeyDetected
    ? questions
    : questions.map((q) => ({
        ...q,
        answer: "",
        answers: null,
        answerPrecision: null,
      }));

  const normalized = normalizeQuestions(safeQuestions);

  return { questions: normalized, passages };
}

// ===================== Provider implementations =====================

async function callNvidia(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  return nvidiaLimiter.call(async () => {
    const response = await fetch(NVIDIA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen/qwen3-coder-480b-a35b-instruct",
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
      throw new Error(`NVIDIA API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

async function callLongcat(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
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

async function callPoolside(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
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

async function callGemini(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  return geminiLimiter.call(async () => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
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
      },
    );

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

async function callLongcatChat(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  return longcatChatLimiter.call(async () => {
    const response = await fetch(LONGCAT_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LONGCAT_KEY}`,
      },
      body: JSON.stringify({
        model: "LongCat-Flash-Chat",
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
      throw new Error(`LongCat Chat API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

async function callNvidiaQwen(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  return nvidiaLimiter.call(async () => {
    const response = await fetch(NVIDIA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen/qwen3-coder-480b-a35b-instruct",
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
      throw new Error(`NVIDIA Qwen API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

async function callNvidiaMistral(
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  return nvidiaLimiter.call(async () => {
    const response = await fetch(NVIDIA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_KEY}`,
      },
      body: JSON.stringify({
        model: "mistralai/mistral-large-3-675b-instruct",
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
      throw new Error(`NVIDIA Mistral API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

// ===================== Consensus logic =====================

function majorityVote<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) {
    if (v === null || v === undefined) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  if (counts.size === 0) return values[0];

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function normalizeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return JSON.stringify(v.map(normalizeStr));
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).trim();
}

export function buildConsensus(
  candidates: ConsensusCandidate[],
): ConsensusResult {
  const maxQuestions = candidates.length > 0
    ? Math.max(
        ...candidates.flatMap((c) => c.questions.map((q) => q.number)),
        0,
      )
    : 0;
  const consensus: PartialQuestion[] = [];
  const conflicts: Conflict[] = [];
  const answerKeyFound = candidates.some((c) => c.answerKeyFound);

  for (let i = 1; i <= maxQuestions; i++) {
    const relevant = candidates
      .map((c) => ({
        provider: c.provider,
        question: c.questions.find((q) => q.number === i),
        answerKeyFound: c.answerKeyFound,
      }))
      .filter((c) => c.question !== undefined);

    if (relevant.length === 0) {
      conflicts.push({ questionNumber: i, reason: "missing_from_all" });
      continue;
    }

    const textValues = relevant.map((c) => c.question!.text);
    const textVote = majorityVote(textValues);

    const optionsValues = relevant.map((c) =>
      c.question!.options ? JSON.stringify(c.question!.options) : null,
    );
    const optionsVote = optionsValues.some((v) => v !== null)
      ? majorityVote(optionsValues.filter((v) => v !== null))
      : null;

    const answerValues = relevant
      .filter((c) => c.question!.answer && c.question!.answer !== "")
      .map((c) => c.question!.answer);
    const answerVote =
      answerValues.length > 0 ? majorityVote(answerValues) : "";

    const subjectValues = relevant.map((c) => c.question!.subject);
    const subjectVote = majorityVote(subjectValues);

    // Pick the best candidate for remaining fields
    const bestCandidate = relevant.sort(
      (a, b) =>
        PROVIDER_RANK[b.provider] - PROVIDER_RANK[a.provider],
    )[0].question!;

    const totalProviders = relevant.length;

    // Compute agreement levels
    const textAgreement =
      textValues.filter((t) => normalizeStr(t) === normalizeStr(textVote))
        .length;
    const answerAgreement =
      answerValues.length > 0
        ? answerValues.filter(
            (a) => normalizeStr(a) === normalizeStr(answerVote),
          ).length
        : 0;

    // Assign confidence based on agreement ratio
    let confidence: Confidence = "low";
    const textAgreeRatio = textAgreement / totalProviders;
    const answerAgreeRatio =
      answerValues.length > 0
        ? answerAgreement / answerValues.length
        : 1;
    const avgAgreement = answerValues.length > 0
      ? (textAgreeRatio + answerAgreeRatio) / 2
      : textAgreeRatio;

    if (avgAgreement >= 0.8 && totalProviders >= 2) {
      confidence = "high";
    } else if (avgAgreement >= 0.5) {
      confidence = "medium";
    }

    const consensusQ: PartialQuestion = {
      ...bestCandidate,
      text: textVote,
      options: optionsVote ? JSON.parse(optionsVote) : bestCandidate.options,
      answer: answerVote || bestCandidate.answer || "",
      subject: subjectVote as PartialQuestion["subject"],
      confidence,
    };

    // Flag low-agreement conflicts
    if (
      (textAgreement < 2 && totalProviders > 2) ||
      (answerAgreement < 2 && answerValues.length > 2)
    ) {
      conflicts.push({
        questionNumber: i,
        reason: "low_agreement",
        candidates: relevant.map((c) => c.question!),
        consensus: consensusQ,
      });
    }

    consensus.push(consensusQ);
  }

  // Merge passages
  const seenPassages = new Set<string>();
  const passages: Passage[] = [];
  for (const c of candidates) {
    for (const p of c.passages) {
      if (!seenPassages.has(p.id)) {
        seenPassages.add(p.id);
        passages.push(p);
      }
    }
  }

  return {
    questions: consensus,
    passages,
    conflicts,
    answerKeyFound,
    providerResults: candidates,
  };
}

// ===================== Main entry point =====================

export async function extractWithConsensus(
  pages: PageContent[],
  exam: Exam,
  providerNames: ProviderName[] = ["poolside", "longcat-lite", "nvidia-qwen"],
): Promise<ConsensusResult> {
  const userPrompt = buildUserPrompt(pages);
  const answerKeyDetected = hasAnswerKey(userPrompt);
  const systemPrompt = buildSystemPrompt(exam, answerKeyDetected);

  logger.info(
    `Consensus extract: using ${providerNames.length} providers (${providerNames.join(", ")})`,
  );

  // Build provider call map
  const providerCalls: Record<
    ProviderName,
    (p: string, s: string) => Promise<string>
  > = {
    nvidia: callNvidia,
    longcat: callLongcat,
    poolside: callPoolside,
    gemini: callGemini,
    vanchin: callNvidia, // fallback
    cerebras: callNvidia, // fallback
    "longcat-lite": callLongcat,
    "longcat-chat": callLongcatChat,
    "nvidia-qwen": callNvidiaQwen,
    "nvidia-mistral": callNvidiaMistral,
  };

  const providerKeys: Record<ProviderName, string> = {
    nvidia: NVIDIA_KEY,
    longcat: LONGCAT_KEY,
    poolside: POOLSIDE_KEY,
    gemini: GEMINI_KEY,
    vanchin: process.env.VC_API_KEY ?? "",
    cerebras: process.env.CEREBRAS_API_KEY ?? "",
    "longcat-lite": LONGCAT_KEY,
    "longcat-chat": LONGCAT_KEY,
    "nvidia-qwen": NVIDIA_KEY,
    "nvidia-mistral": NVIDIA_KEY,
  };

  // Run providers in parallel
  const results = await Promise.allSettled(
    providerNames
      .filter((name) => providerKeys[name])
      .map(async (name) => {
        try {
          logger.info(`Consensus: calling ${name}`);
          const raw = await providerCalls[name](userPrompt, systemPrompt);
          const parsed = parseExtractionResponse(raw, answerKeyDetected);
          logger.info(
            `Consensus: ${name} → ${parsed.questions.length} questions`,
          );
          return {
            provider: name,
            questions: parsed.questions,
            passages: parsed.passages,
            answerKeyFound: answerKeyDetected,
          } as ConsensusCandidate;
        } catch (err) {
          logger.warn(
            `Consensus: ${name} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          throw err;
        }
      }),
  );

  const successfulResults: ConsensusCandidate[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      successfulResults.push(result.value);
    }
  }

  if (successfulResults.length === 0) {
    throw new Error(
      "Consensus extraction: all providers failed. Check API keys.",
    );
  }

  if (successfulResults.length === 1) {
    logger.warn(
      `Consensus: only 1 provider succeeded (${successfulResults[0].provider}). Using single result.`,
    );
    return {
      questions: successfulResults[0].questions,
      passages: successfulResults[0].passages,
      conflicts: [],
      answerKeyFound: successfulResults[0].answerKeyFound,
      providerResults: successfulResults,
    };
  }

  logger.info(
    `Consensus: ${successfulResults.length}/${providerNames.length} providers succeeded. Building consensus...`,
  );

  const result = buildConsensus(successfulResults);

  if (result.conflicts.length > 0) {
    logger.warn(
      `Consensus: ${result.conflicts.length} conflict(s) detected (${result.conflicts.filter((c) => c.reason === "low_agreement").length} low agreement, ${result.conflicts.filter((c) => c.reason === "missing_from_all").length} missing)`,
    );
  }

  logger.info(
    `Consensus complete: ${result.questions.length} questions, ${result.conflicts.length} conflicts`,
  );

  return result;
}

// ===================== Answer key page detection =====================

async function detectAnswerKeyPages(pages: PageContent[], skipConfirmation = false): Promise<PageContent[]> {
  const answerKeyPages: PageContent[] = [];
  
  // Check last 10 pages for answer key patterns
  const lastPages = pages.slice(-Math.min(10, pages.length));
  
  for (const page of lastPages) {
    const text = page.markdown.toLowerCase();
    
    // Count answer key indicators
    let score = 0;
    
    // Strong indicators
    if (/answer\s*key/i.test(text)) score += 5;
    if (/\|\s*q\s*\|\s*ans\s*\|/i.test(text)) score += 5; // table format
    if (/question\s*no/i.test(text)) score += 3;
    
    // Count answer patterns (many answers = likely answer key)
    const answerPatterns = [
      /\d+\s*[:\-\)]\s*[1-4abcd]/gi,  // "1: 2" or "1) A"
      /\d+\s*\(\s*[1-4]\s*\)/gi,       // "1(2)" NTA style
      /\d+\s*[-–]\s*[A-Da-d]/gi,       // "1-A" format
    ];
    
    let answerCount = 0;
    for (const pattern of answerPatterns) {
      const matches = text.match(pattern);
      if (matches) answerCount += matches.length;
    }
    
    // If page has 20+ answers, likely answer key
    if (answerCount >= 20) score += 4;
    else if (answerCount >= 10) score += 2;
    
    // Threshold: score >= 5 means answer key page
    if (score >= 5) {
      answerKeyPages.push(page);
      logger.info(`Answer key detected on page ${page.page} (score: ${score}, answers: ${answerCount})`);
    }
  }
  
  // User confirmation for security
  if (answerKeyPages.length > 0 && !skipConfirmation) {
    logger.info(`\n🔍 Answer key auto-detected on ${answerKeyPages.length} page(s): [${answerKeyPages.map(p => p.page).join(', ')}]`);
    logger.info(`📄 Total pages in PDF: ${pages.length}`);
    logger.info(`❓ Does this PDF have an answer key at the end? (Y/n)`);
    
    // Check if running in non-interactive mode (CI/automated)
    if (process.env.CI === 'true' || process.env.NON_INTERACTIVE === 'true') {
      logger.info(`⚙️  Non-interactive mode: Using auto-detected answer key`);
      return answerKeyPages;
    }
    
    try {
      // Dynamic import to avoid issues if not installed
      const readlineSync = await import('readline-sync');
      const response = readlineSync.default.question('> ').trim().toLowerCase();
      
      if (response === 'n' || response === 'no') {
        logger.warn(`❌ User confirmed: NO answer key. Answers will be empty.`);
        return [];
      }
      
      logger.info(`✅ User confirmed: Answer key will be used`);
    } catch (err) {
      logger.warn(`⚠️  Interactive prompt failed: ${err instanceof Error ? err.message : String(err)}`);
      logger.info(`⚙️  Falling back to auto-detection`);
    }
  }
  
  return answerKeyPages;
}

// ===================== Distributed consensus =====================

export async function distributedConsensusExtract(
  pages: PageContent[],
  exam: Exam,
  providerNames: ProviderName[] = ["poolside", "longcat-lite", "nvidia-qwen"],
  skipAnswerKeyPrompt = false,
): Promise<ConsensusResult> {
  if (pages.length <= 12) {
    return extractWithConsensus(pages, exam, providerNames);
  }

  // STEP 1: Detect answer key pages BEFORE chunking
  const answerKeyPages = await detectAnswerKeyPages(pages, skipAnswerKeyPrompt);
  
  if (answerKeyPages.length > 0) {
    logger.info(`✅ Answer key detected: ${answerKeyPages.length} page(s) [${answerKeyPages.map(p => p.page).join(', ')}]`);
    logger.info(`📋 Strategy: Appending answer key to ALL chunks for 99% accuracy`);
  } else {
    logger.warn(`⚠️  No answer key detected in last 10 pages — answers will be empty`);
  }

  // STEP 2: Split into overlapping chunks
  const chunks = splitIntoChunks(pages, 15, 5);
  logger.info(
    `Distributed consensus: ${pages.length} pages → ${chunks.length} chunks`,
  );
  
  // STEP 3: Append answer key pages to ALL chunks
  if (answerKeyPages.length > 0) {
    for (const chunk of chunks) {
      chunk.pages.push(...answerKeyPages);
    }
    logger.info(`✅ Answer key appended to all ${chunks.length} chunks`);
  }

  const userPrompt = chunkToMarkdown(chunks[0]);
  const answerKeyDetected = hasAnswerKey(userPrompt);

  const providerKeysMap: Record<ProviderName, string> = {
    nvidia: NVIDIA_KEY,
    longcat: LONGCAT_KEY,
    poolside: POOLSIDE_KEY,
    gemini: GEMINI_KEY,
    vanchin: process.env.VC_API_KEY ?? "",
    cerebras: process.env.CEREBRAS_API_KEY ?? "",
    "longcat-lite": LONGCAT_KEY,
    "longcat-chat": LONGCAT_KEY,
    "nvidia-qwen": NVIDIA_KEY,
    "nvidia-mistral": NVIDIA_KEY,
  };

  const availableProviders = providerNames.filter(
    (name) => providerKeysMap[name],
  );

  if (availableProviders.length === 0) {
    throw new Error("No providers configured for consensus extraction");
  }

  // Process each chunk with round-robin providers
  const chunkPromises = chunks.map(async (chunk) => {
    const chunkPrompt = chunkToMarkdown(chunk);
    const chunkAnswerKey = hasAnswerKey(chunkPrompt);
    const sysPrompt = buildSystemPrompt(exam, chunkAnswerKey);

    // Try each provider for this chunk
    for (const providerName of availableProviders) {
      try {
        const providerCallsMap: Record<
          ProviderName,
          (p: string, s: string) => Promise<string>
        > = {
          nvidia: callNvidia,
          longcat: callLongcat,
          poolside: callPoolside,
          gemini: callGemini,
          vanchin: callNvidia,
          cerebras: callNvidia,
          "longcat-lite": callLongcat,
          "longcat-chat": callLongcatChat,
          "nvidia-qwen": callNvidiaQwen,
          "nvidia-mistral": callNvidiaMistral,
        };

        const raw = await providerCallsMap[providerName](
          chunkPrompt,
          sysPrompt,
        );
        const parsed = parseExtractionResponse(raw, chunkAnswerKey);
        return {
          chunkIndex: chunk.chunkIndex,
          questions: parsed.questions,
          passages: parsed.passages,
          answerKeyFound: chunkAnswerKey,
        } as ChunkResult;
      } catch {
        continue;
      }
    }
    return null;
  });

  const chunkResults = (await Promise.allSettled(chunkPromises))
    .filter(
      (r): r is PromiseFulfilledResult<ChunkResult | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((r): r is ChunkResult => r !== null);

  if (chunkResults.length === 0) {
    throw new Error("Distributed consensus: all chunks failed");
  }

  const merged = mergeChunks(chunkResults);

  logger.info(
    `Distributed consensus: ${chunks.length} chunks → ${merged.questions.length} questions`,
  );

  return {
    questions: merged.questions,
    passages: merged.passages,
    conflicts: [],
    answerKeyFound: merged.answerKeyFound,
    providerResults: [],
  };
}

// ===================== Normalization =====================

const LETTER_TO_INDEX: Record<string, string> = {
  a: "0",
  b: "1",
  c: "2",
  d: "3",
  e: "4",
};

function normalizeQuestions(
  questions: PartialQuestion[],
): PartialQuestion[] {
  return questions.map((q) => {
    const number =
      typeof q.number === "string" ? parseInt(q.number, 10) : q.number;

    let answer = q.answer ?? "";
    if (answer && answer !== "") {
      const trimmed = answer.trim().toLowerCase();
      if (LETTER_TO_INDEX[trimmed] !== undefined) {
        answer = LETTER_TO_INDEX[trimmed];
      }
      if (
        ["1", "2", "3", "4"].includes(trimmed) &&
        q.options &&
        q.options.length === 4
      ) {
        answer = String(parseInt(trimmed, 10) - 1);
      }
    }

    let options = q.options;
    if (q.type === "assertion-reason") {
      options = null;
    }

    return { ...q, number, answer, options };
  });
}
