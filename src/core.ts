import { changedFiles, defaultBranch } from "./git.js";
import type { ReviewRequest, ReviewResult } from "./types.js";
import { runValidations } from "./validation.js";

/**
 * 审查编排：解析 base ref、收集变更、串行执行校验，
 * 返回结构化结果。渲染（markdown/json）由适配器调用 renderReport 完成。
 */
export async function reviewRepository(request: ReviewRequest): Promise<ReviewResult> {
  const baseRef = request.baseRef ?? defaultBranch(request.repositoryPath);
  const files = changedFiles(request.repositoryPath, baseRef);
  const validations = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
  );
  const ok = validations.every((result) => result.status === "passed");

  return {
    repositoryPath: request.repositoryPath,
    baseRef,
    changedFiles: files,
    validationResults: validations,
    ok,
  };
}
