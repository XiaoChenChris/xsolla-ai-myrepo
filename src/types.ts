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
};

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
  format?: "markdown" | "json";
};
