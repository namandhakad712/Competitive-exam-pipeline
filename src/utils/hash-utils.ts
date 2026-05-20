import { createHash } from "crypto";

export function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function computeChecksum(obj: Record<string, unknown>): string {
  const clone = { ...obj };
  delete (clone as Record<string, unknown>).checksum;
  const json = JSON.stringify(clone, Object.keys(clone).sort());
  return sha256(json);
}

export function hashFileContent(content: string): string {
  return sha256(content);
}

export function questionTextHash(text: string, options: string[] | null): string {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  const opts = options?.map(o => o.replace(/\s+/g, " ").trim().toLowerCase()).join("|") ?? "";
  return sha256(normalized + "||" + opts);
}
