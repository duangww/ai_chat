#!/usr/bin/env node
/**
 * Streamable HTTP 入口（默认）
 * 服务名：mcp-sap-bak — bak 组织 SAP 系统 MCP 工具合集
 */

import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { fetchSapAllowedTools } from "./accounts/sap-tools.js";
import { deriveKey } from "./accounts/crypto.js";
import { AccountStore } from "./accounts/store.js";
import { mountAdminRoutes } from "./admin/routes.js";
import { mountOAuthRoutes, publicLoginPath, resourceMetadataUrl } from "./auth/oauth.js";
import { SapOAuthProvider } from "./auth/oauth-provider.js";
import { mcpUnauthorized, mountLoginRoutes } from "./auth/routes.js";
import { loadConfig, loadHttpConfig } from "./config.js";
import { createSapMcpServer } from "./create-server.js";
import { SapClient } from "./sap-client.js";
import type { AllowedTools } from "./tools/allowed.js";
import type { HttpServerConfig, McpToolset, SapClientConfig } from "./types.js";

type SapIdentity = {
  sapUser: string;
  source: "account" | "legacy";
};

function extractBearer(header: string): string | undefined {
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  if (header && !header.toLowerCase().startsWith("basic ")) {
    return header.trim() || undefined;
  }
  return undefined;
}

function tokenEq(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function resolveIdentity(
  req: Request,
  store: AccountStore,
  sap: SapClientConfig,
  legacyToken: string | undefined
): SapIdentity | null {
  const raw = extractBearer(String(req.headers.authorization || ""));
  if (!raw) return null;

  const account = store.resolveByToken(raw);
  if (account) {
    return {
      sapUser: account.sap_username,
      source: "account",
    };
  }

  if (legacyToken && tokenEq(raw, legacyToken)) {
    return {
      sapUser: sap.username,
      source: "legacy",
    };
  }

  return null;
}

function mcpAuth(
  store: AccountStore,
  sap: SapClientConfig,
  http: HttpServerConfig,
  metadataUrl?: string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const mustAuth = Boolean(
      http.authToken || http.publicUrl || store.list().length > 0
    );
    if (!mustAuth) {
      next();
      return;
    }
    const identity = resolveIdentity(req, store, sap, http.authToken);
    if (!identity) {
      mcpUnauthorized(res, metadataUrl);
      return;
    }
    (req as Request & { sapIdentity: SapIdentity }).sapIdentity = identity;
    next();
  };
}

async function handleMcp(
  req: Request,
  res: Response,
  sap: SapClientConfig,
  options: { name: string; toolset: McpToolset }
): Promise<void> {
  const identity = (req as Request & { sapIdentity?: SapIdentity }).sapIdentity;
  const client = new SapClient({
    ...sap,
    mcpUser: identity?.sapUser,
  });

  let allowedTools: AllowedTools;
  try {
    const sapTools = await fetchSapAllowedTools(client);
    allowedTools = sapTools.includes("*") ? undefined : sapTools;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32001, message },
      id: req.body?.id ?? null,
    });
    return;
  }

  const server = createSapMcpServer(client, {
    ...options,
    allowedTools,
  });
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

async function main(): Promise<void> {
  const sap = loadConfig();
  const http = loadHttpConfig();
  const store = new AccountStore(http.accountsFile);

  const app = createMcpExpressApp({
    host: http.host,
    allowedHosts: http.allowedHosts,
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: http.serverName,
      toolset: http.toolset,
      sap: sap.baseUrl,
      accounts: store.list().length,
      login: "/login",
    });
  });

  const oauth = http.publicUrl
    ? new SapOAuthProvider(store, {
        sessionSecret: http.accountsKey,
        accountsKey: deriveKey(http.accountsKey),
        loginTtlMs: http.loginTtlMs,
        loginPath: publicLoginPath(http),
      })
    : undefined;

  if (oauth) {
    mountOAuthRoutes(app, { provider: oauth, http });
  }

  mountLoginRoutes(app, { store, sap, http, oauth });

  if (http.adminPassword) {
    mountAdminRoutes(app, {
      adminPassword: http.adminPassword,
      store,
      sap,
    });
  }

  const metadataUrl = resourceMetadataUrl(http);
  const auth = mcpAuth(store, sap, http, metadataUrl);
  const mcpOpts = { name: http.serverName, toolset: http.toolset };

  app.post(http.path, auth, (req, res) => {
    void handleMcp(req, res, sap, mcpOpts);
  });

  app.get(http.path, auth, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });
  app.delete(http.path, auth, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  app.listen(http.port, http.host, () => {
    const authHint = http.publicUrl
      ? `用户登录 ${http.publicUrl}/login`
      : http.authToken
        ? "Bearer token 已启用"
        : "未设置 MCP_AUTH_TOKEN（可用管理页账号 Token 或 /login）";
    console.error(
      `${http.serverName} [${http.toolset}] Streamable HTTP listening on http://${http.host}:${http.port}${http.path} (${authHint})`
    );
    console.error(`SAP gateway: ${sap.baseUrl}`);
    console.error(`health: http://${http.host}:${http.port}/health`);
    console.error(`login: http://${http.host}:${http.port}/login`);
    if (http.adminPassword) {
      console.error(`admin: http://${http.host}:${http.port}/admin`);
      console.error(`accounts file: ${http.accountsFile}`);
    }
  });
}

main().catch((err) => {
  console.error("MCP HTTP server failed to start:", err);
  process.exit(1);
});
