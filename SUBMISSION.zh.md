# 提交说明（Submission）

## 你首先调查了什么，为什么？

我先建立了一个经过验证的基线：`npm install`、`npm run typecheck`、`npm test`
全部通过，说明起始代码在理想路径上是健康的。然后我端到端读完了每一个源文件
（`types.ts` → `core.ts` → `cli.ts` / `mcp-server.ts` → `git.ts` /
`validation.ts` → `report.ts`），并把声明的契约（`ReviewRequest`、
`ChangeStatus`、`ValidationResult`）与实现逐一比对。

最有价值的调查不是静态读代码，而是**行为验证**：我用真实输入跑了真实的工具。
这立刻暴露了三个具体故障，单靠读代码只能隐约猜到：

- `npm run inspector -- review --repo .` 在一个新仓库上产出了**空报告**，
  因为默认 base ref 被硬编码为 `main`。
- `--validate "git rev-parse HEAD~1"` 让整个 CLI 以 `Fatal error` **崩溃**，
  而不是记录一条 `failed` 的校验结果。
- 用原始 JSON-RPC 调用 MCP server 并传 `repo_path: "."`，返回的是
  `# Review Report: undefined`——schema 的键（`repo_path`）与处理器读取的键
  （`input.repoPath`）不一致，路径被静默吞掉了。

这证实了 README 的说法：起始代码只适用于狭窄的理想路径，在生产使用下会出问题。
它也告诉我该优先修哪些缺陷：契约不匹配和"失败即崩溃"比表面问题更严重，
而这两种恰好又是最显眼的。

## 你选择实现或修复了什么？

按"静默出错 / 崩溃" > "缺失能力" > "打磨"的优先级排序：

1. **MCP 契约 bug（最高优先级）**。把工具 schema 统一到 `repoPath`
   （camelCase），与 CLI flag 和核心 `ReviewRequest` 契约一致；处理器现在通过
   zod 推导的类型读取 `input.repoPath`，而不是用 `input: any`。通过真实的
   stdio JSON-RPC 交互验证过。
2. **校验失败不再终止整个审查**。`runValidation` 在非零退出时 resolve
   `status: "failed"`，而不是 reject；增加了默认超时（120 秒）和输出截断
   （64KB），挂死或刷屏的命令不会卡死 CLI 或撑爆 MCP 客户端的上下文。
3. **Git 检查健壮性**。自动探测默认分支（`origin/HEAD` → `main`/`master` →
   当前分支），不再硬编码 `main`；完整的状态映射（A/M/D/R/C/T/U——包括此前
   被错误解析为 `modified` 的 `R100`/`C75` 相似度后缀情形）；未跟踪文件现在
   会出现在报告里（此前在类型里声明了但从未产出）；git 失败以可读的
   `GitError` 呈现。
4. **输出契约兑现**。`format: "json"` 现在真正可用（`jsonReport`）；Markdown
   转义防止恶意路径/命令破坏报告结构；超长输出在报告层也做了上限。
5. **CLI 加固**。带空格的 `--repo` 路径不再被截断；`--format` 做了校验；
   `--output` 可选择报告文件；增加了 `--help`；未知选项大声报错而不是被忽略。
6. **测试**。从 1 个理想路径测试扩充到 31 个测试，覆盖 git 解析、校验失败/
   超时/截断、Markdown 转义、JSON 输出、核心编排、CLI 参数解析与端到端退出码。

## 提交前复查追加的修复（2026-08-19）

在最终提交前，我对代码做了一次独立复查，修复了三处此前遗漏的缺陷：

1. **大仓库崩溃**。`git` 调用此前使用 `execFileSync` 的默认 1MB `maxBuffer`，
   大仓库的 diff 输出一超限整个审查就崩。已提升到 32MB，补齐了"校验不崩但
   git 解析会崩"的最后一个漏洞。
2. **MCP 错误面没有兑现**。工具 handler 对无效路径会抛成 JSON-RPC 错误，
   与"返回结构化错误而不是直接死掉"的决策不符。现在 catch 后返回
   `isError: true` 的结构化文本，AI 代理可以据此行动而不是收到一个裸错误。
3. **Markdown 换行注入**。`escapeInline` 不转义换行，而 git 文件名可以合法
   包含换行，会插入新行破坏报告结构。已转义并加回归测试。

另外新增 `vitest.config.ts` 排除 `dist/` 下的旧构建产物，此前 vitest 会把
编译后的过期测试也收集进来重复执行（实测 10 个测试文件而非 6 个）。

## 提交前第二次复查的改进（2026-08-19）

对照一份公开的参考实现复查后，我采纳了三个产品级改进：

1. **结构化 `ReviewResult` + 渲染分离**。`reviewRepository()` 现在返回数据
   对象（含解析后的 `baseRef` 和 `ok` 汇总），Markdown/JSON 渲染移入独立的
   `renderReport()`，CLI 与 MCP 共享同一条渲染路径，行为不可能漂移。
