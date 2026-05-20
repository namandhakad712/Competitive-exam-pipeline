#!/usr/bin/env node

import { logger } from "./utils/logger.js";

const [cmd, ...args] = process.argv.slice(2);

const commands: Record<string, string> = {
  scrape: "src/scrapers/nta-scraper.ts",
  batch: "scripts/batch-process.ts",
  review: "src/review/review-cli.ts",
  signoff: "src/review/batch-signoff.ts",
  verify: "src/utils/integrity.ts",
  stats: "scripts/stats.ts",
  export: "scripts/export-for-opensource.ts",
  "rebuild-index": "scripts/rebuild-index.ts",
  api: "src/api/server.ts",
};

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(`
question-pipeline v1.0.0

Usage:
  npm run <command> [-- <args>]

Commands:
  scrape         Download PDFs from NTA
  batch          Full pipeline: download -> OCR -> structure -> validate -> save
  review         Launch human review CLI
  signoff        Sign off a verified shift
  verify         Verify dataset integrity checksums
  stats          Print dataset statistics
  export         Export for open-source (adds license)
  rebuild-index  Regenerate data/index.json from disk
  api            Start local API server (port 3456)
`);
  process.exit(0);
}

if (!commands[cmd]) {
  logger.error(`Unknown command: ${cmd}. Use --help to see available commands.`);
  process.exit(1);
}

logger.info(`Running: ${cmd}`);
logger.debug(`Args: ${args.join(" ")}`);

const filePath = commands[cmd];

try {
  const mod = await import(`../${filePath.replace(/\.ts$/, ".js")}`);
  if (typeof mod.main === "function") await mod.main(args);
  else if (typeof mod.default === "function") await mod.default(args);
} catch (err) {
  logger.error(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
