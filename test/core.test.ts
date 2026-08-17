import { describe, expect, it } from "vitest";
import { reviewRepository } from "../src/core.js";

describe("reviewRepository", () => {
  it("returns a markdown report by default", async () => {
    const report = await reviewRepository({
      repositoryPath: ".",
      validationCommands: ["node --version"],
    });
    expect(report).toContain("# Review Report");
    expect(report).toContain("passed");
  });

  it("returns valid JSON when format is json", async () => {
    const report = await reviewRepository({
      repositoryPath: ".",
      format: "json",
    });
    const parsed = JSON.parse(report) as {
      repositoryPath: string;
      changedFiles: unknown[];
      validationResults: unknown[];
    };
    expect(parsed.repositoryPath).toBe(".");
    expect(Array.isArray(parsed.changedFiles)).toBe(true);
    expect(Array.isArray(parsed.validationResults)).toBe(true);
  });

  it("does not crash when a validation command fails", async () => {
    const report = await reviewRepository({
      repositoryPath: ".",
      validationCommands: ["node -e \"process.exit(2)\""],
    });
    expect(report).toContain("failed");
  });
});
