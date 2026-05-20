import { writeFile, readFile } from "fs/promises";
import { join } from "path";
import { logger } from "../utils/logger.js";
import type { CrossValidationReport } from "./cross-validator.js";

function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '<span class="null">null</span>';
  if (typeof v === "boolean") return `<span class="bool">${v}</span>`;
  if (typeof v === "number") return `<span class="num">${v}</span>`;
  if (Array.isArray(v)) return `<pre>${escHtml(JSON.stringify(v, null, 2))}</pre>`;
  if (typeof v === "object") return `<pre>${escHtml(JSON.stringify(v, null, 2))}</pre>`;
  return `<span class="str">${escHtml(v)}</span>`;
}

function renderQuestionDiffs(report: CrossValidationReport): string {
  const diffItems = report.questionDiffs.filter(d => d.status !== "match");
  if (diffItems.length === 0) {
    return '<div class="perfect"><strong>All questions match!</strong> No human review needed.</div>';
  }

  let html = `<div class="summary">Diffs: ${report.differed} | Missing in A: ${report.missingInA} | Missing in B: ${report.missingInB}</div>`;
  html += `<table><tr><th>#</th><th>Status</th><th>Model A (${report.modelA})</th><th>Model B (${report.modelB})</th></tr>`;

  for (const d of diffItems) {
    const statusClass = d.status === "diff" ? "status-diff" : d.status === "missing-a" ? "status-missing-a" : "status-missing-b";
    const statusLabel = d.status === "diff" ? "Diff" : d.status === "missing-a" ? "Only in B" : "Only in A";
    const index = d.index + 1;

    if (d.status === "missing-a") {
      html += `<tr class="${statusClass}">
        <td>${index}</td>
        <td class="status">${statusLabel}</td>
        <td class="empty">—</td>
        <td>${renderValue(d.idB)}</td>
      </tr>`;
    } else if (d.status === "missing-b") {
      html += `<tr class="${statusClass}">
        <td>${index}</td>
        <td class="status">${statusLabel}</td>
        <td>${renderValue(d.idA)}</td>
        <td class="empty">—</td>
      </tr>`;
    } else {
      html += `<tr class="${statusClass}">
        <td>${index}</td>
        <td class="status">${statusLabel}</td>
        <td>ID: ${escHtml(d.idA)}</td>
        <td>ID: ${escHtml(d.idB)}</td>
      </tr>`;

      for (const df of d.diffs) {
        html += `<tr class="field-diff">
          <td colspan="2" class="field-name">${escHtml(df.field)}</td>
          <td>${renderValue(df.modelA)}</td>
          <td>${renderValue(df.modelB)}</td>
        </tr>`;
      }
    }
  }

  html += "</table>";
  return html;
}

function renderPassageDiffs(report: CrossValidationReport): string {
  const diffs = report.passageDiffs.filter(d => d.status !== "match");
  if (diffs.length === 0) return "";

  let html = "<h3>Passage Diffs</h3><table><tr><th>ID</th><th>Model A</th><th>Model B</th></tr>";
  for (const d of diffs) {
    html += `<tr><td>${escHtml(d.id)}</td>
      <td><pre>${escHtml(d.textA)}</pre></td>
      <td><pre>${escHtml(d.textB)}</pre></td>
    </tr>`;
  }
  html += "</table>";
  return html;
}

