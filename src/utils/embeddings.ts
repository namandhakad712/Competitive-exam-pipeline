import { logger } from "./logger.js";
import { RateLimiter } from "./rate-limiter.js";

const MISTRAL_API = "https://api.mistral.ai/v1/embeddings";
const MISTRAL_KEY = process.env.MISTRAL_API_KEY ?? "";

const rateLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60_000 });

const embeddingCache = new Map<string, number[]>();

export async function embed(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase();

  if (embeddingCache.has(key)) {
    return embeddingCache.get(key)!;
  }

  return rateLimiter.call(async () => {
    const response = await fetch(MISTRAL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-embed",
        input: [text],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Mistral Embeddings API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    const embedding = data.data[0].embedding;
    embeddingCache.set(key, embedding);
    return embedding;
  });
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export async function semanticSimilarity(a: string, b: string): Promise<number> {
  const [embA, embB] = await Promise.all([embed(a), embed(b)]);
  return cosineSimilarity(embA, embB);
}
