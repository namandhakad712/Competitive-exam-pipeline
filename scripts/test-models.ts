import { loadEnvFile } from "node:process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(__dirname, "..", ".env"));

interface Provider {
  name: string;
  key: string;
  url: string;
  body: Record<string, unknown>;
  keyName: string;
}

const PROVIDERS: Provider[] = [
  {
    name: "NVIDIA Qwen3 Coder 480B",
    key: process.env.NVIDIA_API_KEY ?? "", keyName: "NVIDIA_API_KEY",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    body: { model: "qwen/qwen3-coder-480b-a35b-instruct", messages: [{ role: "user", content: "hi" }], max_tokens: 5 },
  },
  {
    name: "LongCat Flash Lite",
    key: process.env.LONGCAT_API_KEY ?? "", keyName: "LONGCAT_API_KEY",
    url: "https://api.longcat.chat/openai/v1/chat/completions",
    body: { model: "LongCat-Flash-Lite", messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
  },
  {
    name: "Poolside",
    key: process.env.POOLSIDE_API_KEY ?? "", keyName: "POOLSIDE_API_KEY",
    url: "https://inference.poolside.ai/v1/chat/completions",
    body: { model: "poolside/laguna-m.1", messages: [{ role: "user", content: "hi" }], max_tokens: 1, chat_template_kwargs: { enable_thinking: false } },
  },
  {
    name: "Vanchin KAT-Coder",
    key: process.env.VC_API_KEY ?? "", keyName: "VC_API_KEY",
    url: "https://vanchin.streamlake.ai/api/gateway/v1/endpoints/chat/completions",
    body: { model: "ep-8jt098-1774548880917375225", messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
  },
  {
    name: "Gemini 2.5 Flash",
    key: process.env.GEMINI_API_KEY ?? "", keyName: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    body: { contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } },
  },
  {
    name: "Cerebras",
    key: process.env.CEREBRAS_API_KEY ?? "", keyName: "CEREBRAS_API_KEY",
    url: "https://api.cerebras.ai/v1/chat/completions",
    body: { model: "gpt-oss-120b", messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
  },
];

async function test(p: Provider): Promise<string> {
  if (!p.key || p.key === "xxx") return "SKIP (no key)";
  try {
    const isGemini = p.name === "Gemini 2.5 Flash";
    const url = isGemini ? `${p.url}?key=${p.key}` : p.url;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!isGemini) headers["Authorization"] = `Bearer ${p.key}`;
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(p.body),
      signal: AbortSignal.timeout(120_000),
    });
    if (r.ok) return `✅ HTTP 200`;
    const body = await r.text().catch(() => "");
    return `❌ HTTP ${r.status} ${body.slice(0, 80)}`;
  } catch (e) {
    return `❌ ${e instanceof Error ? e.message : String(e)}`;
  }
}

const out = ["", "Model Health Check\n", "Provider                 | Result", "-".repeat(55)];
for (const p of PROVIDERS) {
  const result = await test(p);
  out.push(` ${result.startsWith("✅") ? "✅" : "❌"} ${p.name.padEnd(25)} | ${result}`);
}
console.log(out.join("\n"));
