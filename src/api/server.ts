import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile, readdir, stat, mkdir, writeFile } from "fs/promises";
import { join, extname, relative } from "path";
import { existsSync } from "fs";
import { spawn, ChildProcess } from "child_process";
import { watch } from "fs";
import { logger } from "../utils/logger.js";
import { computeChecksum } from "../utils/hash-utils.js";
import type { Exam, Subject, QuestionType, Question, ApiResponse } from "../types.js";

const DATA_DIR = join(process.cwd(), "data");
const PORT = parseInt(process.env.PORT ?? "3456", 10);

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD STATE
// ═══════════════════════════════════════════════════════════════════

let pipelineProcess: ChildProcess | null = null;
const sseClients = new Set<ServerResponse>();
let pipelineStatus: { stage: string; status: string; startedAt: string | null; finishedAt: string | null } = {
  stage: "", status: "idle", startedAt: null, finishedAt: null,
};
const logHistory: { ts: string; type: string; msg: string }[] = [];
const MAX_LOGS = 500;

let reviewSession: {
  exam: string; year: number; shift: string;
  questions: Question[]; index: number;
  results: { id: string; action: string; note: string }[];
  active: boolean;
} | null = null;

// ═══════════════════════════════════════════════════════════════════
// SSE
// ═══════════════════════════════════════════════════════════════════

function sseSend(client: ServerResponse, event: string, data: unknown): void {
  client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseBroadcast(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of sseClients) {
    try { c.write(msg); } catch { sseClients.delete(c); }
  }
}

function addLog(type: string, msg: string): void {
  const entry = { ts: new Date().toISOString(), type, msg };
  logHistory.push(entry);
  if (logHistory.length > MAX_LOGS) logHistory.shift();
  sseBroadcast("log", entry);
}

// ═══════════════════════════════════════════════════════════════════
// COMMAND RUNNER
// ═══════════════════════════════════════════════════════════════════

interface StageDef { name: string; cmd: string; args: string; icon: string }

const STAGES: StageDef[] = [
  { name: "test-models", cmd: "npm", args: "run test-models", icon: "🔌" },
  { name: "scrape", cmd: "npm", args: "run scrape -- --exam {exam} --year {year} --shifts {shifts}", icon: "📥" },
  { name: "ocr", cmd: "npx", args: "tsx src/extractors/ocr-stage.ts --input {input} --output {output}", icon: "👁️" },
  { name: "extract", cmd: "npx", args: "tsx src/extractors/structurer.ts --input {input} --output {output}", icon: "🧠" },
  { name: "validate", cmd: "npx", args: "tsx src/validators/auto-validator.ts --path {path}", icon: "🔍" },
  { name: "finalize", cmd: "npx", args: "tsx src/finalizers/exporter.ts --exam {exam} --year {year} --shift {shift}", icon: "📦" },
  { name: "verify", cmd: "npm", args: "run verify", icon: "🔐" },
  { name: "stats", cmd: "npm", args: "run stats", icon: "📊" },
];

async function runCommand(cmd: string, args: string, stage: string): Promise<void> {
  if (pipelineProcess) {
    addLog("warn", `Already running: ${pipelineStatus.stage}. Stop first.`);
    return;
  }
  pipelineStatus = { stage, status: "running", startedAt: new Date().toISOString(), finishedAt: null };
  sseBroadcast("status", pipelineStatus);
  addLog("cmd", `▶ ${cmd} ${args}`);

  const isWin = process.platform === "win32";
  const child = isWin
    ? spawn("cmd.exe", ["/c", `${cmd} ${args}`], { cwd: process.cwd(), shell: false, windowsHide: true })
    : spawn(cmd, args.split(" ").filter(Boolean), { cwd: process.cwd(), shell: false });

  pipelineProcess = child;

  child.stdout?.on("data", (d: Buffer) => {
    for (const line of d.toString().split("\n").filter(Boolean)) {
      addLog("info", line.trimEnd());
    }
  });
  child.stderr?.on("data", (d: Buffer) => {
    for (const line of d.toString().split("\n").filter(Boolean)) {
      addLog("warn", line.trimEnd());
    }
  });
  child.on("error", (err) => {
    addLog("err", `Process error: ${err.message}`);
    pipelineStatus.status = "error";
    pipelineStatus.finishedAt = new Date().toISOString();
    sseBroadcast("status", pipelineStatus);
    pipelineProcess = null;
  });
  child.on("exit", (code) => {
    if (code === 0) {
      addLog("ok", `✓ ${stage} complete`);
      pipelineStatus.status = "done";
    } else {
      addLog("err", `✗ ${stage} failed (exit ${code})`);
      pipelineStatus.status = "error";
    }
    pipelineStatus.finishedAt = new Date().toISOString();
    sseBroadcast("status", pipelineStatus);
    sseBroadcast("files", null); // trigger file refresh
    pipelineProcess = null;
  });
}

