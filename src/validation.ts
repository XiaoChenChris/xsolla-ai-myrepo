import { exec } from "node:child_process";
import type { ValidationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 64_000;

export type RunValidationOptions = {
  timeoutMs?: number;
  maxOutputChars?: number;
};

function truncateOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;
  const kept = maxChars > 200 ? maxChars - 200 : 0;
  return `${output.slice(0, kept)}\n… [output truncated: ${output.length - maxChars} more chars]`;
}

export function runValidation(
  command: string,
  cwd: string,
  options: RunValidationOptions = {},
): Promise<ValidationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = options.maxOutputChars ?? MAX_OUTPUT_CHARS;

  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: timeoutMs, encoding: "utf8" },
      (error, stdout, stderr) => {
        const output = truncateOutput(`${stdout}${stderr}`.trim(), maxOutputChars);
        if (error) {
          const reason =
            error.killed && error.signal
              ? `timed out after ${timeoutMs}ms`
              : error.message;
          resolve({
            command,
            status: "failed",
            output: output || `Command failed: ${reason}`,
          });
          return;
        }
        resolve({ command, status: "passed", output });
      },
    );
  });
}

export async function runValidations(commands: string[], cwd: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd));
  }
  return results;
}