2. **CLI 退出码 0/1/2**。0=全部通过，1=用法/检查器错误，2=校验失败——CI
   可以直接用退出码判断结果，而不再需要解析报告文本；`--help` 已同步说明
   退出码语义。
3. **no-merge-base 可操作错误**。shallow clone（`--depth 1`）或无关历史下
   `base...HEAD` 没有共同祖先会以原始 git fatal 文本崩溃；现在探测到
   merge-base 不存在时返回可操作提示（建议显式 `--base-ref` 或
   `git fetch --unshallow`），并有无关历史的回归测试。

测试相应扩展到 31 个，新增覆盖：runCli 端到端退出码（0/1/2）、exitCode 进
报告（超时 -1 哨兵）、空状态 `(none)` 渲染、no-merge-base 场景。

## 你有意未做哪些内容？

- **没有给校验命令做沙箱/白名单**。我选择的信任边界（见接口决策）信任 CLI
  用户；我用超时和输出上限来约束执行，而不是发明一个会打断 `npm test` 这类
  工作流的命令白名单。
- **没有做 staged-vs-unstaged 的 diff 模式**。工具审查的是相对基准 ref 的
  已提交变更，符合 README 的契约；只审查工作区的模式会改变语义，值得单独
  做决策。
- **没有并行化校验**。命令有意串行执行——顺序可能很重要（例如先 `typecheck`
  再 `test`），而且串行保证输出确定性。
- **没有重写 README/文档**。文档里写的 CLI 用法仍然有效；我认为行为一致性
  是比新增文字更高价值的契约。
- **没有改 CI**。`public-checks.yml` 已经跑 typecheck + build + test，这正是
  我在本地使用的验证闭环。

## 接口决策

- 决策：**混合模式**——对人类 CLI 优先，对 AI 代理用 MCP，共享同一个核心
- 主要用户与使用执行环境：
  - **CLI**：开发者在自己控制的仓库上本地或在 CI 中跑审查。可交互、可脚本化
    （`npm run inspector -- review ...`）。
  - **MCP**：AI 编码代理在仓库内工作时，通过 stdio 调用 `review_repository`。
    工具被程序化消费，输出进入代理的上下文窗口。
- 信任边界以及允许的能力范围：
  - CLI 信任用户：仓库路径和校验命令（`--validate "npm test"`）由用户自己
    决定。这里允许任意 shell 执行，但必须被约束（超时），且单个校验失败不能
    导致整个审查崩溃。
  - MCP 经由一个可能处理不可信输入的代理触达（例如从外部内容派生的路径）。
    因此 MCP 面保持与 CLI 相同的能力，但执行更严格的输出上限（截断），让
    巨大的日志无法撑爆代理的上下文，并返回结构化错误而不是直接死掉。
- 可靠性、可发现性、延迟/上下文、以及输出之间的取舍权衡：
  - 可靠性：校验失败记录为 `failed` 结果，绝不导致进程崩溃；git 错误以可读
    消息呈现。
  - 可发现性：CLI 提供用法说明和 `--help`；MCP 暴露带描述的 zod 校验 schema。
  - 延迟/上下文：校验带超时和有界输出；MCP 响应会被截断，CLI 可以把完整
    报告写入文件。
  - 输出：两个接口都兑现 `--format markdown|json`；Markdown 转义保证即使
    面对恶意路径/输出，报告也依然合法。
- 受支持的接口如何保持一致：
  - 两个适配器都用同一个 `ReviewRequest` 契约调用 `src/core.ts` 里的同一个
    `reviewRepository()`，行为不可能漂移。MCP schema 字段是 `repoPath`
    （camelCase），与 CLI flag 和核心契约一致——此前 `repo_path`/`repoPath`
    不匹配导致路径被静默吞掉的问题已修复。
- 可能改变该决策的证据：
  - 使用遥测显示 AI 代理是主要消费者（人类很少用 CLI）→ 转向 MCP 优先，
    CLI 退化为薄封装。
  - 反之，如果团队纯粹把它当本地开发工具用、MCP 采用率接近零 → 简化为
    CLI 优先并去掉 MCP 面。

## 你是如何使用 AI 编码代理的？

代理在三种模式下承担了重活，每一步我都做了验证：

1. **调查助手**。我让它遍历整个代码库，按 README 的维度（正确性、安全性、
   可靠性、契约、输出、测试）枚举缺陷。它的清单与我自己读代码的结论一致；
   其中价值最高的发现随后都通过行为验证确认，而不是直接采信。
2. **实现伙伴**。在我指定契约后，它产出每一项修复的代码（MCP schema、校验
   语义、git 解析、报告渲染、CLI 解析）；每个 diff 我在运行前都先审查。
3. **测试作者**。它写了单元测试的第一稿；然后我运行它们，其中几个以暴露
   错误假设的方式失败了（见下文），我做了修正并重新验证。

我全程贯彻的原则是：代理的主张一律视为假设，直到有命令（typecheck、
`npm test`、真实的 CLI/MCP 调用）确认它。

## 你在何处检查、纠正或否决了 AI 的建议？（必填）

