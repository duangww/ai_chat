/**
 * 创建 mcp-sap-bak 服务实例并按 MCP_TOOLSET 注册工具（stdio / HTTP 共用）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SapClient } from "./sap-client.js";
import { registerAllTools } from "./tools/index.js";
import type { AllowedTools } from "./tools/allowed.js";
import type { McpToolset } from "./types.js";

export const MCP_SERVER_NAME = "mcp-sap-bak";
export const MCP_SERVER_VERSION = "1.0.0";

export function createSapMcpServer(
  client: SapClient,
  options?: { name?: string; toolset?: McpToolset; allowedTools?: AllowedTools }
): McpServer {
  const name = options?.name?.trim() || MCP_SERVER_NAME;
  const toolset = options?.toolset ?? "profit";
  const server = new McpServer({
    name,
    version: MCP_SERVER_VERSION,
  });
  registerAllTools(server, client, toolset, options?.allowedTools);
  return server;
}
