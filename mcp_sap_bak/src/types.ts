/** 共享配置类型（各业务工具类型放在 tools/<域>/types.ts） */

/** profit=生产运营指标；demo=DEV 物料/库存；all=本机调试全开 */
export type McpToolset = "profit" | "demo" | "all";

export interface SapClientConfig {
  /**
   * SAP 网关基址（不含 ACTION），如：
   * http://192.168.1.164:8020/zbak_inf
   * http://192.168.1.162:8010/zbak_mcp_demo
   */
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  /** 业务账号（Workbuddy Token 解析出的 SAP 用户），写入 JSON 字段 uname */
  mcpUser?: string;
}

/** Streamable HTTP MCP 监听配置 */
export interface HttpServerConfig {
  host: string;
  port: number;
  /** MCP 路径，如 /mcp */
  path: string;
  /** 若设置，则要求 Authorization: Bearer <token> */
  authToken?: string;
  /** Host 头白名单（经 Nginx 反代时填公网域名） */
  allowedHosts?: string[];
  /** MCP 服务名，health / 日志用，如 mcp-sap-bak-dev */
  serverName: string;
  /** 本实例注册哪些工具 */
  toolset: McpToolset;
  /** 管理页密码；未配置则不挂载 /admin */
  adminPassword?: string;
  /** 账号-Token 映射文件 */
  accountsFile: string;
  /** 加密 SAP 密码用的密钥 */
  accountsKey: string;
  /**
   * 对外访问根地址（经 Nginx 反代），如 http://192.168.1.177/mcp-sap-bak-dev
   * 用于登录页 mcp.json 片段、OAuth issuer、401 发现地址
   */
  publicUrl?: string;
  /** 用户自助登录 Token 有效期 */
  loginTtlMs: number;
}
