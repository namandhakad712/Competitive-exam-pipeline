#!/usr/bin/env node

import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join, basename, dirname } from "path";
import { spawn } from "child_process";
import readlineSync from "readline-sync";
import { fileURLToPath } from "url";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";
const CLEAR = "\x1b[2J\x1b[H";
const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";

function s(text: string, ...codes: string[]): string {
  return codes.join("") + text + RESET;
}

type Exam = "neet" | "jeemain" | "jeeadv" | "ncert-exemplar";

function banner(title?: string): void {
  console.log(CLEAR);
  const label = title ?? "QUESTION PIPELINE \u2014 INTERACTIVE LAUNCHER";
  console.log(s(`  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`, CYAN, BOLD));
  console.log(s(`  \u2551${" ".repeat(68)}\u2551`, CYAN));
  const padL = Math.floor((68 - label.length) / 2);
  const padR = 68 - label.length - padL;
  console.log(s(`  \u2551${" ".repeat(padL)}${s(label, WHITE, BOLD)}${" ".repeat(padR)}\u2551`, CYAN));
  console.log(s(`  \u2551${" ".repeat(68)}\u2551`, CYAN));
  console.log(s(`  \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d`, CYAN));
  console.log();
}

function divider(label?: string): void {
  const w = 70;
  if (label) {
    const side = Math.floor((w - label.length - 2) / 2);
    const line = ` \u2500`.repeat(side) + ` ${label} ` + `\u2500`.repeat(side);
    const extra = w - line.length + 1;
    const full = extra > 0 ? line + `\u2500`.repeat(extra) : line;
    console.log(s(full, DIM));
  } else {
    console.log(s(`\u2500`.repeat(w), DIM));
  }
}

function dot(ok: boolean): string {
  return ok ? s(" \u25CF", GREEN) : s(" \u25CB", DIM);
}

/* ─── HELP MENU ──────────────────────────────────────────── */

