#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { reviewRepository } from "./core.js";
import type { ReviewRequest } from "./types.js";

export type Args = {
  command?: string;
  repositoryPath?: string;
  baseRef?: string;
  format?: "markdown" | "json";
  validations: string[];
  output?: string;
  help: boolean;
};

const USAGE = `Usage: inspector review --repo <path> [options]

Options:
  --repo <path>        Git repository path to inspect (required)
  --base-ref <ref>     Base ref to diff against (default: repo's default branch)
  --validate <cmd>     Validation command to run (repeatable)
  --format <fmt>       Report format: markdown (default) | json
  --output <file>      Report output file (default: review-report.md|.json)
  --help               Show this help
`;

export function parseArgs(argv: string[]): Args {
  const args: Args = { validations: [], help: false };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    switch (token) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--repo":
        args.repositoryPath = argv[++index];
        break;
      case "--base-ref":
        args.baseRef = argv[++index];
        break;
      case "--format":
        args.format = argv[++index] as Args["format"];
        break;
      case "--validate":
        args.validations.push(argv[++index] ?? "");
        break;
      case "--output":
        args.output = argv[++index];
        break;
      default:
        // 第一个非选项参数是子命令（review）
        if (!token.startsWith("-") && !args.command) {
          args.command = token;
        } else if (token.startsWith("-")) {
          throw new Error(`Unknown option: ${token}`);
        }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return;
  }

  if (args.command !== "review" || !args.repositoryPath) {
    console.error("Usage: inspector review --repo <path> [--base-ref <ref>] [--validate <command>] [--format markdown|json] [--output <file>]");
    process.exitCode = 1;
    return;
  }

  const format = args.format ?? "markdown";
  if (format !== "markdown" && format !== "json") {
    console.error(`Unsupported format: ${format} (use markdown or json)`);
    process.exitCode = 1;
    return;
  }

  const request: ReviewRequest = {
    repositoryPath: args.repositoryPath,
    baseRef: args.baseRef,
    validationCommands: args.validations,
    format,
  };

  const report = await reviewRepository(request);

  const outputFile =
    args.output ?? (format === "json" ? "review-report.json" : "review-report.md");
  writeFileSync(resolve(outputFile), report, "utf8");
  console.log(`Review report written to ${outputFile}`);
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
