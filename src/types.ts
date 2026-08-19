export type ChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked";

export type ChangedFile = {
  path: string;
  status: ChangeStatus;
  /** 仅 renamed：变更前的路径。 */
  oldPath?: string;
};

export type ValidationResult = {
  command: string;
  status: "passed" | "failed";
  output: string;
  /** 退出码；超时（被 kill）时为 -1。 */
  exitCode: number;
};

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
  format?: "markdown" | "json";
};

export type ReviewResult = {
  repositoryPath: string;
  baseRef: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
  /** 全部校验通过时为 true，CLI 据此决定退出码。 */
  ok: boolean;
};

export type ReportFormat = "markdown" | "json";
