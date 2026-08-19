import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedFiles, defaultBranch } from "../src/git.js";

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("git inspection", () => {
  let repoDir: string;
  let baseCommit: string;

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), "inspector-test-"));
    runGit(repoDir, ["init", "-b", "main"]);
    runGit(repoDir, ["config", "user.email", "test@example.com"]);
    runGit(repoDir, ["config", "user.name", "Test"]);
    runGit(repoDir, ["config", "core.autocrlf", "false"]);
    // 初始提交包含 del.txt，这样后续删除它时能被 diff 看到
    writeFileSync(join(repoDir, "a.txt"), "a\n");
    writeFileSync(join(repoDir, "del.txt"), "x\n");
    runGit(repoDir, ["add", "."]);
    runGit(repoDir, ["commit", "-m", "initial"]);
    baseCommit = runGit(repoDir, ["rev-parse", "HEAD"]);
  });

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("detects the default branch", () => {
    expect(defaultBranch(repoDir)).toBe("main");
  });

  it("lists added, modified, deleted and untracked files with correct statuses", () => {
    writeFileSync(join(repoDir, "a.txt"), "a2\n"); // modified
    writeFileSync(join(repoDir, "b.txt"), "b\n"); // added
    runGit(repoDir, ["rm", "del.txt"]); // deleted
    runGit(repoDir, ["add", "-A"]);
    runGit(repoDir, ["commit", "-m", "wip"]);
    writeFileSync(join(repoDir, "new.txt"), "n\n"); // untracked（不提交）

    const files = changedFiles(repoDir, baseCommit);
    expect(files).toEqual(
      expect.arrayContaining([
        { path: "a.txt", status: "modified" },
        { path: "b.txt", status: "added" },
        { path: "del.txt", status: "deleted" },
        { path: "new.txt", status: "untracked" },
      ]),
    );
  });

  it("reports renames with the old path", () => {
    writeFileSync(join(repoDir, "c.txt"), "identical-content\n");
    runGit(repoDir, ["add", "c.txt"]);
    runGit(repoDir, ["commit", "-m", "add c"]);
    const beforeRename = runGit(repoDir, ["rev-parse", "HEAD"]);

    runGit(repoDir, ["mv", "c.txt", "renamed.txt"]);
    runGit(repoDir, ["commit", "-m", "rename"]);

    const files = changedFiles(repoDir, beforeRename);
    expect(files).toContainEqual({
      path: "renamed.txt",
      status: "renamed",
      oldPath: "c.txt",
    });
  });

  it("throws a friendly GitError for a non-repository path", () => {
    expect(() => changedFiles(tmpdir(), undefined)).toThrow(
      /Not a git repository|git .* failed|default branch/,
    );
  });

  it("rejects a bare repository up front", () => {
    const bareDir = join(tmpdir(), `inspector-bare-${Date.now()}`);
    execFileSync("git", ["init", "--bare", bareDir], { encoding: "utf8" });
    try {
      expect(() => changedFiles(bareDir, undefined)).toThrow(/bare|Not a git repository/);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("reports a friendly error when base and HEAD have no merge base", () => {
    // 构造无关历史：另一个独立仓库 fetch 进来后，base...HEAD 无共同祖先
    // （等价于 shallow clone / 重写历史的真实场景）
    const otherDir = mkdtempSync(join(tmpdir(), "inspector-other-"));
    try {
      runGit(otherDir, ["init", "-b", "main"]);
      runGit(otherDir, ["config", "user.email", "test@example.com"]);
      runGit(otherDir, ["config", "user.name", "Test"]);
      writeFileSync(join(otherDir, "x.txt"), "x\n");
      runGit(otherDir, ["add", "."]);
      runGit(otherDir, ["commit", "-m", "other"]);
      runGit(repoDir, ["fetch", otherDir, "HEAD"]);
      const otherSha = runGit(repoDir, ["rev-parse", "FETCH_HEAD"]);
      expect(() => changedFiles(repoDir, otherSha)).toThrow(/No merge base/);
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });
});
