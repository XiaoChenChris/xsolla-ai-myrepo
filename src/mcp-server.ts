#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";
import { renderReport } from "./report.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

server.tool(
  "review_repository",
  "Inspects a Git repository and returns a review report.",
  {
    repoPath: z.string().describe("Repository path to inspect."),
    baseRef: z.string().optional().describe("Base ref to diff against (defaults to the repository's default branch)."),
    validationCommands: z.array(z.string()).optional().describe("Shell commands to run as validations."),
    format: z.enum(["markdown", "json"]).optional().describe("Report format (default: markdown)."),
  },
  async ({ repoPath, baseRef, validationCommands, format }) => {
    try {
      const result = await reviewRepository({
        repositoryPath: repoPath,
        baseRef,
        validationCommands,
        format,
      });
      const report = renderReport(result, format ?? "markdown");
      return { content: [{ type: "text", text: report }] };
    } catch (error) {
      // 返回结构化错误而非抛异常：MCP 客户端（AI 代理）可能触达不可信
      // 路径，JSON-RPC 级别的错误响应对它没有可操作性。
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Review failed: ${message}` }],
      };
    }
  },
);

await server.connect(new StdioServerTransport());
