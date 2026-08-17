import type { ChangedFile, ValidationResult } from "./types.js";

export type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

const MAX_OUTPUT_CHARS = 128_000;

/** 截断超长输出，防止报告（尤其是 MCP 上下文）被撑爆。 */
function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… [truncated]`;
}

/** 转义 Markdown 行内特殊字符，防止路径/命令内容破坏报告结构。 */
function escapeInline(text: string): string {
  return text.replace(/([\\`*_[\]])/g, "\\$1");
}

export function markdownReport(input: ReportInput): string {
  const lines = [
    `# Review Report: ${escapeInline(input.repositoryPath)}`,
    "",
    "## Changed files",
  ];

  for (const file of input.changedFiles) {
    const path = escapeInline(file.path);
    const oldPath = file.oldPath ? ` (from ${escapeInline(file.oldPath)})` : "";
    lines.push(`- ${path} (${file.status})${oldPath}`);
  }

  lines.push("", "## Validation output");
  for (const result of input.validationResults) {
    lines.push(`### ${escapeInline(result.command)}`);
    lines.push(`**${result.status}**`);
    lines.push("```");
    lines.push(truncate(result.output));
    lines.push("```");
  }

  return lines.join("\n");
}

export function jsonReport(input: ReportInput): string {
  return JSON.stringify(input, null, 2);
}
