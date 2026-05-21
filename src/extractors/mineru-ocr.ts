import { mkdir, readFile, mkdtemp, rm, writeFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { logger } from "../utils/logger.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import type { OcrResult, PageContent, MineruContentItem } from "../types.js";

const AGENT_API = "https://mineru.net/api/v1/agent";
const PRECISION_API = "https://mineru.net/api/v4";

const rateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });

interface MineruOptions {
  language?: string;
  enableTable?: boolean;
  isOcr?: boolean;
  enableFormula?: boolean;
  pageRange?: string;
}

function getApiKey(): string {
  return process.env.MINERU_API_KEY ?? "";
}

async function fetchJson(method: string, url: string, body: string | null, headers: Record<string, string>, timeout = 120000): Promise<string> {
  const res = await fetch(url, {
    method,
    headers,
    body: body ?? undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MinerU API ${res.status}: ${text.slice(0, 300)}`);
  }
  return text;
}

async function fetchBuffer(url: string, timeout = 300000): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MinerU download ${res.status}: ${text.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function fetchPut(url: string, buffer: Buffer, timeout = 300000): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    body: buffer as unknown as BodyInit,
    signal: AbortSignal.timeout(timeout),
  });
  if (res.status !== 200 && res.status !== 201) {
    const text = await res.text().catch(() => "");
    throw new Error(`MinerU upload ${res.status}: ${text.slice(0, 200)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function submitAgentFile(
  filePath: string,
  options: MineruOptions,
): Promise<{ taskId: string; fileUrl: string }> {
  const fileName = filePath.split(/[/\\]/).pop() ?? "document.pdf";
  const body = JSON.stringify({
    file_name: fileName,
    language: options.language ?? "en",
    enable_table: options.enableTable ?? true,
    is_ocr: options.isOcr ?? true,
    enable_formula: options.enableFormula ?? false,
    page_range: options.pageRange,
  });

  const raw = await fetchJson("POST", `${AGENT_API}/parse/file`, body, { "Content-Type": "application/json" });
  const result = JSON.parse(raw) as { code: number; data: { task_id: string; file_url: string }; message?: string };
  if (result.code !== 0) {
    throw new Error(`MinerU Agent submit failed: ${result.code} - ${result.message ?? JSON.stringify(result).slice(0, 200)}`);
  }
  return { taskId: result.data.task_id, fileUrl: result.data.file_url };
}

async function pollAgentResult(taskId: string, timeout = 300_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const raw = await fetchJson("GET", `${AGENT_API}/parse/${taskId}`, null, {});
    const result = JSON.parse(raw) as {
      code: number;
      data: { state: string; markdown_url?: string; err_msg?: string };
    };
    if (result.code !== 0) {
      throw new Error(`MinerU Agent poll error: ${result.code}`);
    }
    const state = result.data.state;
    if (state === "done" && result.data.markdown_url) {
      const mdBuffer = await fetchBuffer(result.data.markdown_url);
      return mdBuffer.toString("utf-8");
    }
    if (state === "failed") {
      throw new Error(`MinerU Agent failed: ${result.data.err_msg ?? "unknown"}`);
    }
    await sleep(3000);
  }
  throw new Error(`MinerU Agent poll timeout (${timeout / 1000}s)`);
}

async function submitBatchUpload(
  filePath: string,
  token: string,
  options: MineruOptions,
): Promise<{ batchId: string; fileUrl: string }> {
  const fileName = filePath.split(/[/\\]/).pop() ?? "document.pdf";
  const body = JSON.stringify({
    files: [{ name: fileName, is_ocr: options.isOcr ?? true, page_ranges: options.pageRange }],
    model_version: "vlm",
    language: options.language ?? "en",
    enable_table: options.enableTable ?? true,
    enable_formula: options.enableFormula ?? false,
  });

  const raw = await fetchJson(
    "POST",
    `${PRECISION_API}/file-urls/batch`,
    body,
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  );
  const result = JSON.parse(raw) as { code: number; data: { batch_id: string; file_urls: string[] }; msg?: string };
  if (result.code !== 0) {
    throw new Error(`MinerU batch upload submit failed: ${result.code} - ${result.msg ?? JSON.stringify(result).slice(0, 300)}`);
  }
  return { batchId: result.data.batch_id, fileUrl: result.data.file_urls[0] };
}

async function pollBatchResult(
  batchId: string,
  token: string,
  timeout = 600_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const raw = await fetchJson(
      "GET",
      `${PRECISION_API}/extract-results/batch/${batchId}`,
      null,
      { Authorization: `Bearer ${token}` },
    );
    const result = JSON.parse(raw) as {
      code: number;
      data: { extract_result: Array<{ state: string; full_zip_url?: string; err_msg?: string; file_name: string }> };
    };
    if (result.code !== 0) {
      throw new Error(`MinerU batch poll error: ${result.code}`);
    }
    const entry = result.data.extract_result?.[0];
    if (!entry) {
      await sleep(3000);
      continue;
    }
    if (entry.state === "done" && entry.full_zip_url) {
      return entry.full_zip_url;
    }
    if (entry.state === "failed") {
      throw new Error(`MinerU parse failed: ${entry.err_msg ?? "unknown"}`);
    }
    await sleep(3000);
  }
  throw new Error(`MinerU batch poll timeout (${timeout / 1000}s)`);
}

async function extractZip(zipUrl: string, saveZipTo?: string): Promise<{ fullMd: string; contentList: MineruContentItem[]; imagesByName: Map<string, string> }> {
  const zipBuffer = await fetchBuffer(zipUrl);
  const tmpDir = await mkdtemp(join(tmpdir(), "mineru-"));
  const zipPath = join(tmpDir, "result.zip");

  try {
    if (saveZipTo) {
      await mkdir(join(saveZipTo, ".."), { recursive: true });
      await writeFile(saveZipTo, zipBuffer);
      logger.info(`MinerU ZIP saved to ${saveZipTo}`);
    }
    await writeFile(zipPath, zipBuffer);

    const extractDir = join(tmpDir, "extracted");
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
      { timeout: 60000, stdio: "pipe" },
    );

    let fullMd = "";
    const mdPath = join(extractDir, "full.md");
    if (existsSync(mdPath)) {
      fullMd = await readFile(mdPath, "utf-8");
    }

    const imagesByName = new Map<string, string>();
    const files = readdirSync(extractDir);
    const clFile = files.find(f => /_content_list(_v\d+)?\.json$/.test(f));
    let items: MineruContentItem[] = [];

    if (clFile) {
      const clRaw = await readFile(join(extractDir, clFile), "utf-8");
      const parsed = JSON.parse(clRaw);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && Array.isArray(parsed[0])) {
          items = parsed.flat() as MineruContentItem[];
        } else {
          items = parsed as MineruContentItem[];
        }
      }
    }

    const imgDir = join(extractDir, "images");
    if (existsSync(imgDir)) {
      for (const item of items) {
        if (item.type === "image" && item.img_path) {
          const imgFileName = item.img_path.replace("images/", "").replace(/^.*[/\\]/, "");
          if (!imagesByName.has(imgFileName)) {
            const imgPath = join(imgDir, imgFileName);
            if (existsSync(imgPath)) {
              const imgBuffer = await readFile(imgPath);
              imagesByName.set(imgFileName, imgBuffer.toString("base64"));
            }
          }
        }
      }
    }

    if (items.length === 0 && fullMd) {
      fullMd = await embedMdImages(fullMd, imgDir, imagesByName);
    }

    return { fullMd, contentList: items, imagesByName };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function embedMdImages(markdown: string, imgDir: string, images: Map<string, string>): Promise<string> {
  if (!existsSync(imgDir)) return markdown;
  const imgRegex = /!\[([^\]]*)\]\(images\/([^)]+)\)/g;
  let result = markdown;
  const pending = new Map<string, string>();

  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(markdown)) !== null) {
    const filename = match[2];
    if (!pending.has(filename) && !images.has(filename)) {
      const imgPath = join(imgDir, filename);
      if (existsSync(imgPath)) {
        const buffer = await readFile(imgPath);
        pending.set(filename, `data:image/jpeg;base64,${buffer.toString("base64")}`);
      }
    }
  }

  for (const [filename, b64] of pending) {
    images.set(filename, b64.replace(/^data:image\/jpeg;base64,/, ""));
    result = result.replace(
      new RegExp(`!\\[[^\\]]*\\]\\(images\\/${filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "g"),
      `![image](${b64})`,
    );
  }

  return result;
}

function buildPagesFromContentList(
  items: MineruContentItem[],
  images: Map<string, string>,
): PageContent[] {
  if (items.length === 0) return [];

  const pageMap = new Map<number, string[]>();

  for (const item of items) {
    const pageIdx = item.page_idx;
    if (!pageMap.has(pageIdx)) pageMap.set(pageIdx, []);

    const lines = pageMap.get(pageIdx)!;
    switch (item.type) {
      case "text":
        if (item.text) {
          const prefix = item.text_level ? `${"#".repeat(item.text_level)} ` : "";
          lines.push(`${prefix}${item.text}`);
        }
        break;
      case "table":
        if (item.table_body) {
          lines.push(item.table_body);
        }
        break;
      case "equation":
        lines.push(`$$${item.text ?? ""}$$`);
        break;
      case "image":
        if (item.img_path) {
          const imgFileName = item.img_path.replace("images/", "").replace(/^.*[/\\]/, "");
          const b64 = images.get(imgFileName);
          if (b64) {
            lines.push(`![image](data:image/jpeg;base64,${b64})`);
          }
        } else if (item.image_caption?.length) {
          lines.push(`*${item.image_caption.join(" ")}*`);
        }
        break;
    }
  }

  const pages: PageContent[] = [];
  for (const [pageIdx, pageLines] of pageMap) {
    pages.push({
      page: pageIdx + 1,
      markdown: pageLines.join("\n\n"),
      isBilingual: false,
    });
  }

  return pages.sort((a, b) => a.page - b.page);
}

function buildPagesFromMarkdown(markdown: string): PageContent[] {
  return [{
    page: 1,
    markdown,
    isBilingual: false,
  }];
}

async function callMineruAgentOcr(filePath: string, options: MineruOptions): Promise<OcrResult> {
  logger.info(`MinerU Agent: submitting ${filePath}`);
  const { taskId, fileUrl } = await submitAgentFile(filePath, options);

  logger.info(`MinerU Agent: uploading file (${filePath})`);
  const fileBuffer = await readFile(filePath);
  await fetchPut(fileUrl, fileBuffer);

  logger.info(`MinerU Agent: polling task ${taskId}`);
  const markdown = await pollAgentResult(taskId);

  logger.info(`MinerU Agent: done, got ${markdown.length} chars`);
  return { pages: buildPagesFromMarkdown(markdown), images: new Map() };
}

async function callMineruPrecisionOcr(filePath: string, token: string, options: MineruOptions): Promise<OcrResult> {
  logger.info(`MinerU Precision: submitting ${filePath}`);

  const { batchId, fileUrl } = await submitBatchUpload(filePath, token, options);

  logger.info(`MinerU Precision: uploading file (${filePath}) (batch: ${batchId})`);
  const fileBuffer = await readFile(filePath);
  await fetchPut(fileUrl, fileBuffer);

  logger.info(`MinerU Precision: polling batch ${batchId}`);
  const zipUrl = await pollBatchResult(batchId, token);

  logger.info(`MinerU Precision: downloading ZIP from ${zipUrl}`);
  const zipCacheName = filePath.split(/[/\\]/).pop()?.replace(/\.pdf$/i, "") ?? "unknown";
  const zipCachePath = join("data", ".cache", "raw-zip", `${zipCacheName}-mineru.zip`);
  const { fullMd, contentList, imagesByName } = await extractZip(zipUrl, zipCachePath);

  const pages = contentList.length > 0
    ? buildPagesFromContentList(contentList, imagesByName)
    : buildPagesFromMarkdown(fullMd);

  const pageImages = new Map<number, string>();
  let imgSeq = 0;
  for (const item of contentList) {
    if (item.type === "image" && item.img_path) {
      const imgFileName = item.img_path.replace("images/", "").replace(/^.*[/\\]/, "");
      const b64 = imagesByName.get(imgFileName);
      if (b64) {
        imgSeq++;
        pageImages.set(imgSeq, b64);
      }
    }
  }

  logger.info(`MinerU Precision: done, ${pages.length} pages, ${pageImages.size} page-images`);
  return { pages, images: pageImages };
}

export async function callMineruOcr(filePath: string, options?: MineruOptions): Promise<OcrResult> {
  return rateLimiter.call(async () => {
    const opts = options ?? {};
    const token = getApiKey();

    if (token) {
      return callMineruPrecisionOcr(filePath, token, opts);
    }
    logger.warn("MINERU_API_KEY not set, falling back to Agent API (10MB / 20pp limit)");
    return callMineruAgentOcr(filePath, opts);
  });
}
