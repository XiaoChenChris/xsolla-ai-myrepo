import { changedFiles } from "./git.js";
import { jsonReport, markdownReport, type ReportInput } from "./report.js";
import type { ReviewRequest } from "./types.js";
import { runValidations } from "./validation.js";

export async function reviewRepository(request: ReviewRequest): Promise<string> {
  const files = changedFiles(request.repositoryPath, request.baseRef);
  const validations = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
  );

  const reportInput: ReportInput = {
    repositoryPath: request.repositoryPath,
    changedFiles: files,
    validationResults: validations,
  };

  return request.format === "json"
    ? jsonReport(reportInput)
    : markdownReport(reportInput);
}