export function generateHtmlReport(report: CrossValidationReport): string {
  const matchPercent = report.totalQuestionsA
    ? ((report.matched / report.totalQuestionsA) * 100).toFixed(1)
    : "0.0";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Cross-Validation Report — ${escHtml(report.exam)} ${escHtml(report.year)} ${escHtml(report.shift)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto;
         padding: 20px; background: #f5f5f5; color: #222; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.2rem; margin-top: 24px; }
  .meta { background: #fff; padding: 12px 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.1);
          display: flex; gap: 24px; flex-wrap: wrap; }
  .meta-item { display: flex; flex-direction: column; }
  .meta-item .label { font-size: .75rem; text-transform: uppercase; color: #666; }
  .meta-item .value { font-size: 1.1rem; font-weight: 600; }
  .perfect { background: #e6ffe6; padding: 16px; border-radius: 8px; border: 1px solid #4caf50; }
  .summary { margin-bottom: 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px;
          overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  th { background: #eee; text-align: left; padding: 8px 12px; font-size: .85rem;
       text-transform: uppercase; letter-spacing: .5px; }
  td { padding: 8px 12px; border-top: 1px solid #eee; vertical-align: top; }
  pre { margin: 0; white-space: pre-wrap; font-size: .85rem; max-height: 120px; overflow-y: auto; }
  .status { font-weight: 700; text-transform: uppercase; font-size: .75rem; }
  .status-diff { background: #fff3e0; }
  .status-missing-a { background: #ffe0e0; }
  .status-missing-b { background: #e0e0ff; }
  .field-diff td { background: #fafafa; font-size: .85rem; }
  .field-name { font-family: monospace; font-weight: 600; color: #555; }
  .empty { color: #999; text-align: center; }
  .null { color: #999; font-style: italic; }
  .bool { color: #e67e22; }
  .num { color: #2980b9; }
  .str { color: #27ae60; }
  .footer { margin-top: 24px; font-size: .8rem; color: #888; }
</style>
</head>
<body>
  <h1>Cross-Validation Report</h1>
  <div class="meta">
    <div class="meta-item"><span class="label">Exam</span><span class="value">${escHtml(report.exam)}</span></div>
    <div class="meta-item"><span class="label">Year</span><span class="value">${escHtml(report.year)}</span></div>
    <div class="meta-item"><span class="label">Shift</span><span class="value">${escHtml(report.shift)}</span></div>
    <div class="meta-item"><span class="label">Model A</span><span class="value">${escHtml(report.modelA)}</span></div>
    <div class="meta-item"><span class="label">Model B</span><span class="value">${escHtml(report.modelB)}</span></div>
    <div class="meta-item"><span class="label">Match Rate</span><span class="value">${matchPercent}%</span></div>
    <div class="meta-item"><span class="label">Auto-Acceptable</span><span class="value">${report.autoAcceptable ? "Yes" : "No"}</span></div>
  </div>

  <h2>Question Summary</h2>
  <div class="meta">
    <div class="meta-item"><span class="label">Model A Total</span><span class="value">${report.totalQuestionsA}</span></div>
    <div class="meta-item"><span class="label">Model B Total</span><span class="value">${report.totalQuestionsB}</span></div>
    <div class="meta-item"><span class="label">Matched</span><span class="value">${report.matched}</span></div>
    <div class="meta-item"><span class="label">Differed</span><span class="value">${report.differed}</span></div>
    <div class="meta-item"><span class="label">Missing in A</span><span class="value">${report.missingInA}</span></div>
    <div class="meta-item"><span class="label">Missing in B</span><span class="value">${report.missingInB}</span></div>
  </div>

  <h2>Question Diffs</h2>
  ${renderQuestionDiffs(report)}

  ${renderPassageDiffs(report)}

  <div class="footer">
    Generated: ${escHtml(report.date)} | Pipeline cross-validation
  </div>
</body>
</html>`;
}

export async function generateAndSaveHtmlReport(
  report: CrossValidationReport,
  outputDir: string,
): Promise<string> {
  const html = generateHtmlReport(report);
  const filename = `cross-validate-${report.exam}-${report.year}-${report.shift}.html`;
  const filepath = join(outputDir, filename);
  await writeFile(filepath, html, "utf8");
  logger.info(`HTML report saved: ${filepath}`);
  return filepath;
}

export async function saveConsoleSummary(report: CrossValidationReport): Promise<void> {
  const matchPercent = report.totalQuestionsA
    ? ((report.matched / report.totalQuestionsA) * 100).toFixed(1)
    : "0.0";

  console.log("\n=== Cross-Validation Summary ===");
  console.log(`Exam:      ${report.exam} ${report.year} ${report.shift}`);
  console.log(`Models:    ${report.modelA} vs ${report.modelB}`);
  console.log(`Match:     ${report.matched}/${report.totalQuestionsA} (${matchPercent}%)`);
  console.log(`Diffs:     ${report.differed}`);
  console.log(`Missing A: ${report.missingInA}`);
  console.log(`Missing B: ${report.missingInB}`);
  console.log(`Auto:      ${report.autoAcceptable ? "YES — no review needed" : "NO — human review required"}`);
  console.log("");
}