function stopPipeline(): void {
  if (pipelineProcess) {
    pipelineProcess.kill("SIGTERM");
    addLog("warn", "Pipeline stopped by user");
    pipelineStatus.status = "idle";
    pipelineStatus.finishedAt = new Date().toISOString();
    sseBroadcast("status", pipelineStatus);
    pipelineProcess = null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// FILE WATCHER
// ═══════════════════════════════════════════════════════════════════

let watchTimer: ReturnType<typeof setTimeout> | null = null;
function debounceWatch(): void {
  if (watchTimer) clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    sseBroadcast("files", null);
    watchTimer = null;
  }, 500);
}

try {
  if (existsSync(DATA_DIR)) {
    watch(DATA_DIR, { recursive: true }, () => debounceWatch());
  }
} catch { /* ignore */ }

// ═══════════════════════════════════════════════════════════════════
// EXISTING QUERY / LOAD HELPERS
// ═══════════════════════════════════════════════════════════════════

interface QueryParams {
  exam?: string; year?: number; shift?: string; subject?: Subject;
  topic?: string; type?: QuestionType; section?: string;
  tags?: string[]; difficulty?: string;
  limit: number; offset: number; random?: boolean;
  sort: string; order: "asc" | "desc";
}

function parseUrl(url: string): { path: string; params: QueryParams } {
  const [rawPath, rawQuery] = url.split("?");
  const path = rawPath.replace(/\/+$/, "") || "/";
  const query: Record<string, string> = {};
  if (rawQuery) rawQuery.split("&").forEach(p => { const [k, v] = p.split("=").map(decodeURIComponent); if (k) query[k] = v; });
  return {
    path,
    params: {
      exam: query.exam, year: query.year ? parseInt(query.year, 10) : undefined,
      shift: query.shift, subject: query.subject as Subject, topic: query.topic,
      type: query.type as QuestionType, section: query.section,
      tags: query.tags?.split(",").map(t => t.trim()).filter(Boolean),
      difficulty: query.difficulty,
      limit: Math.min(parseInt(query.limit ?? "100", 10) || 100, 500),
      offset: parseInt(query.offset ?? "0", 10) || 0,
      random: query.random === "true",
      sort: query.sort || "index", order: (query.order === "desc" ? "desc" : "asc") as "asc" | "desc",
    },
  };
}

async function loadJsonFile<T>(filePath: string): Promise<T | null> {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return null; }
}

async function findPaperFiles(): Promise<string[]> {
  const files: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries: string[];
    try { entries = await readdir(d); } catch { return; }
    for (const e of entries) {
      const fp = join(d, e); let s;
      try { s = await stat(fp); } catch { continue; }
      if (s.isDirectory()) await walk(fp);
      else if (e === "paper.json") files.push(fp);
    }
  }
  await walk(DATA_DIR);
  return files;
}

