import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import type { HttpServerConfig, McpToolset, SapClientConfig } from "./types.js";

/**
 * 从「包根目录」加载 .env（不依赖进程 cwd）。
 * 已存在的 process.env 优先（Cursor MCP 的 env 不会被覆盖）。
 */
function loadEnvFile(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/config.ts → 项目根；dist/config.js → 项目根
  const root = path.resolve(here, "..");
  const envPath = path.join(root, ".env");

  if (existsSync(envPath)) {
    // quiet: 禁止 dotenv 往 stdout 打日志，避免污染 MCP stdio
    loadDotenv({ path: envPath, override: false, quiet: true });
  }
}

loadEnvFile();

const publicUrlRaw = process.env.MCP_PUBLIC_URL?.trim();
if (
  publicUrlRaw?.startsWith("http://") &&
  !process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL
) {
  process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL = "true";
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `缺少环境变量 ${name}：请复制 .env.example 为 .env 并填写，或在 MCP 配置的 env 中传入`
    );
  }
  return value;
}

/**
 * 网关基址不含 ACTION。若旧配置仍带 ?ACTION=GET_PROFIT，自动剥掉以兼容多工具。
 */
export function normalizeSapBaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.delete("ACTION");
    let out = url.toString();
    if (out.endsWith("?")) out = out.slice(0, -1);
    return out;
  } catch {
    return raw
      .replace(/([?&])ACTION=[^&]*/i, "$1")
      .replace(/\?&/, "?")
      .replace(/[?&]$/, "");
  }
}

export function parseToolset(raw?: string): McpToolset {
  const value = (raw ?? "profit").trim().toLowerCase();
  if (value === "profit" || value === "demo" || value === "all") {
    return value;
  }
  throw new Error(
    `MCP_TOOLSET 无效：${raw}（允许 profit / demo / all，默认 profit）`
  );
}

export function loadConfig(): SapClientConfig {
  const raw = requireEnv(
    "SAP_BASE_URL",
    "http://192.168.1.164:8020/zbak_inf"
  );
  return {
    baseUrl: normalizeSapBaseUrl(raw),
    username: requireEnv("SAP_USERNAME"),
    password: requireEnv("SAP_PASSWORD"),
    timeoutMs: Number(process.env.SAP_TIMEOUT_MS ?? "30000"),
  };
}

/** Streamable HTTP 服务配置 */
export function loadHttpConfig(): HttpServerConfig {
  const pathEnv = process.env.MCP_PATH ?? "/mcp";
  const mcpPath = pathEnv.startsWith("/") ? pathEnv : `/${pathEnv}`;
  const toolset = parseToolset(process.env.MCP_TOOLSET);
  const defaultName =
    toolset === "demo" ? "mcp-sap-bak-dev" : "mcp-sap-bak";

  const allowedHostsRaw = process.env.MCP_ALLOWED_HOSTS?.trim();
  const allowedHosts = allowedHostsRaw
    ? allowedHostsRaw
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean)
    : undefined;

  const loginTtlHours = Number(process.env.MCP_LOGIN_TTL_HOURS ?? "");
  const loginTtlDays = Number(process.env.MCP_LOGIN_TTL_DAYS ?? "30");
  const publicUrl = process.env.MCP_PUBLIC_URL?.trim().replace(/\/+$/, "") || undefined;

  return {
    host: process.env.MCP_HOST ?? "127.0.0.1",
    port: Number(process.env.MCP_PORT ?? "3100"),
    path: mcpPath,
    authToken: process.env.MCP_AUTH_TOKEN?.trim() || undefined,
    allowedHosts,
    serverName: process.env.MCP_SERVER_NAME?.trim() || defaultName,
    toolset,
    adminPassword: process.env.MCP_ADMIN_PASSWORD?.trim() || undefined,
    accountsFile: path.resolve(
      process.env.MCP_ACCOUNTS_FILE?.trim() || "data/mcp-accounts.json"
    ),
    accountsKey:
      process.env.MCP_ACCOUNTS_KEY?.trim() ||
      process.env.MCP_ADMIN_PASSWORD?.trim() ||
      process.env.MCP_AUTH_TOKEN?.trim() ||
      "dev-only-mcp-accounts-key",
    publicUrl,
    loginTtlMs: Number.isFinite(loginTtlHours) && loginTtlHours > 0
      ? loginTtlHours * 60 * 60 * 1000
      : Number.isFinite(loginTtlDays) && loginTtlDays > 0
        ? loginTtlDays * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000,
  };
}
