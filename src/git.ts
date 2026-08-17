import { execFileSync } from "node:child_process";
import type { ChangeStatus, ChangedFile } from "./types.js";

/** git 命令失败时抛出的友好错误，避免把 execFileSync 的原生异常直接暴露给调用方。 */
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

function git(repositoryPath: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryPath,
      encoding: "utf8",
    }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new GitError(`git ${args.join(" ")} failed: ${detail}`);
  }
}

/** 探测仓库的默认分支：优先 origin/HEAD，其次 main/master 本地分支，最后当前分支。 */
export function defaultBranch(repositoryPath: string): string {
  try {
    const remoteHead = git(repositoryPath, [
      "symbolic-ref",
      "--short",
      "refs/remotes/origin/HEAD",
    ]);
    if (remoteHead) return remoteHead.replace(/^origin\//, "");
  } catch {
    // 无 origin/HEAD（如纯本地仓库），继续尝试本地默认分支名
  }
  for (const candidate of ["main", "master"]) {
    try {
      git(repositoryPath, ["rev-parse", "--verify", `refs/heads/${candidate}`]);
      return candidate;
    } catch {
      // 分支不存在，尝试下一个
    }
  }
  const current = git(repositoryPath, ["branch", "--show-current"]);
  if (current) return current;
  throw new GitError(`cannot determine default branch for "${repositoryPath}"`);
}

function mapStatus(code: string): ChangeStatus {
  // git diff --name-status 的状态码可能带相似度后缀（如 R100、C75）
  switch (code[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "M":
      return "modified";
    case "C":
      return "added"; // copy 视为新增
    case "T":
    case "U":
    default:
      return "modified"; // type change / unmerged / unknown 一律视为 modified
  }
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? defaultBranch(repositoryPath);
  const output = git(repositoryPath, ["diff", "--name-status", "-M", `${base}...HEAD`]);

  const files: ChangedFile[] = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const [code, ...pathParts] = line.split("\t");
    if (!code) continue;
    const status = mapStatus(code);
    if (status === "renamed" && pathParts.length >= 2) {
      // git diff --name-status 对 rename 输出 "R100\told\tnew"
      files.push({ path: pathParts[1], oldPath: pathParts[0], status });
    } else {
      files.push({ path: pathParts.join("\t"), status });
    }
  }

  // 未跟踪文件：git diff 看不到，需单独列出
  const untracked = git(repositoryPath, ["ls-files", "--others", "--exclude-standard"]);
  for (const path of untracked.split("\n")) {
    if (path) files.push({ path, status: "untracked" });
  }

  return files;
}