1. **否决："把 MCP 字段改成 camelCase 就完事。"** 代理的第一版只改了 schema
   的键。我检查了处理器，否决了这个不完整的修复：`input: any` 仍然绕过 zod
   推导的类型，同类 bug 还会复发。我要求处理器读取经 schema 校验的输入并
   获得完整类型推导，并通过真实的 JSON-RPC 交互验证了整体。
2. **纠正："rename 检测没问题"的说法。** 代理断言 git 状态映射是正确的。我的
   端到端运行显示 `renamed.txt` 被报告为 `modified`，路径是
   `c.txt\trenamed.txt`。我手动复现了原始 `git diff --name-status` 输出：
   rename 返回 `R100`（带相似度分数），基于字符串精确匹配的 `switch` 永远
   匹配不上。我把 `mapStatus` 改成按 `code[0]` 匹配，并加了回归测试。这是
   最有价值的一次纠正——静默出错的状态比崩溃更糟。
3. **否决：一个掩盖真实问题的单元测试建议。** 代理给"删除文件"写的第一个
   测试在没有提交的情况下 stage 了删除，然后断言 diff 能显示它。测试失败了。
   代理想改断言；我改去核对 git 语义——`base...HEAD` 只比较提交，测试场景
   本身不成立。我把场景改成先提交再 diff，代码保持不变。用错误的方式测试
   工具，会掩盖未来的真实回归。
4. **纠正：默认分支假设。** 代理最初保留了 `baseRef ?? "main"` 并称可以接受。
   我在一个 HEAD 是 `main` 且没有任何 `origin/HEAD` 的仓库上演示了空报告；
   硬编码默认值被否决，换成带回退的自动探测。

## 用于验证结果的命令及相应的结果

| 命令 | 结果 |
|---|---|
| `npm install` | 成功（esbuild 有 1 条 allow-scripts 警告，不阻塞） |
| `npm run typecheck` | 通过，严格模式，无错误 |
| `npm test` | **31/31 通过**（原来是 1/1） |
| `npm run inspector -- review --repo .` | 退出码 0；报告列出未跟踪文件（原来为空） |
| `npm run inspector -- review --repo . --validate "git rev-parse HEAD~1"` | 退出码 0；校验记录为 **failed**（原来：崩溃，退出码 1） |
| 临时仓库 `--validate "node -e process.exit(1)"`（端到端） | 退出码 **2**，报告含 `[failed, exit 1]`（校验失败可被 CI 感知） |
| 无关历史仓库（fetch 后 `base...HEAD` 无共同祖先） | 返回 "No merge base … fetch --unshallow" 可操作错误（原来：原始 fatal 崩溃） |
| `npm run inspector -- review --repo . --format json` | 退出码 0；合法 JSON 写入 `review-report.json` |
| `npm run inspector -- review --repo "<带空格的路径>"` | 退出码 0；路径完整解析，报告已写入（原来：路径被截断） |
| `npm run inspector -- --help` | 打印用法；未知选项 `--format xml` → 退出码 1 并报清晰错误 |
| MCP stdio JSON-RPC `tools/call` 传 `repoPath` | 返回 `# Review Report: <路径>`（原来是 `undefined`） |
| `git diff --name-status -M <base>...HEAD`（在临时仓库手动执行） | 确认了解析测试所依据的 `R100`/`A`/`D`/`M` 原始格式 |

## 你遇到的一个阻碍，以及你是如何应对的

最顽固的是 rename 检测。报告声称一个 rename 是路径为 `c.txt\trenamed.txt`
的 `modified` 文件——一个说不通的 tab 拼接字符串。我没有去修补症状，而是在
shell 里建了一个一次性的临时仓库，直接运行 `git diff --name-status -M` 看
原始输出：`R100\tc.txt\trenamed.txt`。状态码带相似度分数（`R100`），这让
精确匹配的 `switch` 失效。把解析器改成按首字符匹配解决了问题，也让我能基于
git 的**真实**输出（而不是想象的输出）写回归测试。经验是：当一个解析 bug
屡修不好时，别再读代码了，去问底层命令它到底输出了什么。

## 已知限制，以及你接下来会做的三件事

限制：校验串行执行且共享一个全局超时；输出截断可能切掉超长日志中有意义的
尾部；只审查已提交 diff，不审查仅存在于工作区的变更；MCP 响应是纯文本而不是
每个工具结果的结构化 JSON；rename 相似度阈值用 git 默认值。

接下来三件事：
1. 增加 `--staged`/工作区审查模式，让开发者可以检查未提交的变更——这是最
   自然的下一个用户需求。
2. 并行化相互独立的校验，支持按命令设置超时和可配置的并发上限，同时保持
   报告中的顺序。
3. 让 MCP 工具返回结构化 JSON（带类型化 `changedFiles`/`validationResults`
   的结果 schema），让 AI 客户端直接消费数据而不是解析散文。

## 大致的专注工作时长

- 开始时间：18:30（2026-08-17）
- 结束时间：约 19:50（2026-08-17）
