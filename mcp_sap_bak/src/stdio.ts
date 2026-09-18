#!/usr/bin/env node
/**
 * stdio MCP 入口（本机 Cursor / Inspector 调试用）
 * 服务名：mcp-sap-bak
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, loadHttpConfig } from "./config.js";
import { createSapMcpServer } from "./create-server.js";
import { SapClient } from "./sap-client.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const http = loadHttpConfig();
  const client = new SapClient(config);
  const server = createSapMcpServer(client, {
    name: http.serverName,
    toolset: http.toolset,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP stdio server failed to start:", err);
  process.exit(1);
});
