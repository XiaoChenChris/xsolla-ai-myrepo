# Submission

## What did I investigate first, and why?

I first established a verified baseline: `npm install`, `npm run typecheck`,
and `npm test` all pass, which showed the starter was healthy on the happy
path. Then I read every source file end to end (`types.ts` → `core.ts` →
`cli.ts` / `mcp-server.ts` → `git.ts` / `validation.ts` → `report.ts`) and
compared the declared contracts (`ReviewRequest`, `ChangeStatus`,
`ValidationResult`) against their implementations one by one.

The most valuable part of the investigation was not static reading but
**behavioural verification**: I ran the real tool against real inputs. That
immediately exposed three concrete failures that reading alone only hinted at:

- `npm run inspector -- review --repo .` produced an **empty report** on a new
  repository, because the default base ref was hardcoded to `main`.
- `--validate "git rev-parse HEAD~1"` crashed the whole CLI with a `Fatal
  error` instead of recording a `failed` validation result.
- Calling the MCP server with raw JSON-RPC and passing `repo_path: "."`
  returned `# Review Report: undefined` — the schema key (`repo_path`) and the
  key the handler read (`input.repoPath`) did not match, and the path was
  silently swallowed.

This confirmed what the README claimed: the starter only works on a narrow
happy path and breaks under production use. It also told me what to fix first:
contract mismatches and "fail fast by crashing" matter more than cosmetic
issues, and those two were also the most visible.

## What did I choose to implement or fix?

Prioritised as "silent failure / crash" > "missing capability" > "polish":

1. **MCP contract bug (highest priority).** Unified the tool schema on
   `repoPath` (camelCase), consistent with the CLI flag and the core
   `ReviewRequest` contract; the handler now reads `input.repoPath` through the
   zod-inferred type instead of `input: any`. Verified through a real stdio
   JSON-RPC interaction.
2. **A failing validation no longer aborts the whole review.** `runValidation`
   resolves `status: "failed"` on a non-zero exit instead of rejecting; added a
   default timeout (120 s) and output truncation (64 KB), so a hung or chatty
   command cannot stall the CLI or blow up an MCP client's context.
3. **Git inspection robustness.** Default branch is now auto-detected
   (`origin/HEAD` → `main`/`master` → current branch) instead of hardcoded
   `main`; full status mapping (A/M/D/R/C/T/U — including the `R100`/`C75`
   similarity suffixes that were previously mis-parsed as `modified`);
   untracked files now appear in the report (previously declared in the types
   but never produced); git failures surface as readable `GitError`s.
4. **Output contract fulfilled.** `format: "json"` actually works now
   (`jsonReport`); Markdown escaping keeps malicious paths/commands from
   breaking the report structure; over-long output is capped at the report
   layer too.
5. **CLI hardening.** `--repo` paths containing spaces are no longer truncated;
   `--format` is validated; `--output` selects the report file; `--help` added;
   unknown options fail loudly instead of being ignored.
6. **Tests.** Expanded from 1 happy-path test to 35 tests covering git parsing,
   validation failure/timeout/truncation, Markdown escaping, JSON output, core
   orchestration, CLI argument parsing, and end-to-end exit codes.

## Post-review hardening before submission (2026-08-19)

Before the final commit I did an independent review of the code and fixed three
defects that were previously missed:

1. **Large-repository crash.** The `git` calls used `execFileSync`'s default
   1 MB `maxBuffer`; a large repo whose diff output exceeded that limit crashed
   the whole review. Raised to 32 MB, closing the last "validations don't
   crash but git parsing does" gap.
2. **The MCP error surface did not match the stated contract.** The tool
   handler turned an invalid path into a JSON-RPC error, contradicting the
   decision to "return structured errors instead of dying". It now catches and
   returns `isError: true` text an agent can act on instead of a bare error.
3. **Markdown newline injection.** `escapeInline` did not escape newlines, and
   git file names can legally contain them, which could break the report
   structure. Escaped, with a regression test.

Also added `vitest.config.ts` to exclude stale build artifacts under `dist/`:
vitest had been collecting the compiled test copies too and running them twice
(10 test files instead of 6).

## Second post-review pass (2026-08-19)

After reviewing a public reference implementation, I adopted three
product-level improvements:

1. **Structured `ReviewResult` + separated rendering.** `reviewRepository()`
   now returns a data object (resolved `baseRef` plus an `ok` summary);
   Markdown/JSON rendering moved into a standalone `renderReport()`, shared by
   CLI and MCP, so behaviour cannot drift.
2. **CLI exit codes 0/1/2.** 0 = all passed, 1 = usage or inspector error,
   2 = validation failed — CI can gate on the exit code instead of parsing the
   report text; `--help` documents the semantics.
