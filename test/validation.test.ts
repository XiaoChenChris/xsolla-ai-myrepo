import { describe, expect, it } from "vitest";
import { runValidation, runValidations } from "../src/validation.js";

describe("runValidation", () => {
  it("resolves passed for a successful command", async () => {
    const result = await runValidation("node -e \"console.log('ok')\"", process.cwd());
    expect(result.status).toBe("passed");
    expect(result.output).toContain("ok");
  });

  it("resolves failed instead of rejecting on non-zero exit", async () => {
    const result = await runValidation(
      "node -e \"process.exit(3)\"",
      process.cwd(),
    );
    expect(result.status).toBe("failed");
  });

  it("truncates long output", async () => {
    const result = await runValidation(
      "node -e \"console.log('x'.repeat(100000))\"",
      process.cwd(),
      { maxOutputChars: 1000 },
    );
    expect(result.output.length).toBeLessThan(2000);
    expect(result.output).toContain("truncated");
  });

  it("reports timeout as failed", async () => {
    const result = await runValidation(
      "node -e \"setTimeout(()=>{}, 60000)\"",
      process.cwd(),
      { timeoutMs: 300 },
    );
    expect(result.status).toBe("failed");
    expect(result.output).toContain("timed out");
  }, 10_000);

  it("runs multiple commands in order", async () => {
    const results = await runValidations(
      ["node -e \"process.exit(0)\"", "node -e \"process.exit(1)\""],
      process.cwd(),
    );
    expect(results.map((r) => r.status)).toEqual(["passed", "failed"]);
  });
});
