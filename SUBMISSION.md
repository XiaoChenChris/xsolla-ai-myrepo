# Submission

## What did you investigate first, and why?

I started by establishing a verified baseline: `npm install`, `npm run typecheck`,
and `npm test` all pass, so the starter is healthy on its happy path. I then read
every source file end-to-end (`types.ts` → `core.ts` → `cli.ts` / `mcp-server.ts`
→ `git.ts` / `validation.ts` → `report.ts`) and mapped the declared contract
(`ReviewRequest`, `ChangeStatus`, `ValidationResult`) against the implementation.

The most productive investigation was *behavioral*, not just static: I ran the
real tool against real inputs. That immediately surfaced three concrete failures
that reading alone only hinted at:

- `npm run inspector -- review --repo .` produced an **empty report** on a fresh
  repo because the default base ref is hard-coded to `main`.
- `--validate "git rev-parse HEAD~1"` **crashed the whole CLI** with `Fatal
  error` instead of recording a `failed` validation.
- A raw JSON-RPC call to the MCP server with `repo_path: "."` returned
  `# Review Report: undefined` — the schema key (`repo_path`) and the handler
  read (`input.repoPath`) disagreed, so the path was silently swallowed.

That confirmed the README's claim: the starter works for a narrow happy path
but breaks down under production use. It also told me which weaknesses to
prioritize: contract mismatches and crash-on-failure are worse than cosmetic
issues, and both happened to be the most visible ones.

## What did you choose to implement or fix?

Prioritized by "silent wrongness / crash" > "missing capability" > "polish":

1. **MCP contract bug (highest priority).** Unified the tool schema on
   `repoPath` (camelCase) to match the CLI flag and the core `ReviewRequest`
   contract; the handler now reads `input.repoPath` via the zod-inferred type
   instead of `input: any`. Verified over a real stdio JSON-RPC exchange.
2. **Validation no longer kills the review.** `runValidation` resolves
   `status: "failed"` on non-zero exit instead of rejecting; added a default
   timeout (120s) and output truncation (64KB) so a hung or chatty command
   cannot wedge the CLI or blow up an MCP client's context.
3. **Git inspection robustness.** Auto-detect the default branch
   (`origin/HEAD` → `main`/`master` → current branch) instead of hard-coding
   `main`; full status mapping (A/M/D/R/C/T/U — including the `R100`/`C75`
   similarity-suffix case that was mis-parsed as `modified`); untracked files
   now appear (previously declared in the type but never produced); git
   failures surface as a readable `GitError`.
4. **Output contract honored.** `format: "json"` now actually works
   (`jsonReport`), Markdown escaping keeps hostile paths/commands from breaking
   the report, and long output is bounded at the report layer too.
5. **CLI hardening.** `--repo` paths with spaces are no longer truncated,
   `--format` is validated, `--output` selects the report file, `--help` is
   added, and unknown options fail loudly instead of being ignored.
6. **Tests.** Grew from 1 happy-path test to 23 tests covering git parsing,
   validation failure/timeout/truncation, markdown escaping, JSON output,
   core orchestration, and CLI arg parsing.

## What did you intentionally not do?

- **No sandboxing/whitelisting of validation commands.** The trust boundary I
  chose (see Interface decision) trusts the CLI user; I bounded execution with
  a timeout and output cap rather than inventing a command allow-list that
  would break `npm test`-style workflows.
- **No staged-vs-unstaged diff modes.** The tool reviews committed changes
  against a base ref, matching the README's contract; working-tree-only review
  would change the semantics and deserves its own decision.
- **No parallelism for validations.** Commands run sequentially on purpose —
  order can matter (e.g. `typecheck` before `test`), and it keeps output
  deterministic.
- **No README/doc rewrite.** The documented CLI usage stays valid; I treated
  behavior consistency as the higher-value contract than new prose.
- **No CI changes.** `public-checks.yml` already runs typecheck + build + test,
  which is exactly the verification loop I used locally.

## Interface decision

- Decision: **hybrid** — CLI-first for humans, MCP for AI agents, one shared core
- Primary user and execution environment:
  - **CLI**: developers running reviews locally or in CI, pointed at repos they
    control. Interactive and scriptable (`npm run inspector -- review ...`).
  - **MCP**: AI coding agents calling `review_repository` over stdio while
    working inside a repo. The tool is consumed programmatically; output goes
    into the agent's context window.
- Trust boundary and allowed capabilities:
  - CLI trusts the user: they own the repo path and choose validation commands
    (`--validate "npm test"`). Arbitrary shell execution is acceptable here but
    must be bounded (timeout) and must not crash the whole review on failure.
  - MCP is reached through an agent that may act on untrusted input (e.g. a
    path derived from external content). The MCP surface therefore keeps
    capabilities identical to the CLI but enforces stricter output bounds
    (truncation) so a huge log cannot blow up the agent's context, and returns
    structured errors instead of dying.
- Reliability, discoverability, latency/context, and output tradeoffs:
  - Reliability: validation failures are recorded as `failed` results, never a
    process crash; git errors are surfaced as readable messages.
  - Discoverability: CLI gets usage/`--help`; MCP exposes a zod-validated
    schema with descriptions.
  - Latency/context: validations run with a timeout and bounded output; MCP
    responses are truncated, CLI can emit full reports to a file.
  - Output: `--format markdown|json` honored by both interfaces; Markdown
    escaping keeps reports valid even with hostile paths/output.
- How supported interfaces remain consistent:
  - Both adapters call the same `reviewRepository()` in `src/core.ts` with the
    same `ReviewRequest` contract, so behavior cannot drift. The MCP schema
    field is `repoPath` (camelCase), matching the CLI flag and the core
    contract — the previous `repo_path`/`repoPath` mismatch that silently
    swallowed the path is fixed.
