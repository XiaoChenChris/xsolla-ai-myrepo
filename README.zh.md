# 仓库检查器（Repository Inspector）

这是一个轻量级的 TypeScript 开发者工具，用于检查 Git 仓库中的变更、运行可选的
校验命令，并生成 Markdown 格式的报告。它可以通过命令行使用，也可以通过 MCP
暴露给 AI 客户端调用。

## 你的任务

调查这个仓库，并按照你判断的最佳方式对其进行改进。初始版本只适用于狭窄的
“理想路径”（happy path），但在实际生产环境中，可能会暴露出正确性、安全性、
可靠性、契约、输出、文档或测试等方面的缺陷。

我们不要求你完成所有内容。我们更看重你如何调查、排序优先级、实现、验证，
并清晰地解释一个有意义的改进范围。

## 产品决策

这个工具可能同时被开发者直接使用和被 AI 编码代理使用。请决定将它的生产
接口应该以 **CLI 优先**、**MCP 优先**，还是 **混合模式** 为主。你实现的
改进应当与你做出的决策保持一致。

我们不预设任何特定标签。请解释：

- 你所假设的主要用户和使用执行环境。
- 信任边界以及允许的能力范围。
- 可靠性、可发现性、延迟/上下文、以及输出体积之间的取舍权衡。
- 你持续对外提供的接口如何保持行为上的一致性。
- 什么样的证据会改变你的决策。

## 时间与规则

- 在收到邀请后的 48 小时内，最多投入 **90 分钟的高度专注时间**。
- 可以自由使用 AI 编码工具。请验证它们的工作成果，并记录至少一条你
  纠正或否决的建议。
- 在你基于本模板创建的独立仓库中开展工作。
- 在工作过程中持续提交（commit），并在最后一次提交中完成 `SUBMISSION.md`。
- 是否全部完成并非硬性要求。准确的范围界定与验证，比一个庞大的 diff 更重要。

## 环境搭建

```bash
npm install
npm run typecheck
npm test
```

## 命令行（CLI）

```bash
npm run inspector -- review --repo ./path/to/repo --format markdown
npm run inspector -- review --repo ./path/to/repo --validate "npm test"
```

报告将被写入 `review-report.md`。

## MCP

使用以下命令启动 stdio 服务器：

```bash
npm run mcp-server
```

它会暴露一个名为 `review_repository` 的工具。请检查其实现，以确定它当前
的输入契约，以及是否符合你所提议的生产模型。

## 项目结构

```text
src/core.ts        共享的审查编排逻辑
src/cli.ts         命令行适配器
src/mcp-server.ts  MCP 适配器
src/git.ts         Git 检查逻辑
src/validation.ts  校验执行逻辑
src/report.ts      Markdown 报告生成
test/              公开的起始测试
```

完成后，请通过本仓库的 **Security → Report a vulnerability**（安全 → 报告漏洞）
入口提交 —— 具体需要包含的内容请参阅 `SECURITY.md`。请勿通过邮件回复；
该邮件提交渠道无人监控。
