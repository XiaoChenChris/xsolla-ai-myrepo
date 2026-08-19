import { describe, expect, it } from "vitest";
import { jsonReport, markdownReport } from "../src/report.js";
import type { ReviewResult } from "../src/types.js";

function sampleResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    repositoryPath: "/work/sample",
    baseRef: "main",
    changedFiles: [{ path: "src/index.ts", status: "modified" }],
    validationResults: [{ command: "npm test", status: "passed", output: "ok", exitCode: 0 }],
    ok: true,
    ...overrides,
  };
}

describe("markdownReport", () => {
  it("lists changed files and validation output", () => {
    const report = markdownReport(sampleResult());

    expect(report).toContain("src/index.ts (modified)");
    expect(report).toContain("npm test");
    expect(report).toContain("ok");
    expect(report).toContain("Base ref: main");
  });

  it("escapes markdown special characters in paths", () => {
    const report = markdownReport(
      sampleResult({ changedFiles: [{ path: "a[1].md*", status: "modified" }] }),
    );

    expect(report).toContain("a\\[1\\].md\\*");
  });

  it("escapes backticks in commands", () => {
    const report = markdownReport(
      sampleResult({
        changedFiles: [],
        validationResults: [{ command: "echo `hi`", status: "passed", output: "", exitCode: 0 }],
      }),
    );

    expect(report).toContain("echo \\`hi\\`");
  });

  it("escapes newlines in paths so they cannot break the report structure", () => {
    const report = markdownReport(
      sampleResult({ changedFiles: [{ path: "evil\n- injected", status: "modified" }] }),
    );

    expect(report).toContain("evil\\n- injected (modified)");
    // 换行未被转义时，"- injected (modified)" 会作为独立列表项注入；
    // 修复后它只能出现在转义路径内，不能单独成行
    expect(report.split("\n")).not.toContain("- injected (modified)");
  });

  it("truncates very long validation output", () => {
    const report = markdownReport(
      sampleResult({
        changedFiles: [],
        validationResults: [{ command: "big", status: "passed", output: "x".repeat(200_000), exitCode: 0 }],
      }),
    );

    expect(report).toContain("[truncated]");
  });

  it("shows renamed files with their old path", () => {
    const report = markdownReport(
      sampleResult({ changedFiles: [{ path: "new.ts", status: "renamed", oldPath: "old.ts" }] }),
    );

    expect(report).toContain("new.ts (renamed) (from old.ts)");
  });

  it("includes the exit code in validation output", () => {
    const report = markdownReport(
      sampleResult({
        changedFiles: [],
        validationResults: [{ command: "t", status: "failed", output: "err", exitCode: 2 }],
      }),
    );

    expect(report).toContain("[failed, exit 2]");
  });

  it("uses a fence longer than any backtick run in the output", () => {
    const report = markdownReport(
      sampleResult({
        changedFiles: [],
        validationResults: [{ command: "t", status: "failed", output: "a ``` b", exitCode: 1 }],
      }),
    );

    // 输出含三反引号时 fence 升为 4 个反引号，代码块不会被提前关闭
    expect(report).toContain("````\na ``` b\n````");
    // 报告里不存在裸的三反引号 fence 行
    expect(report.split("\n")).not.toContain("```");
  });

  it("shows (none) for empty changed files and validations", () => {
    const report = markdownReport(
      sampleResult({ changedFiles: [], validationResults: [] }),
    );

    expect(report).toContain("- (none)");
  });
});

describe("jsonReport", () => {
  it("produces valid JSON with the full report structure", () => {
    const report = jsonReport(sampleResult());

    const parsed = JSON.parse(report) as {
      baseRef: string;
      ok: boolean;
      changedFiles: { status: string }[];
      validationResults: { status: string; exitCode: number }[];
    };
    expect(parsed.baseRef).toBe("main");
    expect(parsed.ok).toBe(true);
    expect(parsed.changedFiles[0].status).toBe("modified");
    expect(parsed.validationResults[0].status).toBe("passed");
    expect(parsed.validationResults[0].exitCode).toBe(0);
  });
});
