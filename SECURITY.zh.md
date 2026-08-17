# 提交你的测评（这并非真实的安全策略）

本仓库是 **AI 优先工程实习生测评的起始模板**，并非生产项目 —— 没有任何
实际的线上部署可供你报告漏洞。

我们使用 GitHub 的私有漏洞报告表单（private-vulnerability-reporting）
作为本次测评的 **提交表单**，因为这是 GitHub 提供的唯一一种机制：每位
提交者的报告仅对提交者本人和我们对可见，其他候选人永远无法看到。

## 当你准备提交时

点击本仓库的 **Security** → **Report a vulnerability**（安全 → 报告漏洞）
（或使用[此链接](../../security/advisories/new)），并填写以下内容：

- **标题（Title）**：你的姓名，以及你的 Lever 候选人/机会 ID（如有）
  （例如 `Jane Doe — assessment submission`）
- **描述（Description）**：请分行包含：
  - `Name:` 你的全名
  - `Email:` 你申请时使用的邮箱地址
  - `Repo:` 指向 **你自己副本** 的该仓库的完整 HTTPS URL
    （即你通过 “Use this template” 创建并推送了工作成果的那个仓库）
  - 任何其他你希望我们在阅读 `SUBMISSION.md` 之前了解的内容

你无需填写严重等级（severity）、CVE 编号或受影响版本等字段 ——
将那些保持默认/留空即可。

这是唯一一个需要你回复操作的步骤。其余一切（评分、截止时间快照、打分）
在我们收到你的提交后会自动运行。