- Evidence that would change this decision:
  - Usage telemetry showing AI agents are the dominant consumer (and humans
    rarely use the CLI) → pivot to MCP-first with a thin CLI wrapper.
  - Conversely, if teams adopt the tool purely as a local dev utility and MCP
    uptake stays near zero → simplify to CLI-first and drop the MCP surface.

## How did you use an AI coding agent?

The agent did the heavy lifting in three modes, and I verified every step:

1. **Investigation assistant.** I asked it to walk the whole codebase and
   enumerate weaknesses mapped to the README's dimensions (correctness,
   safety, reliability, contract, output, testing). Its list matched my own
   read of the code; the highest-value findings were then confirmed
   behaviorally, not taken on trust.
2. **Implementation partner.** It produced the code for each fix (MCP schema,
   validation semantics, git parsing, report rendering, CLI parsing) as I
   specified the contract; I reviewed each diff before running anything.
3. **Test author.** It wrote the first pass of the unit tests; I then ran them,
   and several failed in ways that exposed bad assumptions (see below), which
   I corrected and re-verified.

The rule I applied throughout: the agent's claims were treated as
hypotheses until a command (typecheck, `npm test`, a real CLI/MCP invocation)
confirmed them.

## Where did you check, correct, or reject an AI suggestion? (required)

1. **Rejected: "just rename the MCP field to camelCase and move on."** The
   agent's first cut only changed the schema key. I checked the handler and
   rejected the fix as incomplete: `input: any` still bypassed the zod-derived
   type, so the same class of bug could recur. I required the handler to read
   the schema-validated input with full type inference, and verified the whole
   thing over a real JSON-RPC exchange.
2. **Corrected: rename detection "works fine" claim.** The agent asserted the
   git status mapping was correct. My end-to-end run showed `renamed.txt`
   reported as `modified` with path `c.txt\trenamed.txt`. I reproduced raw
   `git diff --name-status` output manually: renames come back as `R100` (with
   a similarity score), which the string-based `switch` never matched. I fixed
   `mapStatus` to key off `code[0]` and added a regression test. This was the
   most valuable correction — a silently-wrong status is worse than a crash.
3. **Rejected: a unit-test suggestion that hid the real issue.** The agent's
   first test for "deleted files" staged a deletion without committing, then
   asserted the diff showed it. It failed. The agent wanted to adjust the
   assertion; I checked git semantics instead — `base...HEAD` only compares
   commits, so the test scenario itself was invalid. I rewrote the scenario to
   commit before diffing, and kept the code as-is. Testing the tool wrong
   would have masked a real regression later.
4. **Corrected: default-branch assumption.** The agent initially kept
   `baseRef ?? "main"` and called it acceptable. I demonstrated the empty
   report on a repo whose HEAD is `main` and whose branches have no
   `origin/HEAD`; the hard-coded default was rejected in favor of
   auto-detection with fallbacks.

## Commands used to verify the result, with outcomes

| Command | Outcome |
|---|---|
| `npm install` | OK (1 allow-scripts warning for esbuild, non-blocking) |
| `npm run typecheck` | Passed, strict mode, no errors |
| `npm test` | **23/23 passed** (was 1/1) |
| `npm run inspector -- review --repo .` | Exit 0; report lists untracked files (was empty) |
| `npm run inspector -- review --repo . --validate "git rev-parse HEAD~1"` | Exit 0; validation recorded as **failed** (was: crash, exit 1) |
| `npm run inspector -- review --repo . --format json` | Exit 0; valid JSON written to `review-report.json` |
| `npm run inspector -- review --repo "<path with spaces>"` | Exit 0; path parsed intact, report written (was: truncated path) |
| `npm run inspector -- --help` | Usage printed; unknown option `--format xml` → exit 1 with clear error |
| MCP stdio JSON-RPC `tools/call` with `repoPath` | Returns `# Review Report: <path>` (was `undefined`) |
| `git diff --name-status -M <base>...HEAD` (manual, temp repo) | Confirms `R100`/`A`/`D`/`M` raw formats used for parsing tests |

## A blocker you hit and how you approached it

The stubborn one was rename detection. The report claimed a rename was a
`modified` file whose path was `c.txt\trenamed.txt` — a tab-joined string that
made no sense. Rather than patching the symptom, I built a throwaway temp repo
in the shell and ran `git diff --name-status -M` directly to see the raw
output: `R100\tc.txt\trenamed.txt`. The status code carries a similarity score
(`R100`), which defeated the exact-match `switch`. Fixing the parser to key off
the leading character solved it and let me write a regression test against the
*real* git output instead of an imagined one. The lesson: when a parsing bug
survives, stop reading code and ask the underlying command what it actually
emits.

## Known limitations and the next three things you would do

Limitations: validations run sequentially and share one global timeout; output
truncation may cut meaningful tails of very long logs; working-tree-only
changes are not reviewed (committed diff only); MCP responses are plain text
rather than structured JSON per tool result; rename similarity threshold is
git's default.

Next three things:
1. Add a `--staged`/working-tree review mode so developers can inspect
   uncommitted changes — the natural next consumer need.
2. Parallelize independent validations with per-command timeouts and a
   configurable concurrency cap, keeping the order in the report.
3. Return structured JSON from the MCP tool (result schema with typed
   `changedFiles`/`validationResults`) so AI clients can consume data directly
   instead of parsing prose.

## Approximate focused-work time

- Start: 18:30 (2026-08-17)
- Finish: ~19:50 (2026-08-17)
