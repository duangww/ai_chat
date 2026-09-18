/**
 * 按 MCP_TOOLSET 注册工具，并可再按 SAP ZTOOL 白名单裁剪。
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SapClient } from "../sap-client.js";
import type { McpToolset } from "../types.js";
import type { AllowedTools } from "./allowed.js";
import { registerDemoTools } from "./demo/register.js";
import { registerProfitTools } from "./profit/register.js";

export function registerAllTools(
  server: McpServer,
  client: SapClient,
  toolset: McpToolset = "profit",
  allowed?: AllowedTools
): void {
  if (toolset === "profit" || toolset === "all") {
    registerProfitTools(server, client, allowed);
  }
  if (toolset === "demo" || toolset === "all") {
    registerDemoTools(server, client, allowed);
  }
}
