import { describe, expect, it } from "vitest";
import { jsonReport, markdownReport } from "../src/report.js";

describe("markdownReport", () => {
  it("lists changed files and validation output", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "src/index.ts", status: "modified" }],
      validationResults: [{ command: "npm test", status: "passed", output: "ok" }],
    });

    expect(report).toContain("src/index.ts (modified)");
    expect(report).toContain("npm test");
    expect(report).toContain("ok");
  });

  it("escapes markdown special characters in paths", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "a[1].md*", status: "modified" }],
      validationResults: [],
    });

    expect(report).toContain("a\\[1\\].md\\*");
  });

  it("escapes backticks in commands", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [],
      validationResults: [{ command: "echo `hi`", status: "passed", output: "" }],
    });

    expect(report).toContain("echo \\`hi\\`");
  });

  it("truncates very long validation output", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [],
      validationResults: [{ command: "big", status: "passed", output: "x".repeat(200_000) }],
    });

    expect(report).toContain("[truncated]");
  });

  it("shows renamed files with their old path", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "new.ts", status: "renamed", oldPath: "old.ts" }],
      validationResults: [],
    });

    expect(report).toContain("new.ts (renamed) (from old.ts)");
  });
});

describe("jsonReport", () => {
  it("produces valid JSON with the full report structure", () => {
    const report = jsonReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "a.ts", status: "added" }],
      validationResults: [{ command: "t", status: "failed", output: "err" }],
    });

    const parsed = JSON.parse(report) as {
      changedFiles: { status: string }[];
      validationResults: { status: string }[];
    };
    expect(parsed.changedFiles[0].status).toBe("added");
    expect(parsed.validationResults[0].status).toBe("failed");
  });
});
