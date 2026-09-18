import "../config.js";
import type { Express, Request, Response } from "express";
import {
  createOAuthMetadata,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { HttpServerConfig } from "../types.js";
import type { SapOAuthProvider } from "./oauth-provider.js";
import { cookiePathFromPublicUrl } from "./session.js";

export function publicMcpUrl(http: HttpServerConfig): string {
  if (http.publicUrl) return `${http.publicUrl}${http.path}`;
  return `http://${http.host}:${http.port}${http.path}`;
}

export function publicLoginPath(http: HttpServerConfig): string {
  const base = cookiePathFromPublicUrl(http.publicUrl);
  return `${base === "/" ? "" : base}/login`;
}

export function publicApiBase(http: HttpServerConfig): string {
  const base = cookiePathFromPublicUrl(http.publicUrl);
  return base === "/" ? "" : base;
}

export function resourceMetadataUrl(http: HttpServerConfig): string | undefined {
  if (!http.publicUrl) return undefined;
  return `${http.publicUrl}/.well-known/oauth-protected-resource${http.path}`;
}

function withCors(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

/**
 * SDK 用 new URL('/authorize', issuer) 会丢掉路径前缀，
 * 变成 http://host/authorize。经 Nginx 的 /mcp-sap-bak-dev/ 反代时必须改回带前缀的地址。
 */
export function prefixedOAuthMetadata(
  http: HttpServerConfig,
  raw: ReturnType<typeof createOAuthMetadata>
) {
  const base = http.publicUrl;
  if (!base) return raw;
  return {
    ...raw,
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: raw.registration_endpoint
      ? `${base}/register`
      : undefined,
    revocation_endpoint: raw.revocation_endpoint
      ? `${base}/revoke`
      : undefined,
  };
}

export function mountOAuthRoutes(
  app: Express,
  opts: { provider: SapOAuthProvider; http: HttpServerConfig }
): void {
  const { provider, http } = opts;
  if (!http.publicUrl) return;

  const issuerUrl = new URL(http.publicUrl);
  const resourceServerUrl = new URL(`${http.publicUrl}${http.path}`);
  const oauthMetadata = prefixedOAuthMetadata(
    http,
    createOAuthMetadata({
      provider,
      issuerUrl,
      baseUrl: issuerUrl,
      scopesSupported: ["mcp:tools"],
    })
  );
  const protectedResource = {
    resource: resourceServerUrl.href,
    authorization_servers: [http.publicUrl],
    scopes_supported: ["mcp:tools"],
    resource_name: http.serverName,
  };

  const sendAs = (_req: Request, res: Response) => {
    withCors(res);
    res.json(oauthMetadata);
  };
  const sendPrm = (_req: Request, res: Response) => {
    withCors(res);
    res.json(protectedResource);
  };
  const preflight = (_req: Request, res: Response) => {
    withCors(res);
    res.status(204).end();
  };

  // 必须挂在 mcpAuthRouter 之前，否则 SDK 会下发丢掉前缀的错误地址
  app.options("/.well-known/oauth-authorization-server", preflight);
  app.get("/.well-known/oauth-authorization-server", sendAs);
  app.options("/.well-known/oauth-protected-resource", preflight);
  app.get("/.well-known/oauth-protected-resource", sendPrm);
  app.options("/.well-known/oauth-protected-resource/mcp", preflight);
  app.get("/.well-known/oauth-protected-resource/mcp", sendPrm);

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      baseUrl: issuerUrl,
      resourceServerUrl,
      resourceName: http.serverName,
      scopesSupported: ["mcp:tools"],
      authorizationOptions: { rateLimit: false },
      tokenOptions: { rateLimit: false },
      clientRegistrationOptions: { rateLimit: false },
    })
  );
}
