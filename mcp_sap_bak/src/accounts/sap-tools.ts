import type { SapClient } from "../sap-client.js";

export interface SapMcpLoginResponse {
  type?: string;
  message?: string;
  user_id?: string;
  user_name?: string;
  tools?: Array<string | { tool?: string; tool_text?: string }>;
}

export async function fetchSapAllowedTools(
  client: SapClient
): Promise<string[]> {
  const result = await client.postAction<SapMcpLoginResponse>("MCP_LOGIN", {});
  if (String(result.type || "").toUpperCase() !== "S") {
    throw new Error(result.message || "SAP MCP 登录失败，请检查账号权限");
  }
  const tools = Array.isArray(result.tools) ? result.tools : [];
  return tools
    .map((item) => {
      if (typeof item === "string") return item.trim().toUpperCase();
      return String(item?.tool || "").trim().toUpperCase();
    })
    .filter(Boolean);
}
