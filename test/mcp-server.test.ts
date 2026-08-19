import { describe, expect, it } from "vitest";
import { dedupe } from "../src/mcp-server.js";

describe("dedupe", () => {
  it("removes repeated validation names", () => {
    expect(dedupe(["unit", "unit", "lint"])).toEqual(["unit", "lint"]);
  });

  it("handles undefined and empty input", () => {
    expect(dedupe(undefined)).toEqual([]);
    expect(dedupe([])).toEqual([]);
  });
});
