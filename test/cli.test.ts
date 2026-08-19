import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs, runCli } from "../src/cli.js";

describe("parseArgs", () => {
  it("keeps repo paths with spaces intact", () => {
    const args = parseArgs([
      "review",
      "--repo",
      "C:/My Project/repo",
      "--base-ref",
      "main",
      "--format",
      "json",
      "--validate",
      "npm test",
    ]);
    expect(args.command).toBe("review");
    expect(args.repositoryPath).toBe("C:/My Project/repo");
    expect(args.baseRef).toBe("main");
    expect(args.format).toBe("json");
    expect(args.validations).toEqual(["npm test"]);
  });

  it("collects repeated --validate flags", () => {
    const args = parseArgs(["review", "--repo", ".", "--validate", "a", "--validate", "b"]);
    expect(args.validations).toEqual(["a", "b"]);
  });

  it("parses --output", () => {
    const args = parseArgs(["review", "--repo", ".", "--output", "out.json"]);
    expect(args.output).toBe("out.json");
  });

  it("sets help flag", () => {
    const args = parseArgs(["--help"]);
    expect(args.help).toBe(true);
  });

  it("throws on unknown options", () => {
    expect(() => parseArgs(["review", "--bogus"])).toThrow(/Unknown option/);
  });
});

describe("runCli", () => {
  let repoDir: string;
  let outDir: string;

  function runGit(args: string[]): void {
    execFileSync("git", args, { cwd: repoDir, encoding: "utf8" });
  }

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "inspector-cli-repo-"));
    outDir = mkdtempSync(join(tmpdir(), "inspector-cli-out-"));
    runGit(["init", "-b", "main"]);
    runGit(["config", "user.email", "test@example.com"]);
    runGit(["config", "user.name", "Test"]);
    runGit(["config", "core.autocrlf", "false"]);
    writeFileSync(join(repoDir, "a.txt"), "base\n");
    runGit(["add", "."]);
    runGit(["commit", "-m", "base"]);
    runGit(["checkout", "-b", "feature"]);
    writeFileSync(join(repoDir, "a.txt"), "changed\n");
    runGit(["commit", "-am", "change"]);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  });

  it("writes the report and exits 0 when validations pass", async () => {
    const outputPath = join(outDir, "report.md");
    const exitCode = await runCli([
      "review",
      "--repo",
      repoDir,
      "--base-ref",
      "main",
      "--output",
      outputPath,
    ]);

    expect(exitCode).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath, "utf8")).toContain("a.txt (modified)");
  });

  it("exits 2 when a validation command fails", async () => {
    const outputPath = join(outDir, "report.md");
    const exitCode = await runCli([
      "review",
      "--repo",
      repoDir,
      "--base-ref",
      "main",
      "--validate",
      'node -e "process.exit(1)"',
      "--output",
      outputPath,
    ]);

    expect(exitCode).toBe(2);
    expect(readFileSync(outputPath, "utf8")).toContain("[failed, exit 1]");
  });

  it("exits 1 with no report on usage and inspector errors", async () => {
    const outputPath = join(outDir, "report.md");
    expect(await runCli(["review"])).toBe(1);
    expect(await runCli(["review", "--repo", outDir, "--output", outputPath])).toBe(1);
    expect(existsSync(outputPath)).toBe(false);
  });
});