3. **Actionable no-merge-base errors.** Under a shallow clone (`--depth 1`) or
   unrelated history, `base...HEAD` has no common ancestor and crashed with raw
   git fatal text; when merge-base is missing the tool now returns an
   actionable hint (pass an explicit `--base-ref` or run
   `git fetch --unshallow`), with a regression test.

## Third hardening pass (2026-08-19)

Reviewing a second public reference implementation added three more fixes:

1. **Fence-safe code blocks.** The report's code fence is now computed to be
   longer than any run of backticks in the validation output, so untrusted
   output cannot escape the code block and render attacker-chosen Markdown.
2. **Bare-repository guard.** `git rev-parse --is-inside-work-tree` prints
   `false` but exits 0 for a bare repo, so checking the exit status alone let
   one through to fail later inside `ls-files --others`. The guard now checks
   the output value.
3. **MCP validation dedup.** Repeated validation names from a model are
   deduplicated before execution, so `["unit", "unit", "unit"]` runs the
   command once, not three times.

## What did I intentionally not do?

- **No sandbox or allowlist for validation commands.** My chosen trust boundary
  (see the interface decision) trusts the CLI user; I constrain execution with
  timeouts and output caps rather than inventing a command allowlist that would
  break workflows like `npm test`. **Evolution path:** if agents become the
  primary consumers, I would introduce an operator-configurable allowlist keyed
  by name (e.g. `INSPECTOR_ALLOWED_VALIDATIONS="unit=npm test"`, with the
  server read-only and advertising `readOnlyHint` when unset) and have MCP
  return a structured summary (`changed_file_count`,
  `validations_passed`/`validations_failed`) so agents can triage without
  parsing Markdown — these two capabilities matter most in agent-dominated
  deployments.
- **No staged-vs-unstaged diff mode.** The tool reviews committed changes
  relative to a base ref, per the README contract; a worktree-only review mode
  changes the semantics and deserves its own decision.
- **No parallel validations.** Commands run serially on purpose — order can
  matter (e.g. `typecheck` before `test`) and serial execution keeps output
  deterministic.
- **No README/documentation rewrite.** The documented CLI usage still holds; I
  judged behavioural consistency a higher-value contract than new prose.
- **No CI changes.** `public-checks.yml` already runs typecheck + build + test,
  which is the same verification loop I used locally.

## Interface decision

- **Decision: hybrid** — CLI-first for humans, MCP for AI agents, sharing one
  core.
- Primary users and execution environments:
  - **CLI**: developers running reviews locally or in CI on repositories they
    control. Interactive and scriptable (`npm run inspector -- review ...`).
  - **MCP**: AI coding agents working inside a repository, calling
    `review_repository` over stdio. Output is consumed programmatically and
    lands in the agent's context window.
- Trust boundary and allowed capabilities:
  - The CLI trusts the user: repository path and validation commands
    (`--validate "npm test"`) are the user's own choice. Arbitrary shell
    execution is allowed but constrained (timeout), and a single failed
    validation must never crash the whole review.
  - MCP is reached through an agent that may process untrusted input (e.g.
    paths derived from external content). It therefore keeps the same
    capabilities as the CLI but enforces stricter output caps (truncation) so
    huge logs cannot blow up the agent's context, and returns structured errors
    instead of dying.
- Reliability, discoverability, latency/context, and output tradeoffs:
  - Reliability: a failed validation is recorded as a `failed` result and never
    crashes the process; git errors surface as readable messages.
  - Discoverability: the CLI has usage text and `--help`; MCP exposes a
    described zod schema.
  - Latency/context: validations have timeouts and bounded output; MCP
    responses are truncated while the CLI can write the full report to a file.
  - Output: both interfaces honour `--format markdown|json`; Markdown escaping
    keeps the report valid even against malicious paths or output.
- How the supported interfaces stay consistent:
  - Both adapters call the same `reviewRepository()` in `src/core.ts` with the
    same `ReviewRequest` contract, so behaviour cannot drift. The MCP schema
    field is `repoPath` (camelCase), matching the CLI flag and the core
    contract — the earlier `repo_path`/`repoPath` mismatch that silently
    swallowed the path is fixed.
- Evidence that would change this decision:
  - Telemetry showing agents are the dominant consumers (humans rarely use the
    CLI) → pivot to MCP-first, with the CLI as a thin wrapper.
  - Conversely, if the team treats it purely as a local dev tool with near-zero
    MCP adoption → simplify to CLI-first and drop the MCP surface.

## How did I use an AI coding agent?

The agent did the heavy lifting in three modes, and I verified every step:

1. **Investigation assistant.** I had it traverse the codebase and enumerate
   defects along the README's dimensions (correctness, safety, reliability,
   contract, output, tests). Its list matched my own reading; the most valuable
   findings were then confirmed behaviourally rather than taken on faith.
2. **Implementation partner.** Once I specified the contracts, it produced the
   code for each fix (MCP schema, validation semantics, git parsing, report
   rendering, CLI parsing); I reviewed every diff before running it.
