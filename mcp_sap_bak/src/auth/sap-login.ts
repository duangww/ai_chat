import { SapApiError } from "../sap-client.js";
import { SapClient } from "../sap-client.js";
import type { SapClientConfig } from "../types.js";
import { fetchSapAllowedTools } from "../accounts/sap-tools.js";

export interface SapLoginOk {
  sap_username: string;
  tools: string[];
}

/**
 * 用用户自己的 SAP 账号/密码打 ICF MCP_LOGIN。
 * 成功说明密码正确，且该账号在 AGR_1251 里有 ZMCP 工具权限。
 */
export async function verifySapUserLogin(
  sap: SapClientConfig,
  username: string,
  password: string
): Promise<SapLoginOk> {
  const sapUser = username.trim().toUpperCase();
  if (!sapUser) throw new Error("请输入 SAP 账号");
  if (!password) throw new Error("请输入 SAP 密码");

  const client = new SapClient({
    ...sap,
    username: sapUser,
    password,
    mcpUser: sapUser,
  });

  try {
    const tools = await fetchSapAllowedTools(client);
    return { sap_username: sapUser, tools };
  } catch (err) {
    if (err instanceof SapApiError && err.status === 401) {
      throw new Error("SAP 账号或密码错误");
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/401|unauthorized|logon|password|passwd|登录/i.test(message)) {
      throw new Error("SAP 账号或密码错误");
    }
    throw new Error(message);
  }
}
