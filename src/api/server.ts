import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile, readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { logger } from "../utils/logger.js";
import { computeChecksum } from "../utils/hash-utils.js";
import type { Exam, Subject, QuestionType, Question, ApiResponse, ApiStats } from "../types.js";

const DATA_DIR = join(process.cwd(), "data");
const PORT = parseInt(process.env.PORT ?? "3456", 10);

interface QueryParams {
  exam?: Exam;
  year?: number;
  shift?: string;
  subject?: Subject;
  topic?: string;
  type?: QuestionType;
  section?: string;
  tags?: string[];
  difficulty?: string;
  limit: number;
  offset: number;
  random?: boolean;
  sort: string;
  order: "asc" | "desc";
}

function parseUrl(url: string): { path: string; params: QueryParams } {
  const [rawPath, rawQuery] = url.split("?");
  const path = rawPath.replace(/\/+$/, "") || "/";

  const query: Record<string, string> = {};
  if (rawQuery) {
    for (const part of rawQuery.split("&")) {
      const [k, v] = part.split("=").map(decodeURIComponent);
      if (k) query[k] = v;
    }
  }

  const params: QueryParams = {
    exam: query.exam as Exam | undefined,
    year: query.year ? parseInt(query.year, 10) : undefined,
    shift: query.shift,
    subject: query.subject as Subject | undefined,
    topic: query.topic,
    type: query.type as QuestionType | undefined,
    section: query.section,
    tags: query.tags ? query.tags.split(",").map(t => t.trim()).filter(Boolean) : undefined,
    difficulty: query.difficulty,
    limit: Math.min(parseInt(query.limit ?? "100", 10) || 100, 500),
    offset: parseInt(query.offset ?? "0", 10) || 0,
    random: query.random === "true",
    sort: query.sort || "number",
    order: (query.order === "desc" ? "desc" : "asc") as "asc" | "desc",
  };

  return { path, params };
}

async function loadJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function findPaperFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(d: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(d);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(d, entry);
      let stats;
      try {
        stats = await stat(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        await walk(fullPath);
      } else if (entry === "paper.json") {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

function filterQuestions(questions: Question[], params: QueryParams): Question[] {
  return questions.filter(q => {
    if (params.subject && q.subject !== params.subject) return false;
    if (params.type && q.type !== params.type) return false;
    if (params.topic && q.topic !== params.topic) return false;
    if (params.section && q.section !== params.section) return false;
    if (params.difficulty && q.difficulty !== params.difficulty) return false;
    if (params.tags && params.tags.length > 0) {
      for (const tag of params.tags) {
        if (!q.tags.includes(tag)) return false;
      }
    }
    return true;
  });
}

function sortQuestions(questions: Question[], sort: string, order: "asc" | "desc"): Question[] {
  const sorted = [...questions].sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sort] ?? 0;
    const bVal = (b as unknown as Record<string, unknown>)[sort] ?? 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return aVal.localeCompare(bVal);
    }
    return (aVal as number) - (bVal as number);
  });
  return order === "desc" ? sorted.reverse() : sorted;
}

function sendJson(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function sendFile(res: ServerResponse, filePath: string, mime: string): void {
  readFile(filePath).then(data => {
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=3600",
    });
    res.end(data);
  }).catch(() => {
    res.writeHead(404);
    res.end("Not found");
  });
}

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? "/";
  const { path, params } = parseUrl(url);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    // GET /api/v1/questions
    if (path === "/api/v1/questions") {
      const paperFiles = await findPaperFiles(DATA_DIR);
      let allQuestions: Question[] = [];

      for (const pf of paperFiles) {
        const data = await loadJsonFile(pf) as { questions?: Question[] } | null;
        if (data?.questions) {
          allQuestions = allQuestions.concat(data.questions);
        }
      }

      const filtered = filterQuestions(allQuestions, params);
      const sorted = sortQuestions(filtered, params.sort, params.order);
      const paginated = sorted.slice(params.offset, params.offset + params.limit);

      const response: ApiResponse<Question> = {
        success: true,
        count: paginated.length,
        total: filtered.length,
        offset: params.offset,
        limit: params.limit,
        sort: params.sort,
        order: params.order,
        exam: params.exam,
        subject: params.subject,
        questions: paginated,
      };

      sendJson(res, 200, response as unknown as Record<string, unknown>);
      return;
    }

    // GET /api/v1/questions/count
    if (path === "/api/v1/questions/count") {
      const paperFiles = await findPaperFiles(DATA_DIR);
      let total = 0;

      for (const pf of paperFiles) {
        const data = await loadJsonFile(pf) as { total?: number } | null;
        total += data?.total ?? 0;
      }

      sendJson(res, 200, { success: true, total });
      return;
    }

    // GET /api/v1/exams
    if (path === "/api/v1/exams") {
      const examDirs = await readdir(DATA_DIR);
      const exams = examDirs.filter(d => ["jeemain", "neet", "jeeadv", "ncert-exemplar"].includes(d));
      sendJson(res, 200, { success: true, exams });
      return;
    }

    // GET /api/v1/stats
    if (path === "/api/v1/stats") {
      const indexData = await loadJsonFile(join(DATA_DIR, "index.json"));
      const stats = indexData ?? { totalDatasets: 0, totalQuestions: 0 };
      sendJson(res, 200, { success: true, ...stats } as Record<string, unknown>);
      return;
    }

    // GET /api/v1/diagrams/:exam/:year/:shift/:path
    const diagMatch = path.match(/^\/api\/v1\/diagrams\/([^/]+)\/(\d+|class-\d+)\/([^/]+)\/(.+)/);
    if (diagMatch) {
      const [, , , , rest] = diagMatch;
      const diagPath = join(DATA_DIR, path.replace("/api/v1/diagrams/", ""));
      sendFile(res, diagPath, getMimeType(diagPath));
      return;
    }

    // 404
    sendJson(res, 404, { success: false, error: `Not found: ${path}` });
  } catch (err) {
    logger.error(`API error: ${err instanceof Error ? err.message : String(err)}`);
    sendJson(res, 500, { success: false, error: "Internal server error" });
  }
}

const server = createServer(handleRequest);
server.listen(PORT, () => {
  logger.info(`API server running on http://localhost:${PORT}`);
  logger.info(`Endpoints:`);
  logger.info(`  GET /api/v1/questions`);
  logger.info(`  GET /api/v1/questions/count`);
  logger.info(`  GET /api/v1/exams`);
  logger.info(`  GET /api/v1/stats`);
  logger.info(`  GET /api/v1/diagrams/:exam/:year/:shift/:path`);
});
