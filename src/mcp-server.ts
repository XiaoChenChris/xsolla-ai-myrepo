#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";

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
    const report = await reviewRepository({
      repositoryPath: repoPath,
      baseRef,
      validationCommands,
      format,
    });
    return { content: [{ type: "text", text: report }] };
  },
);

await server.connect(new StdioServerTransport());
