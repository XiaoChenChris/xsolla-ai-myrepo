import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.js";

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
