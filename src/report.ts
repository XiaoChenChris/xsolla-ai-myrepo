import type { ReportFormat, ReviewResult } from "./types.js";

const MAX_OUTPUT_CHARS = 128_000;

/** 截断超长输出，防止报告（尤其是 MCP 上下文）被撑爆。 */
function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… [truncated]`;
}

/** 转义 Markdown 行内特殊字符，防止路径/命令内容破坏报告结构。 */
function escapeInline(text: string): string {
  // 换行/回车也必须转义：git 文件名可以合法包含换行，
  // 否则会插入新行破坏列表结构，甚至在标题处注入内容。
  return text.replace(/([\\`*_[\]\n\r])/g, (match) =>
    match === "\n" ? "\\n" : match === "\r" ? "\\r" : `\\${match}`,
  );
}

export function renderReport(result: ReviewResult, format: ReportFormat): string {
  return format === "json" ? jsonReport(result) : markdownReport(result);
}

export function markdownReport(result: ReviewResult): string {
  const lines = [
    `# Review Report: ${escapeInline(result.repositoryPath)}`,
    "",
    `Base ref: ${escapeInline(result.baseRef)}`,
    "",
    "## Changed files",
  ];

  if (result.changedFiles.length === 0) {
    lines.push("- (none)");
  } else {
    for (const file of result.changedFiles) {
      const path = escapeInline(file.path);
      const oldPath = file.oldPath ? ` (from ${escapeInline(file.oldPath)})` : "";
      lines.push(`- ${path} (${file.status})${oldPath}`);
    }
  }

  lines.push("", "## Validation output");
  if (result.validationResults.length === 0) {
    lines.push("- (none)");
  } else {
    for (const item of result.validationResults) {
      lines.push(
        `### ${escapeInline(item.command)} [${item.status}, exit ${item.exitCode}]`,
        "```",
        truncate(item.output) || "(no output)",
        "```",
      );
    }
  }

  return lines.join("\n");
}

export function jsonReport(result: ReviewResult): string {
  return JSON.stringify(result, null, 2);
}