function showHelp(): void {
  banner("HELP & COMMANDS");
  divider(s("ABOUT", CYAN, BOLD));
  console.log();
  console.log(`  ${s("Question Pipeline", WHITE, BOLD)} v1.0 \u2014 Batch Indian exam PDF \u2192 structured JSON`);
  console.log(`  ${s("Zero runtime dependencies", GREEN)} | TypeScript strict | 59 unit tests`);
  console.log(`  OCR: Mistral AI + MinerU  |  AI extraction: 7 providers  |  32 validations`);
  console.log(`  GitHub: ${s("https://github.com/anomalyco/question-pipeline", CYAN, DIM)}`);
  console.log();

  divider(s("CLI COMMANDS", CYAN, BOLD));
  console.log();
  const cmds: Array<[string, string]> = [
    ["npm run process-pdf", "Process a single PDF (flags: --input, --ocr, --force, etc.)"],
    ["npm run interactive", "Launch this interactive TUI wizard"],
    ["npm run batch", "Full pipeline: scrape \u2192 OCR \u2192 extract \u2192 validate \u2192 save"],
    ["npm run test", "Run all 59 unit tests"],
    ["npm run test-models", "Health check for configured AI providers"],
    ["npm run review", "Interactive human review with vim-like keys"],
    ["npm run signoff", "Mark a shift as verified"],
    ["npm run status", "Show checkpoint table of all processed shifts"],
    ["npm run stats", "Print dataset statistics"],
    ["npm run api", "Start HTTP API server on port 3456"],
    ["npm run verify", "Verify all dataset integrity checksums"],
    ["npm run rebuild-index", "Regenerate data/index.json from disk"],
  ];
  const maxCmd = Math.max(...cmds.map((c) => c[0].length));
  for (const [cmd, desc] of cmds) {
    console.log(`  ${s(cmd.padEnd(maxCmd), BOLD)}  ${s(desc, DIM)}`);
  }
  console.log();

  divider(s("OCR ENGINES", CYAN, BOLD));
  console.log();
  console.log(`  ${s("Mistral OCR", BOLD)}    ${s("Default. Requires MISTRAL_API_KEY. Good for clean PDFs.")}`);
  console.log(`                    ${s("Features: structured annotations, bilingual detection.", DIM)}`);
  console.log(`  ${s("MinerU OCR", CYAN, BOLD)}     ${s("Precision API (needs MINERU_API_KEY) or Agent API fallback.")}`);
  console.log(`                    ${s("Features: LaTeX formulas, HTML tables, image extraction.", DIM)}`);
  console.log(`                    ${s("Best for: NEET, scanned docs, formula-heavy papers.", DIM)}`);
  console.log();

  divider(s("ENVIRONMENT VARIABLES", CYAN, BOLD));
  console.log();
  const envs: Array<[string, string, string]> = [
    ["MISTRAL_API_KEY", "Required*", "Mistral AI OCR and embeddings"],
    ["MINERU_API_KEY", "Optional", "MinerU Precision API token"],
    ["NVIDIA_API_KEY", "Recommended", "NVIDIA NIM (Qwen3 Coder 480B)"],
    ["ZAI_API_KEY", "Free", "Z.AI GLM-4.7-Flash, 128K output"],
    ["LONGCAT_API_KEY", "Free", "LongCat Flash Lite, 50M tokens/day"],
    ["POOLSIDE_API_KEY", "Free", "Poolside Laguna M.1, unlimited"],
    ["GEMINI_API_KEY", "500 RPD", "Gemini 3.1 Flash Lite"],
    ["CEREBRAS_API_KEY", "Fallback", "Cerebras GPT-OSS-120B"],
    ["VC_API_KEY", "Optional", "Vanchin KAT-Coder-Air-V1"],
    ["CI/NON_INTERACTIVE", "Flag", "Skip all prompts (non-interactive)"],
  ];
  const maxEnv = Math.max(...envs.map((e) => e[0].length));
  const maxNote = Math.max(...envs.map((e) => e[1].length));
  for (const [env, note, desc] of envs) {
    const noteS = note === "Required*" ? s(note, RED, BOLD) : note === "Recommended" ? s(note, YELLOW) : s(note, DIM);
    console.log(`  ${s(env.padEnd(maxEnv), BOLD)}  ${noteS.padEnd(maxNote + 4)} ${s(desc, DIM)}`);
  }
  console.log();
  console.log(`  ${s("* Either MISTRAL_API_KEY or MINERU_API_KEY must be set for OCR.", DIM)}`);
  console.log();

  divider(s("PDF TYPE DETECTION", CYAN, BOLD));
  console.log();
  console.log(`  ${s("Question Paper", GREEN)}  Standard exam PDF with questions and options`);
  console.log(`  ${s("Answer Key", YELLOW)}     Separate PDF with answer key / solutions (filename contains "answer"|"key"|"sol")`);
  console.log(`  ${s("Combined", MAGENTA)}       Single PDF containing both questions and answer key`);
  console.log();
  divider();
  console.log();
  readlineSync.keyInPause(s("  Press any key to return...", DIM));
}

/* ─── SPINNER ────────────────────────────────────────────── */

const SPIN_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

class Spinner {
  private i = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private label = "";

  start(label: string): void {
    this.label = label;
    this.i = 0;
    process.stdout.write(HIDE);
    this.timer = setInterval(() => {
      const f = SPIN_FRAMES[this.i % SPIN_FRAMES.length];
      process.stdout.write(`\r  ${s(f, CYAN)} ${this.label}...`);
      this.i++;
    }, 100);
  }

  stop(ok: boolean, detail?: string): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const icon = ok ? s("\u2713", GREEN, BOLD) : s("\u2717", RED, BOLD);
    const detailStr = detail ? ` ${s(detail, DIM)}` : "";
    process.stdout.write(`\r  ${icon} ${this.label}${detailStr}${" ".repeat(20)}\n`);
    process.stdout.write(SHOW);
  }

  async run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.start(label);
    try {
      const result = await fn();
      this.stop(true);
      return result;
    } catch (e) {
      this.stop(false, e instanceof Error ? e.message.slice(0, 60) : "error");
      throw e;
    }
  }
}

const spinner = new Spinner();

/* ─── TYPING ANIMATION ────────────────────────────────────── */

async function typewrite(text: string, ms = 12): Promise<void> {
  for (const ch of text) {
    process.stdout.write(ch);
    await new Promise((r) => setTimeout(r, ms));
  }
}

/* ─── FILE HELPERS ────────────────────────────────────────── */

interface PdfInfo {
  name: string;
  path: string;
  sizeKB: number;
}

function getPdfFiles(): PdfInfo[] {
  const inputDir = join(process.cwd(), "input");
  if (!existsSync(inputDir)) return [];
  try {
    return readdirSync(inputDir)
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((f) => {
        try {
          const st = statSync(join(inputDir, f));
          return { name: f, path: join(inputDir, f), sizeKB: Math.round(st.size / 1024) };
        } catch {
          return null;
        }
      })
      .filter((f): f is PdfInfo => f !== null)
      .sort((a, b) => b.sizeKB - a.sizeKB);
  } catch {
    return [];
  }
}

