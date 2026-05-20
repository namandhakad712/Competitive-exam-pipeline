import { loadEnvFile } from "node:process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(__dirname, "..", ".env"));

interface Provider {
  name: string;
  key: string;
  url: string;
  model: string;
  headers: Record<string, string>;
  body: (model: string) => unknown;
  parseResponse: (data: unknown) => string;
  keyName: string;
}

const SIMPLE_PROMPT = "Reply with exactly one word: OK. Do not say anything else.";

const PROVIDERS: Provider[] = [
  {
    name: "NVIDIA NIM",
    key: process.env.NVIDIA_API_KEY ?? "",
    keyName: "NVIDIA_API_KEY",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NVIDIA_API_KEY ?? ""}` },
    body: (m) => ({
      model: m,
      messages: [{ role: "user", content: SIMPLE_PROMPT }],
      temperature: 0.1,
      max_tokens: 10,
    }),
    parseResponse: (d: any) => d.choices?.[0]?.message?.content ?? "",
  },
  {
    name: "Cerebras",
    key: process.env.CEREBRAS_API_KEY ?? "",
    keyName: "CEREBRAS_API_KEY",
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "cerebras-llama-3.3-70b",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CEREBRAS_API_KEY ?? ""}` },
    body: (m) => ({
      model: m,
      messages: [{ role: "user", content: SIMPLE_PROMPT }],
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
    model: "gemini-2.5-flash",
    headers: { "Content-Type": "application/json" },
    body: () => ({
      contents: [{ role: "user", parts: [{ text: SIMPLE_PROMPT }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 10 },
    }),
    parseResponse: (d: any) => d.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
  },
  {
    name: "LongCat",
    key: process.env.LONGCAT_API_KEY ?? "",
    keyName: "LONGCAT_API_KEY",
    url: "https://api.longcat.ai/v1/chat/completions",
    model: "longcat-flash-lite",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LONGCAT_API_KEY ?? ""}` },
    body: (m) => ({
      model: m,
      messages: [{ role: "user", content: SIMPLE_PROMPT }],
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
    model: "poolside/laguna-m.1",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.POOLSIDE_API_KEY ?? ""}` },
    body: (m) => ({
      model: m,
      messages: [{ role: "user", content: SIMPLE_PROMPT }],
      temperature: 0.1,
      max_tokens: 10,
    }),
    parseResponse: (d: any) => d.choices?.[0]?.message?.content ?? "",
  },
  {
    name: "Vanchin (KAT-Coder)",
    key: process.env.VC_API_KEY ?? "",
    keyName: "VC_API_KEY",
    url: "https://vanchin.streamlake.ai/api/gateway/v1/endpoints",
    model: "ep-8jt098-1774548880917375225",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VC_API_KEY ?? ""}` },
    body: (m) => ({
      model: m,
      messages: [{ role: "user", content: SIMPLE_PROMPT }],
      temperature: 0.1,
      max_tokens: 10,
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
      body: JSON.stringify(p.body(p.model)),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return `  FAIL  | HTTP ${response.status}: ${body.slice(0, 100)}`;
    }

    const data = await response.json();
    const text = (p.parseResponse(data) ?? "").trim();

    if (text.toUpperCase() === "OK") return `  OK    | Responded correctly`;
    if (text) return `  WARN  | Unexpected: "${text.slice(0, 50)}"`;
    return `  WARN  | Empty response`;
  } catch (err) {
    return `  FAIL  | ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function main() {
  console.log("\nModel Health Check — Testing all configured providers\n");

  const models = [
    ["NVIDIA NIM", "meta-llama/llama-4-scout-17b-16e-instruct"],
    ["Cerebras", "cerebras-llama-3.3-70b"],
    ["Gemini 2.5 Flash", "gemini-2.5-flash"],
    ["LongCat", "longcat-flash-lite"],
    ["Poolside", "poolside/laguna-m.1"],
    ["Vanchin", "ep-8jt098-1774548880917375225 (KAT-Coder-Air-V1)"],
  ];
  console.log("Pipeline priority order:");
  for (const [name, model] of models) {
    console.log(`  ${name.padEnd(20)} → ${model}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("Provider            | Status | Detail");
  console.log("-".repeat(70));

  let pass = 0, fail = 0, skip = 0;
  for (const p of PROVIDERS) {
    const status = await testProvider(p);
    const icon = status.includes("OK") ? " ✅" : status.includes("SKIP") ? " ⏭️" : " ❌";
    if (status.includes("OK")) pass++;
    else if (status.includes("SKIP")) skip++;
    else fail++;
    console.log(`${icon} ${p.name.padEnd(20)} | ${status}`);
  }

  console.log("-".repeat(70));
  console.log(`\nResult: ${pass} passed, ${fail} failed, ${skip} skipped (of ${PROVIDERS.length} total)\n`);
  if (fail > 0) console.log("Some providers failed. Check your API keys or network.\n");
  if (pass > 0) console.log("At least one provider works — pipeline is ready.\n");
}

main().catch(console.error);