3. **Test author.** It wrote the first drafts of the unit tests; I ran them,
   several failed by exposing wrong assumptions (below), and I corrected and
   re-verified them.

The principle throughout: treat every claim from the agent as a hypothesis
until a command (typecheck, `npm test`, a real CLI/MCP invocation) confirms it.

## Where did I check, correct, or reject an AI suggestion? (required)

1. **Rejected: "just change the MCP fields to camelCase."** The agent's first
   version only renamed the schema keys. I inspected the handler and rejected
   the incomplete fix: `input: any` still bypassed the zod-inferred type, and
   the same class of bug would recur. I required the handler to read the
   schema-validated input with full type inference, and verified the whole
   thing through a real JSON-RPC interaction.
2. **Corrected: "rename detection is fine."** The agent asserted the git status
   mapping was correct. My end-to-end run showed `renamed.txt` reported as
   `modified` with path `c.txt\trenamed.txt`. I reproduced the raw
   `git diff --name-status` output by hand: renames return `R100` (with a
   similarity score), so an exact-string `switch` could never match. I changed
   `mapStatus` to match on `code[0]` and added a regression test. This was the
   most valuable correction — silently wrong statuses are worse than crashes.
3. **Rejected: a unit test that masked the real problem.** The agent's first
   test for deleted files staged the deletion without committing and asserted
   the diff would show it. It failed. The agent wanted to change the assertion;
   I checked git semantics instead — `base...HEAD` only compares commits, so
   the test scenario itself was invalid. I changed the scenario to commit
   first, then diff, leaving the code untouched. Testing the tool the wrong
   way hides real future regressions.
4. **Corrected: the default-branch assumption.** The agent kept
   `baseRef ?? "main"` and called it acceptable. I demonstrated an empty report
   on a repo whose HEAD was `main` with no `origin/HEAD`; the hardcoded default
   was rejected in favour of auto-detection with fallbacks.

## Commands used to verify the result, with outcomes

| Command | Outcome |
|---|---|
| `npm install` | Success (one allow-scripts warning from esbuild, non-blocking) |
| `npm run typecheck` | Passes, strict mode, no errors |
| `npm test` | **35/35 passing** (originally 1/1) |
| `npm run inspector -- review --repo .` | Exit 0; report lists untracked files (originally empty) |
| `npm run inspector -- review --repo . --validate "git rev-parse HEAD~1"` | Exit 0; validation recorded as **failed** (originally: crash, exit 1) |
| Scratch repo `--validate "node -e process.exit(1)"` (end-to-end) | Exit **2**, report contains `[failed, exit 1]` (CI can detect the failure) |
| Unrelated-history repo (fetch, then `base...HEAD` with no common ancestor) | Actionable "No merge base … fetch --unshallow" error (originally: raw fatal crash) |
| `npm run inspector -- review --repo . --format json` | Exit 0; valid JSON written to `review-report.json` |
| `npm run inspector -- review --repo "<path with spaces>"` | Exit 0; path parsed intact, report written (originally: path truncated) |
| `npm run inspector -- --help` | Prints usage; unknown option `--format xml` → exit 1 with a clear error |
| MCP stdio JSON-RPC `tools/call` with `repoPath` | Returns `# Review Report: <path>` (originally `undefined`) |
| `git diff --name-status -M <base>...HEAD` (manual, scratch repo) | Confirms the raw `R100`/`A`/`D`/`M` formats the parser tests rely on |

## A blocker I hit, and how I approached it

The most stubborn issue was rename detection. The report claimed a rename was
a `modified` file with the path `c.txt\trenamed.txt` — a tab-joined string that
made no sense. Instead of patching the symptom, I built a throwaway scratch
repo in the shell and ran `git diff --name-status -M` to see the raw output:
`R100\tc.txt\trenamed.txt`. The status code carries a similarity score
(`R100`), which defeated the exact-match `switch`. Changing the parser to match
on the first character fixed it, and let me write the regression test against
git's **real** output rather than imagined output. Lesson: when a parsing bug
keeps resisting fixes, stop reading code and ask the underlying command what it
actually emits.

## Known limitations and the next three things I would do

Limitations: validations run serially with a shared global timeout; truncation
can cut the meaningful tail of a very long log; only committed diffs are
reviewed, not changes that exist purely in the worktree; MCP responses are
plain text rather than structured JSON per tool result; the rename similarity
threshold uses git's default.

Next three things:
1. Add a `--staged`/worktree review mode so developers can inspect uncommitted
   changes — the most natural next user need.
2. Parallelise independent validations with per-command timeouts and a
   configurable concurrency cap, while preserving report order.
3. Have the MCP tool return structured JSON (a typed
   `changedFiles`/`validationResults` result schema) so AI clients consume
   data directly instead of parsing prose.

## Approximate focused-work time

- Start: 18:30 (2026-08-17)
- Finish: ~19:50 (2026-08-17)