function fmtSize(kb: number): string {
  return kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB";
}

/* ─── FILENAME PARSER ─────────────────────────────────────── */

function parsePdfFilename(name: string): { exam: string; year: number; shift: string } | null {
  const base = basename(name).replace(/\.pdf$/i, "").toLowerCase();
  const patterns: Array<{ re: RegExp; exam: string }> = [
    { re: /^neet[-_]?(\d{4})[-_]?(.+)$/i, exam: "neet" },
    { re: /^jeemain[-_]?(\d{4})[-_]?(.+)$/i, exam: "jeemain" },
    { re: /^jee[-_]?(?:adv(?:anced)?)?[-_]?(\d{4})[-_]?(.+)$/i, exam: "jeeadv" },
    { re: /^jee[-_](?:main[-_])?(\d{4})[-_]?(.+)$/i, exam: "jeemain" },
    { re: /^ncert[-_]?(?:exemplar[-_])?(\d+)[-_](.+)$/i, exam: "ncert-exemplar" },
  ];
  for (const p of patterns) {
    const m = base.match(p.re);
    if (m) {
      let shift = m[2].replace(/\.pdf$/i, "").replace(/[-_]+/g, "-");
      shift = shift.replace(/^(?:shift[-]?)?/i, "").trim();
      return { exam: p.exam, year: parseInt(m[1], 10), shift };
    }
  }
  return null;
}

/* ─── PDF TYPE DETECTION ──────────────────────────────────── */

function detectPdfType(name: string): { type: "question" | "answer-key" | "combined"; label: string } {
  const base = basename(name).replace(/\.pdf$/i, "").toLowerCase();
  const hasAnswer = /\b(answer|key|sol|solution|ans)\b/i.test(base);
  const hasQuestion = /\b(question|paper|set|shift|neet|jee|main|adv)\b/i.test(base);
  if (hasAnswer && hasQuestion) return { type: "combined", label: s("Combined", MAGENTA) };
  if (hasAnswer) return { type: "answer-key", label: s("Answer Key", YELLOW) };
  return { type: "question", label: s("Question Paper", GREEN) };
}

/* ─── CHECKPOINT CHECK ────────────────────────────────────── */

