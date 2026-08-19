#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { reviewRepository } from "./core.js";
import { renderReport } from "./report.js";
import type { ReportFormat, ReviewRequest } from "./types.js";

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

Exit codes:
  0  Review completed and all validations passed
  1  Usage error or inspector error
  2  Review completed but at least one validation failed
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

function defaultOutputPath(format: ReportFormat): string {
  return format === "json" ? "review-report.json" : "review-report.md";
}

function printUsage(): void {
  console.error(
    "Usage: inspector review --repo <path> [--base-ref <ref>] [--validate <command>] [--format markdown|json] [--output <file>]",
  );
}

/**
 * CLI 入口，返回退出码：0=全部通过，1=用法/检查器错误，2=校验失败（CI 友好）。
 */
export async function runCli(argv: string[]): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    return 1;
  }

  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  if (args.command !== "review" || !args.repositoryPath) {
    printUsage();
    return 1;
  }

  const format = args.format ?? "markdown";
  if (format !== "markdown" && format !== "json") {
    console.error(`Unsupported format: ${format} (use markdown or json)`);
    return 1;
  }

  try {
    const request: ReviewRequest = {
      repositoryPath: args.repositoryPath,
      baseRef: args.baseRef,
      validationCommands: args.validations,
      format,
    };

    const result = await reviewRepository(request);
    const report = renderReport(result, format);

    const outputFile = args.output ?? defaultOutputPath(format);
    writeFileSync(resolve(outputFile), report, "utf8");
    console.log(`Review report written to ${outputFile}`);

    return result.ok ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2));
}

// vitest import 该模块时不应真的执行 CLI
if (!process.env.VITEST) {
  main().catch((error) => {
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
