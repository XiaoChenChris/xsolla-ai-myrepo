import { describe, expect, it } from "vitest";
import { reviewRepository } from "../src/core.js";
import { renderReport } from "../src/report.js";

describe("reviewRepository", () => {
  it("returns a structured result with a resolved base ref by default", async () => {
    const result = await reviewRepository({
      repositoryPath: ".",
      validationCommands: ["node --version"],
    });
    expect(result.baseRef).toBeTruthy();
    expect(result.validationResults[0].status).toBe("passed");
    expect(result.ok).toBe(true);
  });

  it("renders a markdown report with the base ref", async () => {
    const result = await reviewRepository({ repositoryPath: "." });
    const report = renderReport(result, "markdown");
    expect(report).toContain("# Review Report");
    expect(report).toContain("Base ref:");
  });

  it("renders valid JSON when format is json", async () => {
    const result = await reviewRepository({ repositoryPath: "." });
    const report = renderReport(result, "json");
    const parsed = JSON.parse(report) as {
      repositoryPath: string;
      baseRef: string;
      changedFiles: unknown[];
      validationResults: unknown[];
      ok: boolean;
    };
    expect(parsed.repositoryPath).toBe(".");
    expect(parsed.baseRef).toBeTruthy();
    expect(Array.isArray(parsed.changedFiles)).toBe(true);
    expect(Array.isArray(parsed.validationResults)).toBe(true);
  });

  it("marks ok=false when a validation command fails", async () => {
    const result = await reviewRepository({
      repositoryPath: ".",
      validationCommands: ["node -e \"process.exit(2)\""],
    });
    expect(result.ok).toBe(false);
    expect(result.validationResults[0].status).toBe("failed");
  });
});