async function isAlreadyProcessed(pdfPath: string): Promise<{
  processed: boolean;
  exam?: string;
  year?: number;
  shift?: string;
  entry?: Record<string, unknown>;
}> {
  const parsed = parsePdfFilename(basename(pdfPath));
  if (!parsed || !parsed.exam || !parsed.year || !parsed.shift) {
    return { processed: false };
  }
  const cpPath = join(process.cwd(), ".checkpoints.json");
  if (!existsSync(cpPath)) return { processed: false, ...parsed };
  try {
    const raw = readFileSync(cpPath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const key = `${parsed.exam}/${parsed.year}/${parsed.shift}`;
    const entry = data[key] as Record<string, unknown> | undefined;
    if (entry) return { processed: true, ...parsed, entry };
    return { processed: false, ...parsed };
  } catch {
    return { processed: false };
  }
}

function renderStageBar(stages: Record<string, { status: string }> | undefined): string {
  if (!stages) return s("no stages", DIM);
  const names = ["ocr", "extract", "diagrams", "validate", "export"];
  const short = ["OCR", "EXT", "DIA", "VAL", "EXP"];
  return names
    .map((n, i) => {
      const st = stages[n]?.status;
      if (st === "completed") return s(short[i], GREEN);
      if (st === "failed") return s(short[i], RED);
      return s(short[i], DIM);
    })
    .join(" \u2192 ");
}

/* ─── ENV & OCR SELECTORS ─────────────────────────────────── */

interface EnvEntry {
  name: string;
  label: string;
  category: "ocr" | "ai";
}

const ENV_VARS: EnvEntry[] = [
  { name: "MISTRAL_API_KEY", label: "Mistral OCR", category: "ocr" },
  { name: "MINERU_API_KEY", label: "MinerU OCR", category: "ocr" },
  { name: "NVIDIA_API_KEY", label: "NVIDIA NIM (primary)", category: "ai" },
  { name: "ZAI_API_KEY", label: "Z.AI GLM-4-Flash (free)", category: "ai" },
  { name: "LONGCAT_API_KEY", label: "LongCat Lite (256K ctx)", category: "ai" },
  { name: "POOLSIDE_API_KEY", label: "Poolside (unlimited)", category: "ai" },
  { name: "GEMINI_API_KEY", label: "Gemini 3.1 Flash Lite", category: "ai" },
  { name: "CEREBRAS_API_KEY", label: "Cerebras (fallback)", category: "ai" },
  { name: "VC_API_KEY", label: "Vanchin KAT-Coder", category: "ai" },
];

function selectOcrEngine(): "mistral" | "mineru" {
  banner();
  console.log(s("  OCR Engine Selection", BOLD, WHITE));
  divider();
  console.log();
  console.log(`  Choose the PDF text extraction engine:`);
  console.log();
  const idx = readlineSync.keyInSelect(
    [
      `${s("Mistral OCR", BOLD)}  ${s("Requires MISTRAL_API_KEY. Structured annotations, bilingual, good for clean PDFs.", DIM)}`,
      `${s("MinerU OCR", CYAN, BOLD)}  ${s("Uses MINERU_API_KEY (Agent API fallback). LaTeX formulas, HTML tables, image extraction. Best for NEET/complex layouts.", DIM)}`,
    ],
    "",
    { cancel: false },
  );
  const engines: Array<"mistral" | "mineru"> = ["mistral", "mineru"];
  const selected = engines[idx];
  console.log();
  console.log(`  ${s("Selected:", BOLD)} ${selected === "mistral" ? "Mistral OCR" : s("MinerU OCR", CYAN, BOLD)}`);
  console.log();
  divider();
  console.log();
  return selected;
}

function showEnvCheck(): void {
  banner();
  console.log(s("  Environment Health Check", BOLD, WHITE));
  divider();
  console.log();
  const ocrVars = ENV_VARS.filter((v) => v.category === "ocr");
  const aiVars = ENV_VARS.filter((v) => v.category === "ai");
  let setCount = 0;

  console.log(`  ${s("OCR Providers:", BOLD)}`);
  for (const v of ocrVars) {
    const ok = !!process.env[v.name];
    const masked = ok ? s(v.name.slice(0, 8) + "********", DIM) : s("not set", RED, DIM);
    console.log(`    ${dot(ok)} ${s(v.label, BOLD)}  ${masked}`);
    if (ok) setCount++;
  }
  console.log();
  console.log(`  ${s("AI Extraction Providers:", BOLD)}`);
  for (const v of aiVars) {
    const ok = !!process.env[v.name];
    const masked = ok ? s("configured", GREEN, DIM) : s("not set", RED, DIM);
    console.log(`    ${dot(ok)} ${s(v.label, BOLD)}  ${masked}`);
    if (ok) setCount++;
  }
  console.log();
  const ocrReady = !!process.env.MISTRAL_API_KEY || !!process.env.MINERU_API_KEY;
  const aiReady = aiVars.some((v) => !!process.env[v.name]);
  console.log(
    `  ${s("Summary:", BOLD)}  ${setCount}/${ENV_VARS.length} keys set` +
      (ocrReady ? `  |  ${s("OCR: READY", GREEN, BOLD)}` : `  |  ${s("OCR: NO KEY", RED, BOLD)}`) +
      (aiReady ? `  |  ${s("AI: READY", GREEN, BOLD)}` : `  |  ${s("AI: NO KEY", YELLOW, BOLD)}`),
  );
  console.log();
  divider();
  console.log();
  readlineSync.keyInPause(s("  Press any key to continue...", DIM));
}

/* ─── AI PROVIDER HEALTH CHECK ────────────────────────────── */

interface ProviderDef {
  name: string;
  keyVar: string;
  url: string;
  body: Record<string, unknown>;
  useQueryKey?: boolean;
}

const PROVIDERS: ProviderDef[] = [
  { name: "NVIDIA Qwen3 Coder 480B", keyVar: "NVIDIA_API_KEY", url: "https://api.nvcf.nvidia.com/v2/chat/completions", body: { model: "qwen3-coder-480b", messages: [{ role: "user", content: "hi" }], max_tokens: 5 } },
  { name: "LongCat Flash Lite", keyVar: "LONGCAT_API_KEY", url: "https://api.longcat.ai/v1/chat/completions", body: { model: "flash-lite", messages: [{ role: "user", content: "hi" }], max_tokens: 1 } },
  { name: "Poolside Laguna M.1", keyVar: "POOLSIDE_API_KEY", url: "https://api.poolside.ai/v1/chat/completions", body: { model: "laguna-m-1", messages: [{ role: "user", content: "hi" }], thinking: false } },
  { name: "Vanchin KAT-Coder", keyVar: "VC_API_KEY", url: "https://api.vanchin.com/v1/chat/completions", body: { model: "kat-coder-air-v1", messages: [{ role: "user", content: "hi" }] } },
  { name: "Gemini 3.1 Flash Lite", keyVar: "GEMINI_API_KEY", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-001:generateContent", body: { contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } }, useQueryKey: true },
  { name: "Cerebras GPT-OSS-120B", keyVar: "CEREBRAS_API_KEY", url: "https://api.cerebras.ai/v1/chat/completions", body: { model: "gpt-oss-120b", messages: [{ role: "user", content: "hi" }], max_tokens: 1 } },
  { name: "Z.AI GLM-4.7-Flash", keyVar: "ZAI_API_KEY", url: "https://api.zhinai.com/v1/chat/completions", body: { model: "glm-4.7-flash", messages: [{ role: "user", content: "hi" }], thinking: { type: "disabled" } } },
];

async function testProvider(p: ProviderDef): Promise<{ ok: boolean; detail: string }> {
  const key = process.env[p.keyVar];
  if (!key || key === "xxx") return { ok: false, detail: "no key" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!p.useQueryKey) headers["Authorization"] = `Bearer ${key}`;
  const url = p.useQueryKey ? `${p.url}?key=${key}` : p.url;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(p.body),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) return { ok: true, detail: `HTTP ${res.status}` };
    const text = await res.text().catch(() => "");
    return { ok: false, detail: `HTTP ${res.status} ${text.slice(0, 50)}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 60) : "error" };
  }
}

async function testAiProviders(): Promise<void> {
  banner();
  console.log(s("  AI Provider Health Check", BOLD, WHITE));
  divider();
  console.log();
  console.log(`  Testing configured AI providers...`);
  console.log();

  const available: string[] = [];
  for (const p of PROVIDERS) {
    const key = process.env[p.keyVar];
    if (!key || key === "xxx") {
      console.log(`    ${s("\u25CB", DIM)} ${s(p.name, DIM)}  ${s("(no key)", DIM)}`);
      continue;
    }
    try {
      await spinner.run(p.name, () => testProvider(p));
      available.push(p.name);
    } catch {
      /* spinner already shows failure */
    }
  }

  console.log();
  if (available.length > 0) {
    console.log(`  ${s("Available:", BOLD)} ${available.join(", ")}`);
  } else {
    console.log(`  ${s("No AI providers available.", YELLOW)}  Extraction will fail unless at least one key is set.`);
  }
  console.log();
  divider();
  console.log();
  readlineSync.keyInPause(s("  Press any key to continue...", DIM));
}

/* ─── PDF SELECTOR ────────────────────────────────────────── */

async function selectPdfFile(): Promise<{ path: string; force: boolean }> {
  let pdfPath = "";
  let forceFlag = false;

  /* Pre-read checkpoints for processed column */
  let cpData: Record<string, unknown> = {};
  const cpPath = join(process.cwd(), ".checkpoints.json");
  if (existsSync(cpPath)) {
    try { cpData = JSON.parse(readFileSync(cpPath, "utf-8")) as Record<string, unknown>; } catch { /* ignore */ }
  }

  for (;;) {
    banner();
    console.log(s("  PDF File Selection", BOLD, WHITE));
    divider();
    console.log();
    const files = getPdfFiles();
    if (files.length === 0) {
      console.log(`  ${s("No PDFs found in input/ directory.", YELLOW)}`);
      console.log();
      divider();
      console.log();
      console.log(`  ${s("Type ? for help, or enter a path:", BOLD)}`);
      const manual = readlineSync.question(s("  Enter PDF path: ", BOLD));
      if (manual.trim() === "?") { showHelp(); continue; }
      if (manual.trim()) {
        pdfPath = manual.trim();
      } else {
        process.exit(1);
      }
    } else {
      /* Build processed/type info for each file */
      const fileInfos = files.map((f) => {
        const parsed = parsePdfFilename(f.name);
        let processed = false;
        let stages: Record<string, { status: string }> | undefined;
        if (parsed) {
          const key = `${parsed.exam}/${parsed.year}/${parsed.shift}`;
          const entry = cpData[key] as Record<string, unknown> | undefined;
          if (entry) {
            processed = true;
            stages = entry.stages as Record<string, { status: string }> | undefined;
          }
        }
        const typeLabel = detectPdfType(f.name).label;
        return { ...f, processed, stages, typeLabel };
      });

      /* Header */
      console.log(`  ${s("PDF", DIM).padStart(5)} ${s("Status", DIM)}  ${s("Type", DIM).padEnd(14)}  ${s("File", DIM).padEnd(42)} ${s("Size", DIM)}`);
      console.log(`  ${s("\u2500".repeat(5), DIM)} ${s("\u2500".repeat(6), DIM)}  ${s("\u2500".repeat(14), DIM)}  ${s("\u2500".repeat(42), DIM)} ${s("\u2500".repeat(8), DIM)}`);

      const rows = fileInfos.map((f, i) => {
        const num = s((i + 1).toString().padStart(2), CYAN);
        const indicator = f.processed
          ? s(" \u2713", GREEN, BOLD)
          : s(" \u25CB", DIM);
        const typeStr = f.typeLabel.padEnd(14);
        return `  ${num}${indicator}  ${typeStr} ${f.name.padEnd(42)} ${s(fmtSize(f.sizeKB), DIM)}`;
      });
      rows.push(`  ${s("M", CYAN)} ${s(" \u25CB", DIM)}  ${s("Manual", DIM).padEnd(14)} ${s("Manual path entry", DIM).padEnd(42)}`);
      rows.forEach((item) => console.log(item));
      console.log();
      console.log(`  ${s("?", CYAN)}  ${s("Help  (commands, features, env vars, about)", DIM)}`);
      console.log();
      const raw = readlineSync.question(s("  Select [1-" + files.length + "], M or ?: ", BOLD));
      if (raw === "?") { showHelp(); continue; }
      const num = parseInt(raw, 10);
      if (num >= 1 && num <= files.length) {
        pdfPath = files[num - 1].path;
      } else if (raw.toUpperCase() === "M") {
        const manual = readlineSync.question(s("  Enter PDF path: ", BOLD));
        if (manual.trim() === "?") { showHelp(); continue; }
        if (manual.trim()) pdfPath = manual.trim();
        else continue;
      } else {
        continue;
      }
    }

    /* Check if already processed */
    const cp = await isAlreadyProcessed(pdfPath);
    if (cp.processed && cp.entry) {
      banner();
      console.log(s("  Already Processed", BOLD, YELLOW));
      divider();
      console.log();
      console.log(`  ${s("\u26A0", YELLOW)} This PDF was already processed:`);
      console.log(`    ${s("Exam:", BOLD)} ${cp.exam}  ${s("Year:", BOLD)} ${cp.year}  ${s("Shift:", BOLD)} ${cp.shift}`);
      console.log(`    ${s("Type:", BOLD)} ${detectPdfType(basename(pdfPath)).label}`);
      const stages = cp.entry.stages as Record<string, { status: string }> | undefined;
      if (stages) {
        console.log(`    ${s("Stages:", BOLD)} ${renderStageBar(stages)}`);
      }
      if (cp.entry.timestamp) {
        console.log(`    ${s("Completed:", BOLD)} ${String(cp.entry.timestamp).replace("T", " ").slice(0, 19)}`);
      }
      console.log();
      console.log(`    ${s("[F]", YELLOW, BOLD)} Force re-process (overwrites existing data)`);
      console.log(`    ${s("[S]", GREEN, BOLD)}  Skip re-process (use existing results)`);
      console.log(`    ${s("[C]", RED, BOLD)}   Cancel`);
      console.log();
      const choice = readlineSync.question(s("  Choice [F/S/C]: ", BOLD)).toUpperCase();
      if (choice === "F") {
        forceFlag = true;
        return { path: pdfPath, force: true };
      }
      if (choice === "S" || choice === "") {
        console.log(`  ${s("Skipping. Goodbye!", DIM)}`);
        process.exit(0);
      }
      console.log();
      continue;
    }
    return { path: pdfPath, force: false };
  }
}

/* ─── CONFIG SUMMARY ──────────────────────────────────────── */

function showConfig(pdfPath: string, ocrEngine: string, force: boolean): boolean {
  banner();
  console.log(s("  Configuration Summary", BOLD, WHITE));
  divider();
  console.log();
  const pdfName = basename(pdfPath);
  try {
    const st = statSync(pdfPath);
    const pdfType = detectPdfType(pdfName);
    const parsed = parsePdfFilename(pdfName);
    const fields: Array<[string, string]> = [
      ["OCR Engine", ocrEngine === "mineru" ? s("MinerU OCR", CYAN, BOLD) : s("Mistral OCR", BOLD)],
      ["PDF File", `${pdfName}  ${s("(" + fmtSize(Math.round(st.size / 1024)) + ")", DIM)}`],
      ["PDF Type", pdfType.label],
    ];
    if (parsed) {
      fields.push(["Detection", `${parsed.exam} ${parsed.year} / ${parsed.shift}`]);
    }
    fields.push(
      ["AI Extraction", s("Auto-detect available providers", DIM)],
      ["Answer Key", pdfType.type === "answer-key"
        ? s("Separate answer key PDF", YELLOW)
        : s("Auto-detect embedded keys", DIM)],
    );
    if (force) fields.push(["Mode", s("FORCE re-process", YELLOW, BOLD)]);
    const maxKeyLen = Math.max(...fields.map((f) => f[0].length));
    for (const [key, val] of fields) {
      console.log(`  ${s(key.padEnd(maxKeyLen), BOLD)}  ${val}`);
    }
    console.log();
    divider();
    console.log();
    return readlineSync.keyInYN(s("  Start extraction?", BOLD)) as boolean;
  } catch {
    console.log(`  ${s("Error: PDF file not found.", RED, BOLD)}`);
    return false;
  }
}

/* ─── COLORIZED LOG OUTPUT ────────────────────────────────── */

function colorizeLine(line: string): string {
  let r = line;
  if (r.includes("[ERROR]")) {
    const p = r.split("[ERROR]");
    r = p[0] + s("[ERROR]", RED, BOLD) + p.slice(1).join(s("[ERROR]", RED, BOLD));
  }
  if (r.includes("[WARN]")) {
    const p = r.split("[WARN]");
    r = p[0] + s("[WARN]", YELLOW, BOLD) + p.slice(1).join(s("[WARN]", YELLOW, BOLD));
  }
  if (r.includes("[INFO]")) {
    const p = r.split("[INFO]");
    r = p[0] + s("[INFO]", CYAN, BOLD) + p.slice(1).join(s("[INFO]", CYAN, BOLD));
  }
  if (r.includes("[DEBUG]")) {
    const p = r.split("[DEBUG]");
    r = p[0] + s("[DEBUG]", MAGENTA, BOLD) + p.slice(1).join(s("[DEBUG]", MAGENTA, BOLD));
  }
  r = r.replace(/(Step \d\/\d:)/g, (m) => s(m, WHITE, BOLD));
  r = r.replace(/\b(\d{1,3}\/\d{1,3}|\d+ pages|\d+ chars|\d+ questions|\+[\d.]+s)\b/g, (m) => s(m, GREEN));
  r = r.replace(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/g, (m) => s(m, DIM));
  return r;
}

/* ─── PIPELINE RUNNER ─────────────────────────────────────── */

async function runPipeline(pdfPath: string, ocrEngine: string, force: boolean): Promise<number> {
  return new Promise((resolve) => {
    banner("PIPELINE EXECUTION");
    console.log(s(`  File: ${basename(pdfPath)}`, BOLD, WHITE));
    divider();
    console.log();
    console.log(`  ${s("OCR Engine:", BOLD)} ${ocrEngine === "mineru" ? s("MinerU OCR", CYAN, BOLD) : s("Mistral OCR", BOLD)}`);
    console.log(`  ${s("Status:", BOLD)} ${s("RUNNING", GREEN, BOLD)}`);
    if (force) console.log(`  ${s("Mode:", BOLD)} ${s("FORCE (overwriting existing)", YELLOW, BOLD)}`);
    console.log();
    divider();
    console.log();

    const scriptPath = join(process.cwd(), "scripts", "process-pdf.ts");
    const args = [scriptPath, "--input", pdfPath, "--ocr", ocrEngine];
    if (force) args.push("--force");
    const child = spawn("npx", ["tsx", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      shell: true,
    });

    const onData = (data: Buffer) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          const ts = new Date().toLocaleTimeString();
          console.log(`  ${s("[" + ts + "]", DIM)} ${colorizeLine(line)}`);
        }
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.log(`  ${s("Launch failed:", RED, BOLD)} ${err.message}`);
      resolve(1);
    });
  });
}

function showSummary(exitCode: number): void {
  banner("EXTRACTION RESULTS");
  if (exitCode === 0) {
    console.log(s("  Pipeline completed successfully", BOLD, GREEN));
    divider();
    console.log();
    console.log(`  ${s("Output:", BOLD)}  ${s("data/<exam>/<year>/<shift>/", CYAN)}`);
    console.log(`  ${s("Status:", BOLD)} ${s("ALL STAGES PASSED", GREEN, BOLD)}`);
    console.log();
    console.log(`  ${s("Next steps:", BOLD)}`);
    console.log(`    ${s("npm run review", BOLD)}   \u2014 Interactive review & corrections`);
    console.log(`    ${s("npm run signoff", BOLD)}  \u2014 Mark as verified`);
    console.log(`    ${s("npm run stats", BOLD)}    \u2014 Dataset statistics`);
    console.log(`    ${s("npm run status", BOLD)}   \u2014 Checkpoint overview`);
  } else {
    console.log(s("  Pipeline failed", BOLD, RED));
    divider();
    console.log();
    console.log(`  ${s("Exit code:", BOLD)} ${exitCode}`);
    console.log();
    console.log(`  ${s("Common fixes:", BOLD)}`);
    console.log(`    ${s("\u2022", DIM)} Set at least one AI provider key in ${s(".env", BOLD)}`);
    console.log(`    ${s("\u2022", DIM)} Check PDF file exists and is readable`);
    console.log(`    ${s("\u2022", DIM)} Run ${s("npx tsc --noEmit", BOLD)} to verify compilation`);
    console.log(`    ${s("\u2022", DIM)} Some providers may be rate-limited; try again later`);
  }
  console.log();
  divider();
  console.log();
}

/* ─── WELCOME TYPING ANIMATION ────────────────────────────── */

async function showWelcome(): Promise<void> {
  banner();
  divider(s("WELCOME", CYAN, BOLD));
  console.log();
  const lines = [
    `  ${s("QUESTION PIPELINE", WHITE, BOLD)} \u2014 Batch Indian exam PDF \u2192 structured JSON datasets`,
    `  OCR extraction, multi-AI consensus, 32 validations, human review.`,
    ``,
    `  ${s("This wizard will guide you through:", BOLD)}`,
    `    ${s("1.", BOLD)} Select OCR engine  ${s("(Mistral or MinerU)", DIM)}`,
    `    ${s("2.", BOLD)} Check environment  ${s("(API keys, providers)", DIM)}`,
    `    ${s("3.", BOLD)} Test AI providers   ${s("(ping configured models)", DIM)}`,
    `    ${s("4.", BOLD)} Choose PDF file     ${s("(from input/, type col, processed col)", DIM)}`,
    `    ${s("5.", BOLD)} Run extraction      ${s("(live progress display)", DIM)}`,
    `    ${s("6.", BOLD)} Review results      ${s("(summary with next steps)", DIM)}`,
    `    ${s("?", BOLD)}  ${s("Type ? anytime for help & commands", DIM)}`,
  ];
  for (const line of lines) {
    process.stdout.write(HIDE);
    await typewrite(line + "\n", 8);
    process.stdout.write(SHOW);
  }
  console.log();
  divider();
  console.log();
}

/* ─── MAIN ────────────────────────────────────────────────── */

async function main(): Promise<void> {
  process.loadEnvFile();
  await showWelcome();

  const beginRaw = readlineSync.question(s("  Begin interactive session? [Y/n/?] ", BOLD));
  if (beginRaw.trim().toUpperCase() === "?") { showHelp(); await main(); return; }
  if (beginRaw.trim().toUpperCase() === "N" || beginRaw.trim().toUpperCase() === "NO") {
    console.log(`  ${s("Exiting. Goodbye!", DIM)}`);
    process.exit(0);
  }
  console.log();

  const ocrEngine = selectOcrEngine();
  showEnvCheck();
  await testAiProviders();
  const { path: pdfPath, force } = await selectPdfFile();

  const confirmed = showConfig(pdfPath, ocrEngine, force);
  if (!confirmed) {
    console.log(`  ${s("Cancelled.", YELLOW)}`);
    process.exit(0);
  }

  const exitCode = await runPipeline(pdfPath, ocrEngine, force);
  showSummary(exitCode);

  if (readlineSync.keyInYN(s("  Run another PDF?", BOLD)) as boolean) {
    await main();
  } else {
    console.log(`  ${s("Goodbye!", DIM)}`);
    process.exit(exitCode);
  }
}

await main();
