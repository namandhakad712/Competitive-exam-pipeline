import { loadEnvFile } from "node:process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(__dirname, "..", ".env"));

interface Provider {
  name: string;
  key: string;
  url: string;
  headers: Record<string, string>;
  body: () => unknown;
  parseResponse: (data: unknown) => string;
  keyName: string;
  timeout: number;
}

const PROVIDERS: Provider[] = [
  {
    name: "NVIDIA DeepSeek V4 Flash",
    key: process.env.NVIDIA_API_KEY ?? "",
    keyName: "NVIDIA_API_KEY",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    timeout: 60_000,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NVIDIA_API_KEY ?? ""}` },
    body: () => ({
      model: "deepseek-ai/deepseek-v4-flash",
      messages: [{ role: "user", content: "Reply with exactly one word: OK" }],
      temperature: 0.1,
      max_tokens: 10,
    }),
    parseResponse: (d: any) => d.choices?.[0]?.message?.content ?? "",
  },
  {
    name: "LongCat Flash Lite",
    key: process.env.LONGCAT_API_KEY ?? "",
    keyName: "LONGCAT_API_KEY",
    url: "https://api.longcat.chat/openai/v1/chat/completions",
    timeout: 30_000,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LONGCAT_API_KEY ?? ""}` },
    body: () => ({
      model: "LongCat-Flash-Lite",
      messages: [{ role: "user", content: "Reply with exactly one word: OK" }],
      temperature: 0.1,
      max_tokens: 10,
    }),
    parseResponse: (d: any) => d.choices?.[0]?.message?.content ?? "",
  },
  {
    name: "Poolside",
    key: process.env.POOLSIDE_API_KEY ?? "",
    keyName: "POOLSIDE_API_KEY",
    url: "https://inference.poolside.ai/v1/chat/completions",
    timeout: 30_000,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.POOLSIDE_API_KEY ?? ""}` },
    body: () => ({
      model: "poolside/laguna-m.1",
      messages: [{ role: "user", content: "Reply with exactly one word: OK" }],
      temperature: 0.1,
      max_tokens: 10,
    }),
    parseResponse: (d: any) => d.choices?.[0]?.message?.content ?? "",
  },
  {
    name: "Vanchin KAT-Coder",
    key: process.env.VC_API_KEY ?? "",
    keyName: "VC_API_KEY",
    url: "https://vanchin.streamlake.ai/api/gateway/v1/endpoints/chat/completions",
    timeout: 30_000,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VC_API_KEY ?? ""}` },
    body: () => ({
      model: "ep-8jt098-1774548880917375225",
      messages: [{ role: "user", content: "Reply with exactly one word: OK" }],
      temperature: 0.1,
      max_tokens: 10,
    }),
    parseResponse: (d: any) => d.choices?.[0]?.message?.content ?? "",
  },
  {
    name: "Gemini 2.5 Flash",
    key: process.env.GEMINI_API_KEY ?? "",
    keyName: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    timeout: 30_000,
    headers: { "Content-Type": "application/json" },
    body: () => ({
      contents: [{ role: "user", parts: [{ text: "Reply with exactly one word: OK" }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 10 },
    }),
    parseResponse: (d: any) => d.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
  },
  {
    name: "Cerebras",
    key: process.env.CEREBRAS_API_KEY ?? "",
    keyName: "CEREBRAS_API_KEY",
    url: "https://api.cerebras.ai/v1/chat/completions",
    timeout: 30_000,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CEREBRAS_API_KEY ?? ""}` },
    body: () => ({
      model: "gpt-oss-120b",
      messages: [{ role: "user", content: "Reply with exactly one word: OK" }],
      temperature: 0.1,
      max_completion_tokens: 10,
    }),
    parseResponse: (d: any) => d.choices?.[0]?.message?.content ?? "",
  },
];

async function testProvider(p: Provider): Promise<string> {
  if (!p.key || p.key === "xxx") return `  SKIP  | No API key (${p.keyName})`;

  try {
    const url = p.name === "Gemini 2.5 Flash" ? `${p.url}?key=${p.key}` : p.url;
    const response = await fetch(url, {
      method: "POST",
      headers: p.headers,
      body: JSON.stringify(p.body()),
      signal: AbortSignal.timeout(p.timeout),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return `  FAIL  | HTTP ${response.status}: ${body.slice(0, 150)}`;
    }

    const data: any = await response.json();
    const text = (p.parseResponse(data) ?? "").trim();

    if (text.toUpperCase() === "OK") return `  OK    | Responded correctly`;
    if (text) return `  WARN  | Unexpected: "${text.slice(0, 50)}"`;
    return `  WARN  | Empty response — raw: ${JSON.stringify(data).slice(0, 200)}`;
  } catch (err) {
    return `  FAIL  | ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function main() {
  console.log("\nModel Health Check — Testing all configured providers\n");

  console.log("Pipeline priority order:");
  console.log("  1. NVIDIA DeepSeek V4 Flash   1M ctx, 40 RPM, 64K output");
  console.log("  2. LongCat Flash Lite         256K ctx, 30 RPM, 256K output, 50M tokens/day");
  console.log("  3. Poolside Laguna M.1        131K ctx, 30 RPM, 64K output");
  console.log("  4. Vanchin KAT-Coder          20 RPM, 2M TPM, 64K output");
  console.log("  5. Gemini 2.5 Flash           5 RPM, 250K TPM, 32K output");
  console.log("  6. Cerebras gpt-oss-120b      5 RPM, 65K ctx, 32K output");

  console.log("\n" + "=".repeat(70));
  console.log("Provider                 | Status | Detail");
  console.log("-".repeat(70));

  let pass = 0, fail = 0, skip = 0;
  for (const p of PROVIDERS) {
    const status = await testProvider(p);
    const icon = status.includes("OK") ? " ✅" : status.includes("SKIP") ? " ⏭️" : " ❌";
    if (status.includes("OK")) pass++;
    else if (status.includes("SKIP")) skip++;
    else fail++;
    console.log(`${icon} ${p.name.padEnd(25)} | ${status}`);
  }

  console.log("-".repeat(70));
  console.log(`\nResult: ${pass} passed, ${fail} failed, ${skip} skipped (of ${PROVIDERS.length} total)\n`);
  if (fail > 0) console.log("Some providers failed. Check API keys, network, or endpoint config.\n");
  if (pass > 0) console.log("At least one provider works — pipeline is ready.\n");
}

main().catch(console.error);