function filterQuestions(questions: Question[], params: QueryParams): Question[] {
  return questions.filter(q => {
    if (params.subject && q.subject !== params.subject) return false;
    if (params.type && q.type !== params.type) return false;
    if (params.topic && !params.topic.split(",").some(t => q.topic === t)) return false;
    if (params.difficulty && q.difficulty !== params.difficulty) return false;
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════
// FILE TREE
// ═══════════════════════════════════════════════════════════════════

async function getFileTree(dir: string, prefix = ""): Promise<{ name: string; path: string; size: number; isDir: boolean; children?: any[] }[]> {
  const result: any[] = [];
  let entries: string[];
  try { entries = await readdir(dir); } catch { return result; }
  entries.sort();
  for (const e of entries) {
    const fp = join(dir, e);
    let s;
    try { s = await stat(fp); } catch { continue; }
    if (s.isDirectory() && !e.startsWith(".")) {
      const children = await getFileTree(fp, prefix + e + "/");
      if (children.length > 0) result.push({ name: e + "/", path: relative(DATA_DIR, fp), size: 0, isDir: true, children });
    } else if (e.endsWith(".json") || e.endsWith(".pdf") || e.endsWith(".png")) {
      result.push({ name: e, path: relative(DATA_DIR, fp), size: s.size, isDir: false });
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════════

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c: Buffer) => b += c.toString());
    req.on("end", () => resolve(b));
  });
}

// ═══════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? "/";
  const { path, params } = parseUrl(url);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    // ── SSE event stream ──
    if (path === "/api/v1/events" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      // send initial state
      sseSend(res, "status", pipelineStatus);
      sseSend(res, "logs", logHistory.slice(-100));
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    // ── Pipeline: run stage ──
    if (path === "/api/v1/pipeline/run" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const stage = STAGES.find(s => s.name === body.stage);
      if (!stage) { sendJson(res, 400, { error: `Unknown stage: ${body.stage}` }); return; }

      let fullCmd = stage.cmd;
      let fullArgs = stage.args
        .replace(/\{exam\}/g, body.exam || "jeemain")
        .replace(/\{year\}/g, String(body.year || "2025"))
        .replace(/\{shift\}/g, body.shift || "1")
        .replace(/\{shifts\}/g, String(body.shifts || "1"))
        .replace(/\{input\}/g, body.input || "")
        .replace(/\{output\}/g, body.output || "")
        .replace(/\{path\}/g, body.path || "");

      // If custom command provided, use it instead
      if (body.custom) {
        const parts = body.custom.split(" ").filter(Boolean);
        fullCmd = parts[0];
        fullArgs = parts.slice(1).join(" ");
      }

      runCommand(fullCmd, fullArgs, stage.name);
      sendJson(res, 200, { ok: true, stage: stage.name });
      return;
    }

    // ── Pipeline: custom command ──
    if (path === "/api/v1/pipeline/custom" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      if (!body.command) { sendJson(res, 400, { error: "command required" }); return; }
      const parts = body.command.split(" ").filter(Boolean);
      runCommand(parts[0], parts.slice(1).join(" "), "custom");
      sendJson(res, 200, { ok: true });
      return;
    }

    // ── Pipeline: stop ──
    if (path === "/api/v1/pipeline/stop" && req.method === "POST") {
      stopPipeline();
      sendJson(res, 200, { ok: true });
      return;
    }

    // ── Pipeline: status ──
    if (path === "/api/v1/pipeline/status" && req.method === "GET") {
      sendJson(res, 200, { ...pipelineStatus, logs: logHistory.slice(-100) });
      return;
    }

    // ── Pipeline: stages ──
    if (path === "/api/v1/pipeline/stages" && req.method === "GET") {
      sendJson(res, 200, { stages: STAGES });
      return;
    }

    // ── Review: start session ──
    if (path === "/api/v1/review/start" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const paperPath = join(DATA_DIR, body.exam || "jeemain", String(body.year || "2025"), body.shift || "1", "paper.json");
      const data = await loadJsonFile<{ questions: Question[]; total: number; subjects: string[] }>(paperPath);
      if (!data) { sendJson(res, 404, { error: "paper.json not found" }); return; }
      reviewSession = {
        exam: body.exam || "jeemain",
        year: body.year || 2025,
        shift: body.shift || "1",
        questions: data.questions || [],
        index: 0,
        results: [],
        active: true,
      };
      addLog("info", `Review session started: ${body.exam} ${body.year} shift ${body.shift} (${reviewSession.questions.length} questions)`);
      sseBroadcast("review", { action: "started", total: reviewSession.questions.length });
      sendJson(res, 200, { ok: true, total: reviewSession.questions.length, current: reviewSession.questions[0] || null });
      return;
    }

    // ── Review: current question ──
    if (path === "/api/v1/review/current" && req.method === "GET") {
      if (!reviewSession || !reviewSession.active) { sendJson(res, 404, { error: "No active review session" }); return; }
      if (reviewSession.index >= reviewSession.questions.length) {
        sendJson(res, 200, { done: true, total: reviewSession.questions.length, results: reviewSession.results });
        return;
      }
      sendJson(res, 200, {
        done: false,
        index: reviewSession.index,
        total: reviewSession.questions.length,
        question: reviewSession.questions[reviewSession.index],
        progress: Math.round((reviewSession.index / reviewSession.questions.length) * 100),
      });
      return;
    }

    // ── Review: action (accept/edit/skip/flag) ──
    if (path === "/api/v1/review/action" && req.method === "POST") {
      if (!reviewSession || !reviewSession.active) { sendJson(res, 400, { error: "No active session" }); return; }
      if (reviewSession.index >= reviewSession.questions.length) {
        reviewSession.active = false;
        sendJson(res, 200, { done: true });
        return;
      }
      const body = JSON.parse(await readBody(req));
      const action = body.action || "accept";
      const q = reviewSession.questions[reviewSession.index];
      reviewSession.results.push({ id: q.id, action, note: body.note || "" });

      let logMsg = `Q${reviewSession.index + 1} ${action}`;
      if (action === "edit" && body.edited) {
        reviewSession.questions[reviewSession.index] = body.edited;
        logMsg += " (edited)";
      }
      addLog(action === "accept" ? "ok" : action === "edit" ? "warn" : "info", logMsg);

      reviewSession.index++;
      sseBroadcast("review", { action: "progress", index: reviewSession.index, total: reviewSession.questions.length });

      if (reviewSession.index >= reviewSession.questions.length) {
        reviewSession.active = false;
        addLog("ok", `✓ Review complete: ${reviewSession.results.filter(r => r.action === "accept").length} accepted, ${reviewSession.results.filter(r => r.action === "edit").length} edited`);
        sseBroadcast("review", { action: "complete", results: reviewSession.results });
        sendJson(res, 200, { done: true, total: reviewSession.questions.length, results: reviewSession.results });
        return;
      }

      sendJson(res, 200, {
        done: false,
        index: reviewSession.index,
        total: reviewSession.questions.length,
        question: reviewSession.questions[reviewSession.index],
        progress: Math.round((reviewSession.index / reviewSession.questions.length) * 100),
      });
      return;
    }

    // ── Review: cancel ──
    if (path === "/api/v1/review/cancel" && req.method === "POST") {
      reviewSession = null;
      addLog("info", "Review session cancelled");
      sendJson(res, 200, { ok: true });
      return;
    }

    // ── Files: tree ──
    if (path === "/api/v1/files/tree" && req.method === "GET") {
      const tree = await getFileTree(DATA_DIR);
      sendJson(res, 200, { tree });
      return;
    }

    // ── Files: list ──
    if (path === "/api/v1/files/list" && req.method === "GET") {
      const papers = await findPaperFiles();
      const files = await Promise.all(papers.map(async (fp) => {
        const rel = relative(DATA_DIR, fp);
        let s;
        try { s = await stat(fp); } catch { s = null; }
        const data = await loadJsonFile<{ total?: number; subjects?: string[]; exam?: string; year?: number; shift?: string }>(fp);
        return { path: rel, size: s?.size || 0, modified: s?.mtimeMs || 0, ...(data ? { total: data.total, subjects: data.subjects, exam: data.exam, year: data.year, shift: data.shift } : {}) };
      }));
      sendJson(res, 200, { files });
      return;
    }

    // ── Questions ──
    if (path === "/api/v1/questions" && req.method === "GET") {
      const paperFiles = await findPaperFiles();
      let allQuestions: Question[] = [];
      for (const pf of paperFiles) {
        const data = await loadJsonFile<{ questions?: Question[] }>(pf);
        if (data?.questions) allQuestions = allQuestions.concat(data.questions);
      }
      const filtered = filterQuestions(allQuestions, params);
      const paginated = filtered.slice(params.offset, params.offset + params.limit);
      const response: ApiResponse<Question> = { success: true, count: paginated.length, total: filtered.length, offset: params.offset, limit: params.limit, sort: params.sort, order: params.order, questions: paginated };
      sendJson(res, 200, response);
      return;
    }

    // ── Questions count ──
    if (path === "/api/v1/questions/count" && req.method === "GET") {
      const paperFiles = await findPaperFiles();
      let total = 0;
      for (const pf of paperFiles) {
        const data = await loadJsonFile<{ total?: number }>(pf);
        total += data?.total ?? 0;
      }
      sendJson(res, 200, { success: true, total });
      return;
    }

    // ── Exams ──
    if (path === "/api/v1/exams" && req.method === "GET") {
      const dirs = (await readdir(DATA_DIR).catch(() => [] as string[]));
      sendJson(res, 200, { success: true, exams: dirs.filter(d => !d.startsWith(".")) });
      return;
    }

    // ── Papers list ──
    if (path === "/api/v1/papers" && req.method === "GET") {
      const paperFiles = await findPaperFiles();
      const papers = await Promise.all(paperFiles.map(async (fp) => {
        const data = await loadJsonFile<{ exam?: string; year?: number; shift?: string; total?: number; subjects?: string[] }>(fp);
        const rel = relative(DATA_DIR, fp);
        const parts = rel.split(/[/\\]/);
        return {
          exam: data?.exam || parts[0] || "unknown",
          year: data?.year ?? (parts.length > 1 ? parseInt(parts[1], 10) : 0),
          shift: data?.shift || parts[2] || "unknown",
          total: data?.total || 0,
          subjects: data?.subjects || [],
        };
      }));
      sendJson(res, 200, { success: true, papers: papers.filter(p => p.exam && p.year && p.shift) });
      return;
    }

    // ── Stats ──
    if (path === "/api/v1/stats" && req.method === "GET") {
      const indexData = await loadJsonFile(DATA_DIR + "/index.json");
      const papers = await findPaperFiles();
      let totalQ = 0, totalSubjects = new Set<string>();
      for (const pf of papers) {
        const d = await loadJsonFile<{ total?: number; subjects?: string[]; questions?: Question[] }>(pf);
        if (d) { totalQ += d.total || d.questions?.length || 0; d.subjects?.forEach(s => totalSubjects.add(s)); }
      }
      sendJson(res, 200, { success: true, totalDatasets: papers.length, totalQuestions: totalQ, totalSubjects: totalSubjects.size, ...(indexData || {}) });
      return;
    }

    // ── Diagrams ──
    const diagMatch = path.match(/^\/api\/v1\/diagrams\/(.+)/);
    if (diagMatch) {
      const diagPath = join(DATA_DIR, diagMatch[1]);
      if (existsSync(diagPath)) {
        const ext = extname(diagPath).toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".svg" ? "image/svg+xml" : "application/octet-stream";
        readFile(diagPath).then(d => { res.writeHead(200, { "Content-Type": mime, "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" }); res.end(d); }).catch(() => sendJson(res, 404, { error: "Not found" }));
        return;
      }
    }

    // ── Dashboard HTML ──
    if (path === "/" || path === "/dashboard") {
      const htmlPath = join(process.cwd(), "dashboard.html");
      if (existsSync(htmlPath)) {
        readFile(htmlPath, "utf8").then(h => {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" });
          res.end(h);
        }).catch(() => sendJson(res, 500, { error: "Failed to read dashboard.html" }));
        return;
      }
    }

    // ── PDF Viewer HTML ──
    if (path === "/pdf-viewer" || path === "/viewer") {
      const viewerPath = join(process.cwd(), "pdf-viewer.html");
      if (existsSync(viewerPath)) {
        readFile(viewerPath, "utf8").then(h => {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" });
          res.end(h);
        }).catch(() => sendJson(res, 500, { error: "Failed to read pdf-viewer.html" }));
        return;
      }
    }

    // ── Static data files (JSON / images) ──
    if (path.startsWith("/api/v1/data/") && req.method === "GET") {
      const relPath = path.replace("/api/v1/data/", "");
      const filePath = join(DATA_DIR, relPath.replace(/\.\./g, ""));
      if (existsSync(filePath)) {
        const ext = extname(filePath).toLowerCase();
        if (ext === ".json") {
          readFile(filePath, "utf8").then(d => {
            res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(d);
          }).catch(() => sendJson(res, 404, { error: "Not found" }));
          return;
        }
        if ([".png", ".jpg", ".jpeg", ".svg", ".gif"].includes(ext)) {
          const mime = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : ext === ".gif" ? "image/gif" : "image/jpeg";
          readFile(filePath).then(d => {
            res.writeHead(200, { "Content-Type": mime, "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" });
            res.end(d);
          }).catch(() => sendJson(res, 404, { error: "Not found" }));
          return;
        }
      }
    }

    // 404
    sendJson(res, 404, { error: `Not found: ${path}` });
  } catch (err) {
    logger.error(`API error: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" });
  }
}

// ═══════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════

const server = createServer(handleRequest);
server.listen(PORT, () => {
  logger.info(`╔══════════════════════════════════════════╗`);
  logger.info(`║  Pipeline Dashboard Server              ║`);
  logger.info(`║  http://localhost:${PORT}${" ".repeat(5 - String(PORT).length)}                  ║`);
  logger.info(`║  Dashboard: http://localhost:${PORT}/dashboard   ║`);
  logger.info(`╚══════════════════════════════════════════╝`);
});
